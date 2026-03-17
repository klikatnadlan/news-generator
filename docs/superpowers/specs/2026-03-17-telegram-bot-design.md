# Telegram Bot for News Content Management — Design Spec

**Date:** 2026-03-17
**Project:** news-generator-deploy (KlikaVault daily news system)
**Scope:** Level 1 — content management via Telegram (no system modifications)

## Problem

Ben Solomon manages daily real estate news content through a web UI. He needs to do this from his phone without opening a computer. The existing system has 12 API endpoints that handle all content logic — we need a mobile-friendly interface on top of them.

## Solution

A Telegram bot that acts as a thin interface layer over the existing API routes. Zero code duplication — the bot imports and calls the same functions the web UI uses.

## Architecture

```
Ben (Telegram) <-> Telegram Bot API <-> Vercel Webhook (/api/telegram)
                                              |
                                     Direct function imports:
                                     scoreNews, generateWhatsAppText,
                                     generateDailyDigest, generateArticle,
                                     generateMergedNarrative, refineText,
                                     checkHumanityScore, generateCommentary
                                              |
                                     External APIs (same keys):
                                     ElevenLabs TTS/STT, Supabase
```

All logic is called via direct imports (not HTTP to self). This saves time and avoids cold-start overhead.

## Daily Flow

1. **06:00 UTC** — existing cron scan runs (`/api/cron/scan`)
2. **05:00 UTC (08:00 Israel Summer / 07:00 Israel Winter)** — cron calls `/api/telegram/morning` which sends Ben the top 3 news with inline buttons
3. **Ben interacts** — taps buttons, sends text corrections, sends voice recordings
4. **Bot responds** — generates content, refines text, sends audio files

Note: Israel switches between UTC+2 (winter) and UTC+3 (summer). 05:00 UTC covers both seasons reasonably (07:00-08:00 local).

## Commands & Interactions

### Slash Commands
| Command | Action | Style Default |
|---------|--------|---------------|
| `/start` | Welcome message with usage instructions | — |
| `/news` | Show today's top 6 news with scores | — |
| `/digest` | Generate daily digest from top 3 | regular |
| `/generate N` | Generate WhatsApp text for news item N | regular |
| `/merge` | Auto-generate texts for top 3 then merge into one narrative | — |
| `/article` | Expand last generated text to full article | — |
| `/voice` | Convert last generated text to Ben's voice (MP3 file) | — |
| `/commentary` | Generate structured Ben Solomon commentary on last news | — |
| `/status` | Show last scan time, news count, system health | — |
| `/cancel` | Cancel a running generation | — |

### Natural Interactions (no slash needed)
| Ben sends | Bot does |
|-----------|----------|
| Text message | AI refine on last generated text (e.g., "תשנה את הפתיח") |
| Voice message 🎤 | STT → AI refine on last generated text |

### Inline Buttons (on bot messages)
After showing news: `[📌 דייג'סט]` `[📝 נוסח נפרד]` `[📰 כתבה]` `[💬 פרשנות]`
After generating text: `[📋 שלח כטקסט]` `[🔊 קול בן]` `[📰 הרחב לכתבה]` `[🧪 ציון אנושיות]`

Note: Telegram cannot copy to clipboard. "📋 שלח כטקסט" re-sends the text as a plain message that Ben can easily select and copy.

## Async Pattern for Long Operations

**Critical constraint:** Vercel Hobby has a 10-second function timeout. Claude API calls for generation/articles can take 15-30 seconds.

**Solution: Immediate response + background job via Supabase queue**

1. Webhook receives request (e.g., "create digest")
2. Handler immediately sends "⏳ מייצר דייג'סט..." to Telegram
3. Handler inserts job into `telegram_jobs` table with status `pending`
4. Handler returns HTTP 200 (webhook done, under 2 seconds)
5. A separate cron route `/api/telegram/worker` runs every 30 seconds
6. Worker picks up pending jobs, executes the slow operation, sends result to Telegram
7. Worker marks job as `completed`

