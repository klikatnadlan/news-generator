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
  };
  if (options?.parseMode) {
    body.parse_mode = options.parseMode;
  }
  if (options?.replyMarkup) {
    body.reply_markup = JSON.stringify(options.replyMarkup);
  }
  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("sendMessage failed:", data.description);
  }
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
  const res = await fetch(`${API_BASE}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("editMessage failed:", data.description);
  }
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
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
