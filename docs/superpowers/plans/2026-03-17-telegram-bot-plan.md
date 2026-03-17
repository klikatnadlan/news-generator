# Telegram Bot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Telegram bot that gives Ben Solomon full mobile access to the news generation system — all features from the web UI, accessible from Telegram via commands, buttons, text, and voice.

**Architecture:** Single webhook endpoint on Vercel receives Telegram updates, queues slow operations (Claude/ElevenLabs) as async jobs in a Supabase `telegram_jobs` table, and a worker route processes them. Session state persists in `telegram_sessions`. No new npm dependencies — raw Telegram Bot API via fetch.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL, Telegram Bot API (raw fetch), existing Claude/ElevenLabs integrations.

**Spec:** `docs/superpowers/specs/2026-03-17-telegram-bot-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/telegram.ts` | Low-level Telegram API helpers: sendMessage, editMessage, sendAudio, sendDocument, answerCallbackQuery, setWebhook, getFile. All use raw fetch. |
| `src/lib/telegram-handlers.ts` | Command/callback/message routing logic. Maps `/news`, `/digest`, etc. to handler functions. Imports from `anthropic.ts`, `supabase.ts`, `telegram.ts`. |
| `src/app/api/telegram/route.ts` | Webhook POST endpoint. Verifies secret, checks auth, delegates to handlers. |
| `src/app/api/telegram/morning/route.ts` | Cron GET endpoint. Fetches top news, sends morning notification to authorized users. |
| `src/app/api/telegram/worker/route.ts` | Cron GET endpoint. Picks pending job from `telegram_jobs`, executes it, sends result. |
| `vercel.json` | Add morning + worker cron schedules. |

---

## Task 1: Supabase Tables

**Files:**
- Supabase dashboard (SQL editor)

- [ ] **Step 1: Create telegram_sessions table**

Run in Supabase SQL Editor:
```sql
CREATE TABLE telegram_sessions (
  chat_id BIGINT PRIMARY KEY,
  last_generated_text TEXT,
  last_news_ids TEXT[],
  last_type TEXT,
  last_news_item_id TEXT,
  last_message_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_telegram_sessions" ON telegram_sessions FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Create telegram_jobs table**

```sql
CREATE TABLE telegram_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  job_type TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  result_text TEXT,
  result_audio_url TEXT,
  reply_to_message_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_telegram_jobs_pending ON telegram_jobs(status, created_at) WHERE status = 'pending';
ALTER TABLE telegram_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_telegram_jobs" ON telegram_jobs FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 3: Verify tables exist**

Run: `SELECT * FROM telegram_sessions LIMIT 1; SELECT * FROM telegram_jobs LIMIT 1;`
Expected: Empty result sets, no errors.

---

## Task 2: Telegram API Helper (`src/lib/telegram.ts`)

**Files:**
- Create: `src/lib/telegram.ts`

- [ ] **Step 1: Create the Telegram API helper module**

```typescript
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface InlineButton {
  text: string;
  callback_data: string;
}

export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    replyMarkup?: { inline_keyboard: InlineButton[][] };
    parseMode?: "Markdown" | "HTML";
  }
): Promise<{ message_id: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode || "Markdown",
  };
  if (options?.replyMarkup) {
    body.reply_markup = JSON.stringify(options.replyMarkup);
  }
  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { message_id: data.result?.message_id };
}

export async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  options?: {
    replyMarkup?: { inline_keyboard: InlineButton[][] };
    parseMode?: "Markdown" | "HTML";
  }
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options?.parseMode || "Markdown",
  };
  if (options?.replyMarkup) {
    body.reply_markup = JSON.stringify(options.replyMarkup);
  }
  await fetch(`${API_BASE}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendAudio(
  chatId: number,
  audioBuffer: ArrayBuffer,
  filename: string,
  caption?: string
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", chatId.toString());
  form.append("audio", new Blob([audioBuffer], { type: "audio/mpeg" }), filename);
  if (caption) form.append("caption", caption);
  await fetch(`${API_BASE}/sendAudio`, { method: "POST", body: form });
}