**New table: `telegram_jobs`**
```sql
CREATE TABLE telegram_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  job_type TEXT NOT NULL, -- 'digest' | 'generate' | 'article' | 'merge' | 'refine' | 'tts' | 'voice_refine' | 'humanity' | 'commentary'
  params JSONB NOT NULL, -- job-specific parameters
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result_text TEXT,
  reply_to_message_id BIGINT, -- the "generating..." message to edit
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_telegram_jobs_pending ON telegram_jobs(status) WHERE status = 'pending';
```

**Which operations need async:**
- `/digest`, `/generate`, `/article`, `/merge`, `/commentary` — Claude API (5-30s)
- `/voice` — ElevenLabs TTS (3-8s)
- Voice message processing — STT + refine (6-10s combined)
- `/news`, `/status`, `/start`, text refine — fast enough for sync (<5s)

**Debounce:** Before creating a job, check if a `pending` or `running` job already exists for this chat_id. If so, respond "⏳ כבר מעבד בקשה קודמת, חכה רגע..." to prevent double-taps.

## Session State

Each chat maintains state in Supabase:

**New table: `telegram_sessions`**
```sql
CREATE TABLE telegram_sessions (
  chat_id BIGINT PRIMARY KEY,
  last_generated_text TEXT,
  last_news_ids TEXT[],
  last_type TEXT, -- 'digest' | 'message' | 'article' | 'commentary'
  last_news_item_id TEXT, -- single news item for /article context
  last_message_id BIGINT, -- bot message ID for editing
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Security

- **`TELEGRAM_ALLOWED_USER_IDS`** env var — comma-separated Telegram user IDs (Ben + Ori)
- Every incoming update checked against allowlist before any processing
- Unauthorized users get: "אין הרשאה. הבוט זמין רק למשתמשים מורשים."
- Webhook verified via `X-Telegram-Bot-Api-Secret-Token` header matching `TELEGRAM_WEBHOOK_SECRET`

## Implementation Details

### Webhook Handler (`/api/telegram/route.ts`)

Single POST handler that:
1. Verifies `X-Telegram-Bot-Api-Secret-Token` header
2. Checks user authorization against `TELEGRAM_ALLOWED_USER_IDS`
3. Parses update type (message, callback_query, voice)
4. For fast operations: execute and respond synchronously
5. For slow operations: send "generating..." message, queue job, return 200
6. All Telegram API calls use raw `fetch` (no library)

Config: `export const maxDuration = 10;`

### Worker Route (`/api/telegram/worker/route.ts`)

GET handler triggered by Vercel cron every 30 seconds:
1. Query `telegram_jobs` for oldest `pending` job
2. Mark as `running`
3. Execute the operation (import functions directly from `lib/anthropic.ts`)
4. Send result to Telegram (edit the "generating..." message or send new message)
5. Update session state in `telegram_sessions`
6. Mark job as `completed`

Config: `export const maxDuration = 60;` (requires Vercel Pro for >10s, or we process fast jobs only and chain slow ones)

**Important Vercel plan consideration:** If on Hobby (10s limit), the worker itself may timeout on article generation. Options:
- Upgrade to Vercel Pro ($20/mo) for 60s timeout — recommended
- Or keep on Hobby and limit to fast operations (refine, short generate) while articles are web-only

### Morning Notification (`/api/telegram/morning/route.ts`)

GET handler triggered by Vercel cron:
1. Import and call the news fetching logic directly (not HTTP)
2. Format top 3 as Telegram message with inline keyboard
3. Send to each authorized user
4. Also show brief score explanation

Config: `export const maxDuration = 10;`

### Voice Message Handling

When Ben sends a voice message:
1. Download audio file from Telegram servers via `file_id`
2. Forward to ElevenLabs STT (import from existing logic)
3. Use transcription as AI refine instruction
4. Apply to `last_generated_text` from session
5. Send back updated text + update session

This is a 2-step API call (STT ~3s + refine ~3s = ~6s). Should fit in 10s sync, but queued as async job for safety.

### TTS Response

When Ben requests voice (`/voice` or button):
1. Queue as async job
2. Worker generates audio via ElevenLabs TTS
3. Worker sends audio as Telegram `sendAudio` (downloadable MP3 file)
4. Telegram shows play button + download option natively

### Message Formatting

- Hebrew RTL works natively in Telegram
- Bold: `*text*` (Telegram Markdown)
- Long texts (>4096 chars): split into messages, first gets buttons
- Articles: send as document (.txt file) if over 4096 chars, with a summary message

### Copy Workaround

Telegram bots cannot copy to clipboard. When Ben taps "📋 שלח כטקסט":
- Bot re-sends the full text as a plain message (no formatting)
- Ben can tap-and-hold to select all and copy
- Alternatively, send as a code block (``` `) which Telegram renders with a copy button

## Environment Variables (New)

```
TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_ALLOWED_USER_IDS=<ben_id>,<ori_id>
TELEGRAM_WEBHOOK_SECRET=<random 32-char string>
```

## Vercel Cron Update

Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/scan", "schedule": "0 6 * * *" },
    { "path": "/api/telegram/morning", "schedule": "0 5 * * *" },
    { "path": "/api/telegram/worker", "schedule": "*/1 * * * *" }
  ]
}
```

