# Telegram Bot for News Content Management — Design Spec

**Date:** 2026-03-17
**Project:** news-generator-deploy (KlikaVault daily news system)
**Scope:** Level 1 — content management via Telegram (no system modifications)

## Problem

Ben Solomon manages daily real estate news content through a web UI. He needs to do this from his phone without opening a computer. The existing system has 12 API endpoints that handle all content logic — we need a mobile-friendly interface on top of them.

## Solution

A Telegram bot that acts as a thin interface layer over the existing API routes. Zero code duplication — the bot calls the same endpoints the web UI uses.

## Architecture

```
Ben (Telegram) <-> Telegram Bot API <-> Vercel Webhook (/api/telegram)
                                              |
                                        Same API routes:
                                        /api/news/today
                                        /api/generate
                                        /api/digest
                                        /api/refine
                                        /api/tts
                                        /api/stt
                                        /api/article
                                        /api/merge-narrative
                                        /api/humanity-score
```

**Single new file:** `src/app/api/telegram/route.ts`
**Single new cron route:** `src/app/api/telegram/morning/route.ts`

## Daily Flow

1. **06:00 UTC** — existing cron scan runs (`/api/cron/scan`)
2. **07:00 Israel time** — new cron calls `/api/telegram/morning` which sends Ben the top 3 news with inline buttons
3. **Ben interacts** — taps buttons, sends text corrections, sends voice recordings
4. **Bot responds** — generates content, refines text, sends audio files

## Commands & Interactions

### Slash Commands
| Command | Action |
|---------|--------|
| `/start` | Welcome message with usage instructions |
| `/news` | Show today's top 6 news with scores |
| `/digest` | Generate daily digest from top 3 |
| `/generate N` | Generate WhatsApp text for news item N |
| `/merge` | Merge narrative from all top news |
| `/article` | Expand last generated text to full article |
| `/voice` | Convert last generated text to Ben's voice (MP3) |

### Natural Interactions (no slash needed)
| Ben sends | Bot does |
|-----------|----------|
| Text message | Treats as AI refine instruction on last generated text |
| Voice message | STT transcription -> AI refine instruction on last generated text |

### Inline Buttons (on bot messages)
After showing news: `[📌 דייג'סט]` `[📝 נוסח נפרד]` `[📰 כתבה]`
After generating text: `[📋 העתק]` `[🔊 קול בן]` `[📰 הרחב לכתבה]` `[🧪 ציון אנושיות]`

## Session State

Each chat maintains minimal state in Supabase:

**New table: `telegram_sessions`**
```sql
CREATE TABLE telegram_sessions (
  chat_id BIGINT PRIMARY KEY,
  last_generated_text TEXT,
  last_news_ids TEXT[], -- array of news item IDs
  last_type TEXT, -- 'digest' | 'message' | 'article'
  last_message_id BIGINT, -- for editing bot messages
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

State is needed because Telegram webhook calls are stateless — each incoming message is a separate HTTP request. The session table lets the bot know what "last text" means when Ben sends a correction.

## Security

- **`TELEGRAM_ALLOWED_USER_IDS`** env var — comma-separated Telegram user IDs
- Every incoming message checked against allowlist before processing
- Unauthorized users get: "אין הרשאה. הבוט זמין רק למשתמשים מורשים."
- Webhook verified via `TELEGRAM_WEBHOOK_SECRET` (Telegram's `secret_token` parameter)

## Implementation Details

### Webhook Handler (`/api/telegram/route.ts`)

Single POST handler that:
1. Verifies webhook secret
2. Checks user authorization
3. Parses update type (message, callback_query, voice)
4. Routes to appropriate handler function
5. Calls existing API routes internally (direct function calls, not HTTP)
6. Sends response back via Telegram Bot API

### Morning Notification (`/api/telegram/morning/route.ts`)

GET handler triggered by Vercel cron:
1. Calls `/api/news/today` logic to get top news
2. Formats as Telegram message with inline keyboard buttons
3. Sends to each authorized user via Telegram Bot API

### Voice Message Handling

When Ben sends a voice message:
1. Download audio file from Telegram servers
2. Forward to ElevenLabs STT (existing `/api/stt` logic)
3. Use transcription as AI refine instruction
4. Apply to last generated text
5. Send back updated text

### TTS Response

When Ben requests voice (`/voice` or button):
1. Generate audio via ElevenLabs TTS (existing `/api/tts` logic)
2. Send as Telegram voice message / audio file (downloadable MP3)

### Message Length Handling

Telegram has a 4096 character limit per message. For long texts (articles):
- Split into multiple messages
- First message gets the action buttons
- Or send as a document file for very long content

## Environment Variables (New)

```
TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_ALLOWED_USER_IDS=<ben_id>,<ori_id>
TELEGRAM_WEBHOOK_SECRET=<random string for webhook verification>
```

## Vercel Cron Update

Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/scan", "schedule": "0 6 * * *" },
    { "path": "/api/telegram/morning", "schedule": "0 4 * * *" }
  ]
}
```
Note: 04:00 UTC = 07:00 Israel time (IST/IDT)

## Dependencies

**New npm package:** `none` — we use raw Telegram Bot API via fetch (no telegraf/node-telegram-bot-api needed). Keeps the bundle small and avoids serverless compatibility issues.

## Files Changed/Created

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/telegram/route.ts` | CREATE | Webhook handler |
| `src/app/api/telegram/morning/route.ts` | CREATE | Morning notification cron |
| `src/lib/telegram.ts` | CREATE | Telegram API helper (sendMessage, sendAudio, answerCallback, etc.) |
| `src/lib/telegram-handlers.ts` | CREATE | Command/message handler functions |
| `vercel.json` | MODIFY | Add morning cron |
| Supabase | MODIFY | Add telegram_sessions table |

## Error Handling

- API failures: Bot sends "שגיאה ביצירת הנוסח. נסו שוב." with retry button
- Timeout (Vercel 10s limit): For long operations (article generation), send "⏳ מייצר..." first, then edit the message when done
- STT failure: "לא הצלחתי לתמלל. נסה שוב או כתוב טקסט."

## Future (Out of Scope)

- **WhatsApp integration** — research via WhatsApp Business API or existing group numbers
- **Level 2 — System modifications via Telegram** — requires VPS with Claude Code CLI
- **Multi-user access** — currently locked to Ben + Ori only

## Cost Impact

- **Telegram Bot API:** Free, unlimited
- **Vercel:** Same plan, one additional cron job + webhook route
- **Supabase:** One small table, within free tier
- **Claude/ElevenLabs:** Same API usage as web UI (no additional cost from the bot itself)