export async function sendDocument(
  chatId: number,
  textContent: string,
  filename: string,
  caption?: string
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", chatId.toString());
  form.append("document", new Blob([textContent], { type: "text/plain" }), filename);
  if (caption) form.append("caption", caption);
  await fetch(`${API_BASE}/sendDocument`, { method: "POST", body: form });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await fetch(`${API_BASE}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

export async function getFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = await res.json();
  const filePath = data.result?.file_path;
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const url = await getFileUrl(fileId);
  const res = await fetch(url);
  return res.arrayBuffer();
}

export async function setWebhook(url: string, secret: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
    }),
  });
  const data = await res.json();
  return data.ok;
}

// Split long text into Telegram-safe chunks (max 4096 chars)
export function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Find last newline within limit
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/telegram.ts
git commit -m "feat: add Telegram Bot API helper module"
```

---

## Task 3: Handler Logic (`src/lib/telegram-handlers.ts`)

**Files:**
- Create: `src/lib/telegram-handlers.ts`

This is the largest file. It maps commands and interactions to the existing generation functions.

- [ ] **Step 1: Create the handler module with auth check, command routing, and all handlers**

```typescript
import { getSupabase } from "./supabase";
import {
  sendMessage,
  editMessage,
  answerCallbackQuery,
  downloadFile,
  sendAudio,
  sendDocument,
  splitMessage,
  InlineButton,
} from "./telegram";
import {
  generateWhatsAppText,
  generateDailyDigest,
  generateArticle,
  generateMergedNarrative,
  refineText,
  checkHumanityScore,
  generateCommentary,
} from "./anthropic";

const ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
  .split(",")
  .map((id) => parseInt(id.trim(), 10))
  .filter(Boolean);

// ─── Auth ───
export function isAuthorized(userId: number): boolean {
  return ALLOWED_IDS.includes(userId);
}

// ─── Session helpers ───
const supabase = getSupabase();

async function getSession(chatId: number) {
  const { data } = await supabase
    .from("telegram_sessions")
    .select("*")
    .eq("chat_id", chatId)
    .single();
  return data;
}

async function updateSession(chatId: number, updates: Record<string, unknown>) {
  await supabase
    .from("telegram_sessions")
    .upsert({ chat_id: chatId, ...updates, updated_at: new Date().toISOString() });
}

// ─── Job queue ───
async function queueJob(
  chatId: number,
  jobType: string,
  params: Record<string, unknown>,
  replyToMessageId?: number
): Promise<string> {
  // Debounce: check for existing pending job
  const { data: existing } = await supabase
    .from("telegram_jobs")
    .select("id")
    .eq("chat_id", chatId)
    .in("status", ["pending", "running"])
    .limit(1);

  if (existing && existing.length > 0) {
    await sendMessage(chatId, "⏳ עדיין מעבד בקשה קודמת, חכה רגע...");
    return "";
  }

  const { data } = await supabase
    .from("telegram_jobs")
    .insert({
      chat_id: chatId,
      job_type: jobType,
      params,
      status: "pending",
      reply_to_message_id: replyToMessageId,
    })
    .select("id")
    .single();
  return data?.id || "";
}

// ─── News buttons ───
function newsActionButtons(): InlineButton[][] {
  return [
    [
      { text: "📌 דייג'סט", callback_data: "action:digest" },
      { text: "📝 נוסח נפרד", callback_data: "action:generate" },
    ],
    [
      { text: "🔗 מזג נרטיב", callback_data: "action:merge" },
      { text: "💬 פרשנות", callback_data: "action:commentary" },
    ],
  ];
}

function textActionButtons(): InlineButton[][] {
  return [
    [
      { text: "📋 שלח כטקסט", callback_data: "action:copy" },
      { text: "🔊 קול בן", callback_data: "action:voice" },
    ],
    [
      { text: "📰 הרחב לכתבה", callback_data: "action:article" },
      { text: "🧪 ציון אנושיות", callback_data: "action:humanity" },
    ],
  ];
}

// ─── /start ───
export async function handleStart(chatId: number): Promise<void> {
  const text = `🤖 *בוט החדשות של קליקת הנדל"ן*

שלום! אני הבוט שמנהל את מערכת החדשות והתוכן של בן סולומון.

*פקודות:*
/news — חדשות מובילות היום
/digest — דייג'סט יומי מוכן
/merge — מזג נרטיב מכל החדשות
/voice — הפוך טקסט אחרון לקול בן
/article — הרחב לכתבה מלאה
/commentary — פרשנות בן סולומון
/status — סטטוס המערכת

*תיקונים:*
כתוב טקסט חופשי → מתקן את הנוסח האחרון
שלח הקלטה 🎤 → מתמלל ומתקן

בהצלחה! 🚀`;
  await sendMessage(chatId, text);
}

// ─── /news ───
export async function handleNews(chatId: number): Promise<void> {
  const { data: scores } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .eq("scan_date", new Date().toISOString().split("T")[0])
    .order("score", { ascending: false })
    .limit(6);

  if (!scores || scores.length === 0) {
    await sendMessage(chatId, "אין חדשות להיום. נסה /news מאוחר יותר או הפעל סריקה מהאתר.");
    return;
  }

  const newsIds = scores.map((s: { news_items: { id: string } }) => s.news_items.id);
  await updateSession(chatId, { last_news_ids: newsIds });

  let text = "📌 *חדשות מובילות היום:*\n\n";
  scores.forEach((s: { score: number; news_items: { title: string; source: string } }, i: number) => {
    text += `*${i + 1}.* (${s.score} נק') ${s.news_items.title}\n_${s.news_items.source}_\n\n`;
  });
  text += "בחר פעולה:";

  await sendMessage(chatId, text, { replyMarkup: { inline_keyboard: newsActionButtons() } });
}