Note: Worker runs every minute. Each invocation processes one pending job. Vercel Hobby crons minimum interval is 1 day for free, but on Pro it's every minute. Alternative: use Supabase Edge Function or external cron service (cron-job.org) to ping the worker URL.

**Simplified alternative if Hobby:** Skip the worker cron entirely. Instead, use Vercel's `waitUntil` API (available in Next.js 15) to continue processing after returning the webhook response. This keeps everything in one function call but extends processing time up to 60s on Pro.

## Dependencies

**New npm packages:** none — raw Telegram Bot API via fetch.

## Files Changed/Created

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/telegram/route.ts` | CREATE | Webhook handler |
| `src/app/api/telegram/morning/route.ts` | CREATE | Morning notification cron |
| `src/app/api/telegram/worker/route.ts` | CREATE | Async job processor |
| `src/lib/telegram.ts` | CREATE | Telegram API helpers (sendMessage, sendAudio, editMessage, answerCallback, sendDocument) |
| `src/lib/telegram-handlers.ts` | CREATE | Command/message/callback handler functions |
| `vercel.json` | MODIFY | Add morning + worker crons |
| Supabase | MODIFY | Add telegram_sessions + telegram_jobs tables |

## Error Handling

- **API failures:** Bot sends "שגיאה ביצירת הנוסח. נסו שוב." with inline retry button
- **Job timeout:** Worker marks job as `failed` after 55 seconds, sends error to chat
- **STT failure:** "לא הצלחתי לתמלל. נסה שוב או כתוב את התיקון בטקסט."
- **No session state:** If Ben sends a correction but no text was generated yet: "אין טקסט לתקן. שלח /digest או /news קודם."
- **Telegram API failure:** Log error, retry once after 1 second
- **Debounce:** If job already pending for this chat, respond "⏳ עדיין מעבד..."

## History Tracking

All generated content from the bot is logged via the existing `send_history` mechanism with channel `telegram_bot`. This ensures the history page on the web UI shows bot-generated content too.

## Future (Out of Scope)

- **WhatsApp Business API integration** — research via existing group numbers or dedicated business number
- **Level 2 — System modifications via Telegram** — requires VPS with Claude Code CLI
- **Multi-user access** — currently locked to Ben + Ori only
- **Scheduled sending** — auto-send generated digest to WhatsApp group at specific time

## Cost Impact

- **Telegram Bot API:** Free, unlimited
- **Vercel:** Same plan. If Pro needed for worker timeout: $20/month
- **Supabase:** Two small tables, within free tier
- **Claude/ElevenLabs:** Same API usage as web UI (no additional cost from the bot itself)
- **Total additional cost:** $0 (Hobby) or $20/mo (Pro, recommended for reliability)