// ─── /status ───
export async function handleStatus(chatId: number): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const { count } = await supabase
    .from("news_scores")
    .select("*", { count: "exact", head: true })
    .eq("scan_date", today);

  const { data: pendingJobs } = await supabase
    .from("telegram_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  await sendMessage(chatId,
    `📊 *סטטוס מערכת*\n\n` +
    `📰 חדשות היום: ${count || 0}\n` +
    `⏳ עבודות בתור: ${pendingJobs?.length || 0}\n` +
    `📅 תאריך: ${today}`
  );
}

// ─── Queue-based commands (slow operations) ───
export async function handleDigest(chatId: number): Promise<void> {
  const msg = await sendMessage(chatId, "⏳ מייצר דייג'סט יומי...");
  await queueJob(chatId, "digest", {}, msg.message_id);
}

export async function handleGenerate(chatId: number, newsIndex?: number): Promise<void> {
  const session = await getSession(chatId);
  const newsIds = session?.last_news_ids || [];

  if (newsIds.length === 0) {
    await sendMessage(chatId, "אין חדשות בזיכרון. שלח /news קודם.");
    return;
  }

  const idx = (newsIndex ?? 1) - 1;
  if (idx < 0 || idx >= newsIds.length) {
    await sendMessage(chatId, `מספר לא תקין. בחר בין 1 ל-${newsIds.length}.`);
    return;
  }

  const msg = await sendMessage(chatId, `⏳ מייצר נוסח לחדשה ${idx + 1}...`);
  await queueJob(chatId, "generate", { newsItemId: newsIds[idx] }, msg.message_id);
}

export async function handleMerge(chatId: number): Promise<void> {
  const msg = await sendMessage(chatId, "⏳ ממזג נרטיב מכל החדשות...");
  await queueJob(chatId, "merge", {}, msg.message_id);
}

export async function handleArticle(chatId: number): Promise<void> {
  const session = await getSession(chatId);
  if (!session?.last_generated_text) {
    await sendMessage(chatId, "אין טקסט לתקן. שלח /digest או /news קודם.");
    return;
  }
  const msg = await sendMessage(chatId, "⏳ מרחיב לכתבה מלאה...");
  await queueJob(chatId, "article", {
    newsItemId: session.last_news_item_id || session.last_news_ids?.[0] || "",
    fromNarrative: session.last_generated_text,
  }, msg.message_id);
}

export async function handleVoice(chatId: number): Promise<void> {
  const session = await getSession(chatId);
  if (!session?.last_generated_text) {
    await sendMessage(chatId, "אין טקסט להמרה. שלח /digest קודם.");
    return;
  }
  const msg = await sendMessage(chatId, "⏳ מייצר הקלטה בקול בן...");
  await queueJob(chatId, "tts", { text: session.last_generated_text }, msg.message_id);
}

export async function handleCommentary(chatId: number): Promise<void> {
  const session = await getSession(chatId);
  const newsIds = session?.last_news_ids || [];
  if (newsIds.length === 0) {
    await sendMessage(chatId, "אין חדשות בזיכרון. שלח /news קודם.");
    return;
  }
  const msg = await sendMessage(chatId, "⏳ מייצר פרשנות...");
  await queueJob(chatId, "commentary", { newsItemId: newsIds[0] }, msg.message_id);
}

export async function handleHumanity(chatId: number): Promise<void> {
  const session = await getSession(chatId);
  if (!session?.last_generated_text) {
    await sendMessage(chatId, "אין טקסט לבדוק. שלח /digest קודם.");
    return;
  }
  const msg = await sendMessage(chatId, "⏳ בודק ציון אנושיות...");
  await queueJob(chatId, "humanity", { text: session.last_generated_text }, msg.message_id);
}

// ─── Text refinement (sync — fast enough) ───
export async function handleTextRefine(chatId: number, instruction: string): Promise<void> {
  const session = await getSession(chatId);
  if (!session?.last_generated_text) {
    await sendMessage(chatId, "אין טקסט לתקן. שלח /digest או /generate קודם, ואז כתוב מה לשנות.");
    return;
  }
  const msg = await sendMessage(chatId, "⏳ מתקן...");
  await queueJob(chatId, "refine", {
    currentText: session.last_generated_text,
    instruction,
  }, msg.message_id);
}

// ─── Voice message (STT + refine) ───
export async function handleVoiceMessage(chatId: number, fileId: string): Promise<void> {
  const session = await getSession(chatId);
  if (!session?.last_generated_text) {
    await sendMessage(chatId, "אין טקסט לתקן. שלח /digest קודם, ואז שלח הקלטה עם התיקון.");
    return;
  }
  const msg = await sendMessage(chatId, "⏳ מתמלל ומתקן...");
  await queueJob(chatId, "voice_refine", {
    fileId,
    currentText: session.last_generated_text,
  }, msg.message_id);
}

// ─── Callback query handler ───
export async function handleCallback(
  chatId: number,
  callbackId: string,
  data: string
): Promise<void> {
  await answerCallbackQuery(callbackId, "מעבד...");

  const action = data.replace("action:", "");
  switch (action) {
    case "digest": return handleDigest(chatId);
    case "generate": return handleGenerate(chatId, 1);
    case "merge": return handleMerge(chatId);
    case "commentary": return handleCommentary(chatId);
    case "copy": {
      const session = await getSession(chatId);
      if (session?.last_generated_text) {
        // Send as plain text for easy copy
        const chunks = splitMessage(session.last_generated_text);
        for (const chunk of chunks) {
          await sendMessage(chatId, chunk, { parseMode: "HTML" });
        }
      }
      return;
    }
    case "voice": return handleVoice(chatId);
    case "article": return handleArticle(chatId);
    case "humanity": return handleHumanity(chatId);
    default:
      await sendMessage(chatId, "פעולה לא מוכרת.");
  }
}

// ─── Route incoming update ───
export async function routeUpdate(update: Record<string, unknown>): Promise<void> {
  // Callback query (button press)
  if (update.callback_query) {
    const cb = update.callback_query as {
      id: string;
      from: { id: number };
      message: { chat: { id: number } };
      data: string;
    };
    if (!isAuthorized(cb.from.id)) return;
    return handleCallback(cb.message.chat.id, cb.id, cb.data);
  }

  // Message
  const message = update.message as {
    chat: { id: number };
    from: { id: number };
    text?: string;
    voice?: { file_id: string };
  } | undefined;

  if (!message) return;
  if (!isAuthorized(message.from.id)) {
    await sendMessage(message.chat.id, "אין הרשאה. הבוט זמין רק למשתמשים מורשים.");
    return;
  }

  const chatId = message.chat.id;

  // Voice message
  if (message.voice) {
    return handleVoiceMessage(chatId, message.voice.file_id);
  }

  // Text message
  const text = message.text?.trim();
  if (!text) return;

  // Commands
  if (text === "/start") return handleStart(chatId);
  if (text === "/news") return handleNews(chatId);
  if (text === "/digest") return handleDigest(chatId);
  if (text.startsWith("/generate")) {
    const num = parseInt(text.split(" ")[1], 10);
    return handleGenerate(chatId, isNaN(num) ? 1 : num);
  }
  if (text === "/merge") return handleMerge(chatId);
  if (text === "/article") return handleArticle(chatId);
  if (text === "/voice") return handleVoice(chatId);
  if (text === "/commentary") return handleCommentary(chatId);
  if (text === "/status") return handleStatus(chatId);
  if (text === "/cancel") {
    await supabase
      .from("telegram_jobs")
      .update({ status: "cancelled" })
      .eq("chat_id", chatId)
      .in("status", ["pending"]);
    await sendMessage(chatId, "✅ בוטלו כל העבודות הממתינות.");
    return;
  }

  // Free text → AI refine
  if (!text.startsWith("/")) {
    return handleTextRefine(chatId, text);
  }

  await sendMessage(chatId, "פקודה לא מוכרת. שלח /start לרשימת הפקודות.");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/telegram-handlers.ts
git commit -m "feat: add Telegram bot handler logic with all commands"
```

---

## Task 4: Webhook Endpoint (`src/app/api/telegram/route.ts`)

**Files:**
- Create: `src/app/api/telegram/route.ts`

- [ ] **Step 1: Create the webhook route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { routeUpdate } from "@/lib/telegram-handlers";

export const maxDuration = 10;

export async function POST(request: NextRequest) {
  // Verify webhook secret
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = await request.json();
    await routeUpdate(update);
  } catch (error) {
    console.error("Telegram webhook error:", error);
  }

  // Always return 200 to prevent Telegram retries
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telegram/route.ts
git commit -m "feat: add Telegram webhook endpoint"
```

---

## Task 5: Async Worker (`src/app/api/telegram/worker/route.ts`)

**Files:**
- Create: `src/app/api/telegram/worker/route.ts`

- [ ] **Step 1: Create the worker route that processes queued jobs**

```typescript
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  generateWhatsAppText,
  generateDailyDigest,
  generateArticle,
  generateMergedNarrative,
  refineText,
  checkHumanityScore,
  generateCommentary,
} from "@/lib/anthropic";
import {
  editMessage,
  sendMessage,
  sendAudio,
  sendDocument,
  splitMessage,
  downloadFile,
  InlineButton,
} from "@/lib/telegram";

export const maxDuration = 10; // Hobby limit; will chain jobs if needed

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const VOICE_ID = "bPFQW9IdOgp0dTMgOL0D";

function textActionButtons(): InlineButton[][] {
  return [
    [
      { text: "📋 שלח כטקסט", callback_data: "action:copy" },
      { text: "🔊 קול בן", callback_data: "action:voice" },
    ],
    [
      { text: "📰 הרחב לכתבה", callback_data: "action:article" },
      { text: "🧪 ציון אנושיות", callback_data: "action:humanity" },
    ],
  ];
}

async function updateSession(chatId: number, updates: Record<string, unknown>) {
  const supabase = getSupabase();
  await supabase
    .from("telegram_sessions")
    .upsert({ chat_id: chatId, ...updates, updated_at: new Date().toISOString() });
}

async function generateTTS(text: string): Promise<ArrayBuffer> {
  const cleanText = text.replace(/\*/g, "");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: cleanText,
      model_id: "eleven_v3",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error("TTS failed");
  return res.arrayBuffer();
}

async function transcribeAudio(audioBuffer: ArrayBuffer, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mimeType }), "voice.ogg");
  form.append("model_id", "scribe_v1");
  form.append("language_code", "heb");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error("STT failed");
  const data = await res.json();
  return data.text || "";
}

export async function GET() {
  const supabase = getSupabase();

  // Pick oldest pending job
  const { data: jobs } = await supabase
    .from("telegram_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const job = jobs[0];
  const chatId = job.chat_id;
  const params = job.params as Record<string, string>;

  // Mark as running
  await supabase.from("telegram_jobs").update({ status: "running" }).eq("id", job.id);

  try {
    let resultText = "";

    switch (job.job_type) {
      case "digest": {
        const today = new Date().toISOString().split("T")[0];
        const { data: scores } = await supabase
          .from("news_scores")
          .select("*, news_items(*)")
          .eq("scan_date", today)
          .order("score", { ascending: false })
          .limit(3);

        if (!scores?.length) {
          resultText = "אין חדשות היום ליצירת דייג'סט.";
          break;
        }

        const articles = scores.map((s: { news_items: { title: string; summary: string; source: string } }) => ({
          title: s.news_items.title,
          summary: s.news_items.summary || "",
          source: s.news_items.source,
        }));

        resultText = await generateDailyDigest(articles);
        const newsIds = scores.map((s: { news_items: { id: string } }) => s.news_items.id);
        await updateSession(chatId, {
          last_generated_text: resultText,
          last_news_ids: newsIds,
          last_type: "digest",
          last_news_item_id: newsIds[0],
        });
        break;
      }

      case "generate": {
        const { data: newsItem } = await supabase
          .from("news_items")
          .select("*")
          .eq("id", params.newsItemId)
          .single();

        if (!newsItem) {
          resultText = "חדשה לא נמצאה.";
          break;
        }

        resultText = await generateWhatsAppText(
          { title: newsItem.title, summary: newsItem.summary || "", source: newsItem.source },
          "regular"
        );
        await updateSession(chatId, {
          last_generated_text: resultText,
          last_type: "message",
          last_news_item_id: params.newsItemId,
        });
        break;
      }

      case "merge": {
        const session_data = await supabase
          .from("telegram_sessions")
          .select("last_news_ids")
          .eq("chat_id", chatId)
          .single();

        const newsIds = session_data.data?.last_news_ids || [];
        if (newsIds.length < 2) {
          resultText = "צריך לפחות 2 חדשות למיזוג. שלח /news קודם.";
          break;
        }

        // Generate individual texts first
        const { data: newsItems } = await supabase
          .from("news_items")
          .select("*")
          .in("id", newsIds.slice(0, 3));

        if (!newsItems?.length) {
          resultText = "חדשות לא נמצאו.";
          break;
        }

        const generatedTexts: { title: string; source: string; text: string }[] = [];
        for (const item of newsItems) {
          const txt = await generateWhatsAppText(
            { title: item.title, summary: item.summary || "", source: item.source },
            "regular"
          );
          generatedTexts.push({ title: item.title, source: item.source, text: txt });
        }

        resultText = await generateMergedNarrative(generatedTexts);
        await updateSession(chatId, {
          last_generated_text: resultText,
          last_type: "digest",
          last_news_item_id: newsIds[0],
        });
        break;
      }

      case "article": {
        resultText = await generateArticle(
          { title: "", summary: params.fromNarrative || "", source: "" },
          params.fromNarrative
        );
        await updateSession(chatId, {
          last_generated_text: resultText,
          last_type: "article",
        });
        break;
      }

      case "refine": {
        resultText = await refineText(params.currentText, params.instruction);
        await updateSession(chatId, { last_generated_text: resultText });
        break;
      }

      case "voice_refine": {
        const audioBuffer = await downloadFile(params.fileId);
        const transcript = await transcribeAudio(audioBuffer, "audio/ogg");
        if (!transcript) {
          resultText = "לא הצלחתי לתמלל. נסה שוב או כתוב את התיקון בטקסט.";
          break;
        }
        resultText = await refineText(params.currentText, transcript);
        await updateSession(chatId, { last_generated_text: resultText });
        break;
      }

      case "tts": {
        const audio = await generateTTS(params.text);
        await sendAudio(chatId, audio, `ben-solomon-${Date.now()}.mp3`, "🔊 הקלטה בקול בן סולומון");
        // Mark completed and return early (no text result)
        await supabase.from("telegram_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
        if (job.reply_to_message_id) {
          await editMessage(chatId, job.reply_to_message_id, "✅ ההקלטה נשלחה!");
        }
        return NextResponse.json({ processed: 1, type: "tts" });
      }

      case "humanity": {
        const result = await checkHumanityScore(params.text);
        const emoji = result.score >= 7 ? "👍" : result.score >= 5 ? "⚠️" : "🚨";
        resultText = `🧪 *ציון אנושיות: ${result.score}/10* ${emoji}\n\n`;
        if (result.flags?.length) resultText += `דגלים: ${result.flags.join(" · ")}\n`;
        if (result.suggestion) resultText += `\n💡 ${result.suggestion}`;
        break;
      }

      case "commentary": {
        const { data: newsItem2 } = await supabase
          .from("news_items")
          .select("*")
          .eq("id", params.newsItemId)
          .single();

        if (!newsItem2) {
          resultText = "חדשה לא נמצאה.";
          break;
        }

        const commentary = await generateCommentary({
          title: newsItem2.title,
          summary: newsItem2.summary || "",
          source: newsItem2.source,
        });

        resultText = `💬 *פרשנות בן סולומון*\n\n`;
        resultText += `*מה קרה:* ${commentary.what_happened}\n\n`;
        resultText += `*למה זה חשוב:* ${commentary.why_important}\n\n`;
        resultText += `*מה אנשים מפספסים:* ${commentary.real_understanding}\n\n`;
        resultText += `*הזווית שלנו:* ${commentary.our_angle}`;

        await updateSession(chatId, {
          last_generated_text: resultText,
          last_type: "commentary",
          last_news_item_id: params.newsItemId,
        });
        break;
      }

      default:
        resultText = "סוג עבודה לא מוכר.";
    }

    // Send result
    if (resultText) {
      const isLong = resultText.length > 4000;
      if (isLong) {
        // Send as document for very long texts
        const summary = resultText.slice(0, 200) + "...";
        if (job.reply_to_message_id) {
          await editMessage(chatId, job.reply_to_message_id, `✅ מוכן! (${resultText.trim().split(/\s+/).length} מילים)`);
        }
        await sendDocument(chatId, resultText, "content.txt", summary);
        await sendMessage(chatId, "בחר פעולה:", { replyMarkup: { inline_keyboard: textActionButtons() } });
      } else {
        // Edit the "generating..." message with the result
        if (job.reply_to_message_id) {
          await editMessage(chatId, job.reply_to_message_id, resultText, {
            replyMarkup: { inline_keyboard: job.job_type === "humanity" ? [] : textActionButtons() },
          });
        } else {
          await sendMessage(chatId, resultText, {
            replyMarkup: { inline_keyboard: job.job_type === "humanity" ? undefined : { inline_keyboard: textActionButtons() } } as any,
          });
        }
      }
    }

    // Mark completed
    await supabase.from("telegram_jobs").update({
      status: "completed",
      result_text: resultText.slice(0, 10000),
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);

  } catch (error) {
    console.error("Worker job failed:", error);
    await supabase.from("telegram_jobs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", job.id);
    if (job.reply_to_message_id) {
      await editMessage(chatId, job.reply_to_message_id, "❌ שגיאה בעיבוד. נסה שוב.");
    } else {
      await sendMessage(chatId, "❌ שגיאה בעיבוד. נסה שוב.");
    }
  }

  return NextResponse.json({ processed: 1, type: job.job_type });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telegram/worker/route.ts
git commit -m "feat: add Telegram async job worker"
```

---

## Task 6: Morning Notification (`src/app/api/telegram/morning/route.ts`)

**Files:**
- Create: `src/app/api/telegram/morning/route.ts`

- [ ] **Step 1: Create the morning cron route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage, InlineButton } from "@/lib/telegram";

export const maxDuration = 10;

const ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
  .split(",")
  .map((id) => parseInt(id.trim(), 10))
  .filter(Boolean);

export async function GET(request: NextRequest) {
  // Optional: verify cron secret
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { data: scores } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .eq("scan_date", today)
    .order("score", { ascending: false })
    .limit(3);

  if (!scores || scores.length === 0) {
    return NextResponse.json({ sent: false, reason: "no news today" });
  }

  let text = "📌 *בוקר טוב! חדשות מובילות היום:*\n\n";
  scores.forEach((s: { score: number; news_items: { title: string; source: string } }, i: number) => {
    text += `*${i + 1}.* (${s.score} נק') ${s.news_items.title}\n_${s.news_items.source}_\n\n`;
  });
  text += "מה עושים?";

  const buttons: InlineButton[][] = [
    [
      { text: "📌 דייג'סט", callback_data: "action:digest" },
      { text: "📝 נוסח נפרד", callback_data: "action:generate" },
    ],
    [
      { text: "🔗 מזג נרטיב", callback_data: "action:merge" },
      { text: "💬 פרשנות", callback_data: "action:commentary" },
    ],
  ];

  let sentCount = 0;
  for (const userId of ALLOWED_IDS) {
    try {
      await sendMessage(userId, text, { replyMarkup: { inline_keyboard: buttons } });

      // Update session with today's news
      const newsIds = scores.map((s: { news_items: { id: string } }) => s.news_items.id);
      await supabase.from("telegram_sessions").upsert({
        chat_id: userId,
        last_news_ids: newsIds,
        updated_at: new Date().toISOString(),
      });

      sentCount++;
    } catch (error) {
      console.error(`Failed to send morning notification to ${userId}:`, error);
    }
  }

  return NextResponse.json({ sent: true, count: sentCount });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telegram/morning/route.ts
git commit -m "feat: add morning notification cron for Telegram bot"
```

---

## Task 7: Vercel Config + Environment

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Update vercel.json with morning cron**

```json
{
  "crons": [
    { "path": "/api/cron/scan", "schedule": "0 6 * * *" },
    { "path": "/api/telegram/morning", "schedule": "0 5 * * *" }
  ]
}
```

Note: Worker cron not added here (Hobby only supports 1 cron per day). Worker will be triggered by external cron service.

- [ ] **Step 2: Add environment variables to Vercel**

```bash
# These will be set after creating the bot with BotFather
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_ALLOWED_USER_IDS
vercel env add TELEGRAM_WEBHOOK_SECRET
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat: add Telegram morning cron to vercel.json"
```

---

## Task 8: Create Bot + Set Webhook + Deploy

- [ ] **Step 1: Create bot with BotFather**

In Telegram, message @BotFather:
1. Send `/newbot`
2. Name: `קליקת חדשות נדלן` (or similar)
3. Username: `KlikaNewsBot` (must be unique, adjust if taken)
4. Copy the token BotFather gives you

- [ ] **Step 2: Get Telegram user IDs**

Both Ben and Ori need to message @userinfobot on Telegram to get their numeric user IDs.

- [ ] **Step 3: Set environment variables locally and on Vercel**

```bash
# Add to .env.local
echo 'TELEGRAM_BOT_TOKEN=<token from BotFather>' >> .env.local
echo 'TELEGRAM_ALLOWED_USER_IDS=<ben_id>,<ori_id>' >> .env.local
echo 'TELEGRAM_WEBHOOK_SECRET=klika-news-webhook-2026' >> .env.local

# Add to Vercel
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_ALLOWED_USER_IDS
vercel env add TELEGRAM_WEBHOOK_SECRET
```

- [ ] **Step 4: Deploy to Vercel**

```bash
npx vercel --prod
```

- [ ] **Step 5: Set webhook URL**

After deploy, run this once (from browser or curl):
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://news-generator-seven.vercel.app/api/telegram&secret_token=klika-news-webhook-2026&allowed_updates=["message","callback_query"]
```

- [ ] **Step 6: Set up external cron for worker**

Go to https://cron-job.org (free):
1. Create account
2. Add cron job:
   - URL: `https://news-generator-seven.vercel.app/api/telegram/worker`
   - Schedule: every 30 seconds (or every 1 minute)
   - Method: GET

- [ ] **Step 7: Test the bot**

In Telegram, message the bot:
1. Send `/start` — should get welcome message
2. Send `/news` — should get today's news
3. Tap "📌 דייג'סט" button — should start generating
4. Wait for worker to process — should get digest
5. Type "תשנה את הפתיח" — should refine
6. Send voice message — should transcribe and refine
7. Tap "🔊 קול בן" — should get MP3

- [ ] **Step 8: Commit any final fixes and redeploy**

```bash
git add -A
git commit -m "feat: complete Telegram bot setup and integration"
npx vercel --prod
```

---

## Task Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Supabase tables | 5 min |
| 2 | Telegram API helper | 5 min |
| 3 | Handler logic | 10 min |
| 4 | Webhook endpoint | 3 min |
| 5 | Async worker | 10 min |
| 6 | Morning notification | 5 min |
| 7 | Vercel config + env | 5 min |
| 8 | Bot creation + deploy + test | 15 min |
| **Total** | | **~60 min** |
