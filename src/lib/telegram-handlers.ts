import { getSupabase } from "./supabase";
import {
  sendMessage,
  editMessage,
  answerCallbackQuery,
  sendAudio,
  sendDocument,
  splitMessage,
  downloadFile,
  type InlineButton,
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

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const VOICE_ID = "bPFQW9IdOgp0dTMgOL0D";

// ─── Auth — open to all ───
export function isAuthorized(_userId: number): boolean {
  return true;
}

// ─── Session helpers ───
async function getSession(chatId: number) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("telegram_sessions")
    .select("*")
    .eq("chat_id", chatId)
    .single();
  return data;
}

async function saveSession(chatId: number, updates: Record<string, unknown>) {
  const supabase = getSupabase();
  // First try update
  const { data } = await supabase
    .from("telegram_sessions")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .select()
    .single();

  if (!data) {
    // Row doesn't exist, insert
    await supabase
      .from("telegram_sessions")
      .insert({ chat_id: chatId, ...updates, updated_at: new Date().toISOString() });
  }
}

// ─── Button layouts ───
function newsActionButtons(newsIds: string[]): InlineButton[][] {
  // Encode news IDs in callback data so we don't depend on session
  const idsParam = newsIds.slice(0, 3).join(",");
  return [
    [
      { text: "📌 תקציר", callback_data: `do:digest:${idsParam}` },
      { text: "📝 נוסח חדשה 1", callback_data: `do:generate:${newsIds[0] || ""}` },
    ],
    [
      { text: "🔗 מזג נרטיב", callback_data: `do:merge:${idsParam}` },
      { text: "💬 פרשנות", callback_data: `do:commentary:${newsIds[0] || ""}` },
    ],
  ];
}

function textActionButtons(): InlineButton[][] {
  return [
    [
      { text: "📋 שלח כטקסט", callback_data: "do:copy:" },
      { text: "🔊 קול בן", callback_data: "do:voice:" },
    ],
    [
      { text: "📰 הרחב לכתבה", callback_data: "do:article:" },
      { text: "🧪 ציון אנושיות", callback_data: "do:humanity:" },
    ],
  ];
}

// ─── Source name helper ───
function getSourceName(source: string): string {
  if (!source) return "לא ידוע";
  const s = source.toLowerCase();
  if (s.includes("globes") || s.includes("גלובס")) return "גלובס";
  if (s.includes("calcalist") || s.includes("כלכליסט")) return "כלכליסט";
  if (s.includes("themarker") || s.includes("דה מרקר")) return "דה מרקר";
  if (s.includes("ynet") || s.includes("ידיעות")) return "ynet";
  if (s.includes("maariv") || s.includes("מעריב")) return "מעריב";
  if (s.includes("walla") || s.includes("וואלה")) return "וואלה";
  if (s.includes("bizportal")) return "bizportal";
  if (s.includes("madlan") || s.includes("מדלן")) return "מדלן";
  // Return domain or original
  try {
    const url = new URL(source);
    return url.hostname.replace("www.", "");
  } catch {
    return source.length > 20 ? source.slice(0, 20) + "..." : source;
  }
}

// ─── TTS helper ───
async function generateTTS(text: string): Promise<ArrayBuffer> {
  const cleanText = text.replace(/\*/g, "");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: cleanText,
      model_id: "eleven_v3",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error("TTS failed");
  return res.arrayBuffer();
}

// ─── STT helper ───
async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "voice.ogg");
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

// ─── Send result with buttons ───
async function sendResult(chatId: number, text: string, msgId?: number) {
  const buttons = textActionButtons();
  if (text.length > 4000) {
    if (msgId) await editMessage(chatId, msgId, "✅ מוכן!").catch(() => {});
    await sendDocument(chatId, text, "content.txt", text.slice(0, 150) + "...");
    await sendMessage(chatId, "בחר פעולה:", { replyMarkup: { inline_keyboard: buttons } });
  } else {
    if (msgId) {
      await editMessage(chatId, msgId, text, { replyMarkup: { inline_keyboard: buttons } }).catch(() => {});
    } else {
      await sendMessage(chatId, text, { replyMarkup: { inline_keyboard: buttons } });
    }
  }
}

// ─── /start ───
async function handleStart(chatId: number): Promise<void> {
  await sendMessage(chatId, `🤖 *בוט החדשות של קליקת הנדל"ן*

שלום! אני הבוט שמנהל את מערכת החדשות והתוכן של בן סולומון.

*פקודות:*
/news — חדשות מובילות היום
/digest — תקציר יומי מוכן
/merge — מזג נרטיב מכל החדשות
/voice — הפוך טקסט אחרון לקול בן
/article — הרחב לכתבה מלאה
/commentary — פרשנות בן סולומון
/status — סטטוס המערכת

*תיקונים:*
כתוב טקסט חופשי → מתקן את הנוסח האחרון
שלח הקלטה 🎤 → מתמלל ומתקן

בהצלחה! 🚀`);
}

// ─── /news ───
async function handleNews(chatId: number): Promise<void> {
  const supabase = getSupabase();
  const today = new Date().toISOString().split("T")[0];

  // Try today first, then yesterday
  let { data: scores } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .eq("scan_date", today)
    .order("score", { ascending: false })
    .limit(6);

  if (!scores || scores.length === 0) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const res = await supabase
      .from("news_scores")
      .select("*, news_items(*)")
      .eq("scan_date", yesterday)
      .order("score", { ascending: false })
      .limit(6);
    scores = res.data;
  }

  if (!scores || scores.length === 0) {
    await sendMessage(chatId, "אין חדשות. נסה /news מאוחר יותר.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newsIds = scores.map((s: any) => s.news_items.id);
  await saveSession(chatId, { last_news_ids: newsIds });

  let text = "📌 *חדשות מובילות היום:*\n\n";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scores.forEach((s: any, i: number) => {
    const sourceName = getSourceName(s.news_items.source || s.news_items.feed_url || "");
    text += `*${i + 1}.* (${s.score} נק') ${s.news_items.title}\n_${sourceName}_\n\n`;
  });
  text += "בחר פעולה:";

  await sendMessage(chatId, text, { replyMarkup: { inline_keyboard: newsActionButtons(newsIds) } });
}

// ─── /status ───
async function handleStatus(chatId: number): Promise<void> {
  const supabase = getSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { count } = await supabase
    .from("news_scores")
    .select("*", { count: "exact", head: true })
    .eq("scan_date", today);

  await sendMessage(chatId,
    `📊 *סטטוס מערכת*\n\n` +
    `📰 חדשות היום: ${count || 0}\n` +
    `📅 תאריך: ${today}\n` +
    `✅ בוט פעיל`
  );
}

// ─── Process AI operations (called from webhook or worker) ───
export async function processJob(
  chatId: number,
  jobType: string,
  params: Record<string, unknown>,
  statusMsgId?: number
): Promise<void> {
  const supabase = getSupabase();

  try {
    let resultText = "";

    switch (jobType) {
      case "digest": {
        const newsIds = (params.newsIds as string[] | undefined) || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let articles: any[] | undefined;

        if (newsIds.length > 0) {
          const { data: items } = await supabase
            .from("news_items")
            .select("*")
            .in("id", newsIds.slice(0, 3));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          articles = items?.map((item: any) => ({
            title: item.title,
            summary: item.summary || "",
            source: getSourceName(item.source || item.feed_url || ""),
          }));
        } else {
          const today = new Date().toISOString().split("T")[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
          let { data: scores } = await supabase
            .from("news_scores")
            .select("*, news_items(*)")
            .eq("scan_date", today)
            .order("score", { ascending: false })
            .limit(3);
          if (!scores?.length) {
            const res = await supabase
              .from("news_scores")
              .select("*, news_items(*)")
              .eq("scan_date", yesterday)
              .order("score", { ascending: false })
              .limit(3);
            scores = res.data;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          articles = scores?.map((sc: any) => ({
            title: sc.news_items.title,
            summary: sc.news_items.summary || "",
            source: getSourceName(sc.news_items.source || sc.news_items.feed_url || ""),
          }));
        }

        if (!articles?.length) {
          await sendMessage(chatId, "אין חדשות היום ליצירת תקציר.");
          return;
        }
        resultText = await generateDailyDigest(articles);
        await saveSession(chatId, { last_generated_text: resultText, last_type: "digest" });
        break;
      }

      case "generate": {
        const newsItemId = params.newsItemId as string;
        const { data: newsItem } = await supabase
          .from("news_items")
          .select("*")
          .eq("id", newsItemId)
          .single();

        if (!newsItem) { await sendMessage(chatId, "חדשה לא נמצאה."); return; }

        resultText = await generateWhatsAppText(
          { title: newsItem.title, summary: newsItem.summary || "", source: getSourceName(newsItem.source || newsItem.feed_url || "") },
          "regular"
        );
        await saveSession(chatId, { last_generated_text: resultText, last_type: "message", last_news_item_id: newsItemId });
        break;
      }

      case "merge": {
        const mergeIds = (params.newsIds as string[] | undefined) || [];
        let items;
        if (mergeIds.length > 0) {
          const { data } = await supabase.from("news_items").select("*").in("id", mergeIds);
          items = data;
        } else {
          const session = await getSession(chatId);
          const ids = session?.last_news_ids || [];
          if (ids.length < 2) { await sendMessage(chatId, "צריך לפחות 2 חדשות. שלח /news קודם."); return; }
          const { data } = await supabase.from("news_items").select("*").in("id", ids.slice(0, 3));
          items = data;
        }
        if (!items?.length) { await sendMessage(chatId, "חדשות לא נמצאו."); return; }

        // Single Claude call - pass articles as "pre-generated texts"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textsForMerge = items.map((item: any) => ({
          title: item.title,
          source: getSourceName(item.source || item.feed_url || ""),
          text: `${item.title}\n${item.summary || ""}`,
        }));
        resultText = await generateMergedNarrative(textsForMerge);
        await saveSession(chatId, { last_generated_text: resultText, last_type: "merge" });
        break;
      }

      case "commentary": {
        const commentaryId = params.newsItemId as string;
        const { data: newsItem2 } = await supabase
          .from("news_items")
          .select("*")
          .eq("id", commentaryId)
          .single();

        if (!newsItem2) { await sendMessage(chatId, "חדשה לא נמצאה."); return; }

        const commentary = await generateCommentary({
          title: newsItem2.title,
          summary: newsItem2.summary || "",
          source: getSourceName(newsItem2.source || newsItem2.feed_url || ""),
        });
        resultText = `💬 *פרשנות בן סולומון*\n\n`;
        resultText += `*מה קרה:* ${commentary.what_happened}\n\n`;
        resultText += `*למה זה חשוב:* ${commentary.why_important}\n\n`;
        resultText += `*מה אנשים מפספסים:* ${commentary.real_understanding}\n\n`;
        resultText += `*הזווית שלנו:* ${commentary.our_angle}`;
        await saveSession(chatId, { last_generated_text: resultText, last_type: "commentary" });
        break;
      }

      case "article": {
        const session = await getSession(chatId);
        const fromText = (params.fromNarrative as string) || session?.last_generated_text || "";
        if (!fromText) { await sendMessage(chatId, "אין טקסט להרחבה."); return; }
        resultText = await generateArticle(
          { title: "", summary: fromText, source: "" },
          fromText
        );
        await saveSession(chatId, { last_generated_text: resultText, last_type: "article" });
        break;
      }

      case "refine": {
        resultText = await refineText(params.currentText as string, params.instruction as string);
        await saveSession(chatId, { last_generated_text: resultText });
        break;
      }

      case "voice_refine": {
        const audioBuffer = await downloadFile(params.fileId as string);
        const transcript = await transcribeAudio(audioBuffer);
        if (!transcript) {
          await sendMessage(chatId, "לא הצלחתי לתמלל. נסה שוב.");
          return;
        }
        await sendMessage(chatId, `🎤 תמלול: _${transcript}_\nמתקן...`);
        resultText = await refineText(params.currentText as string, transcript);
        await saveSession(chatId, { last_generated_text: resultText });
        break;
      }

      case "voice": {
        const session = await getSession(chatId);
        const voiceText = (params.text as string) || session?.last_generated_text || "";
        if (!voiceText) { await sendMessage(chatId, "אין טקסט להמרה."); return; }
        const audio = await generateTTS(voiceText);
        await sendAudio(chatId, audio, `ben-solomon-${Date.now()}.mp3`, "🔊 הקלטה בקול בן סולומון");
        if (statusMsgId) await editMessage(chatId, statusMsgId, "✅ ההקלטה נשלחה!").catch(() => {});
        return;
      }

      case "humanity": {
        const session = await getSession(chatId);
        const hText = (params.text as string) || session?.last_generated_text || "";
        if (!hText) { await sendMessage(chatId, "אין טקסט לבדוק."); return; }
        const result = await checkHumanityScore(hText);
        const emoji = result.score >= 7 ? "👍" : result.score >= 5 ? "⚠️" : "🚨";
        resultText = `🧪 *ציון אנושיות:* ${result.score}/10 ${emoji}\n\n`;
        if (result.flags?.length) resultText += `דגלים: ${result.flags.join(" · ")}\n`;
        if (result.suggestion) resultText += `\n💡 ${result.suggestion}`;
        break;
      }

      case "copy": {
        const session = await getSession(chatId);
        if (session?.last_generated_text) {
          const chunks = splitMessage(session.last_generated_text);
          for (const chunk of chunks) {
            await sendMessage(chatId, chunk, { parseMode: "HTML" });
          }
        }
        return;
      }

      default:
        await sendMessage(chatId, "פעולה לא מוכרת.");
        return;
    }

    if (resultText) {
      await sendResult(chatId, resultText, statusMsgId);
    }
  } catch (error) {
    console.error(`Job ${jobType} failed:`, error);
    if (statusMsgId) {
      await editMessage(chatId, statusMsgId, "❌ שגיאה. נסה שוב.").catch(() => {});
    } else {
      await sendMessage(chatId, "❌ שגיאה. נסה שוב.");
    }
  }
}

// ─── Callback query handler ───
async function handleCallback(chatId: number, callbackId: string, data: string): Promise<void> {
  await answerCallbackQuery(callbackId, "מעבד...");

  // Parse: do:action:params
  const parts = data.split(":");
  const action = parts[1] || "";
  const param = parts[2] || "";

  switch (action) {
    case "digest": {
      const msg = await sendMessage(chatId, "⏳ מייצר תקציר...");
      const ids = param ? param.split(",") : [];
      // Queue for worker (takes >10s)
      await queueJob(chatId, "digest", { newsIds: ids }, msg.message_id);
      return;
    }
    case "generate": {
      const msg = await sendMessage(chatId, "⏳ מייצר נוסח...");
      await queueJob(chatId, "generate", { newsItemId: param }, msg.message_id);
      return;
    }
    case "merge": {
      const msg = await sendMessage(chatId, "⏳ ממזג נרטיב...");
      const ids = param ? param.split(",") : [];
      await queueJob(chatId, "merge", { newsIds: ids }, msg.message_id);
      return;
    }
    case "commentary": {
      const msg = await sendMessage(chatId, "⏳ מייצר פרשנות...");
      await queueJob(chatId, "commentary", { newsItemId: param }, msg.message_id);
      return;
    }
    case "copy":
      return processJob(chatId, "copy", {});
    case "voice": {
      const msg = await sendMessage(chatId, "⏳ מייצר הקלטה בקול בן...");
      await queueJob(chatId, "voice", {}, msg.message_id);
      return;
    }
    case "article": {
      const msg = await sendMessage(chatId, "⏳ מרחיב לכתבה...");
      await queueJob(chatId, "article", {}, msg.message_id);
      return;
    }
    case "humanity": {
      const msg = await sendMessage(chatId, "⏳ בודק אנושיות...");
      await queueJob(chatId, "humanity", {}, msg.message_id);
      return;
    }
    default:
      await sendMessage(chatId, "פעולה לא מוכרת.");
  }
}

// ─── Queue job for worker ───
async function queueJob(chatId: number, jobType: string, params: Record<string, unknown>, statusMsgId?: number) {
  const supabase = getSupabase();
  await supabase.from("telegram_jobs").insert({
    chat_id: chatId,
    job_type: jobType,
    params,
    status: "pending",
    reply_to_message_id: statusMsgId,
  });
}

// ─── Main router ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function routeUpdate(update: any): Promise<void> {
  if (update.callback_query) {
    const cb = update.callback_query;
    return handleCallback(cb.message.chat.id, cb.id, cb.data);
  }

  const message = update.message;
  if (!message) return;
  const chatId = message.chat.id;

  // Voice message
  if (message.voice) {
    const session = await getSession(chatId);
    if (!session?.last_generated_text) {
      await sendMessage(chatId, "אין טקסט לתקן. שלח /digest קודם, ואז שלח הקלטה.");
      return;
    }
    const msg = await sendMessage(chatId, "⏳ מתמלל ומתקן...");
    await queueJob(chatId, "voice_refine", {
      fileId: message.voice.file_id,
      currentText: session.last_generated_text,
    }, msg.message_id);
    return;
  }

  const text = message.text?.trim();
  if (!text) return;

  // Commands (direct execution - fast, no Claude)
  if (text === "/start" || text.startsWith("/start@")) return handleStart(chatId);
  if (text === "/news") return handleNews(chatId);
  if (text === "/status") return handleStatus(chatId);
  if (text === "/cancel") {
    const supabase = getSupabase();
    await supabase.from("telegram_jobs").update({ status: "cancelled" }).eq("chat_id", chatId).in("status", ["pending", "running"]);
    await sendMessage(chatId, "✅ בוטלו כל העבודות.");
    return;
  }

  // Commands that need AI (queue for worker)
  if (text === "/digest") {
    const session = await getSession(chatId);
    const msg = await sendMessage(chatId, "⏳ מייצר תקציר...");
    await queueJob(chatId, "digest", { newsIds: session?.last_news_ids || [] }, msg.message_id);
    return;
  }
  if (text === "/merge") {
    const session = await getSession(chatId);
    const msg = await sendMessage(chatId, "⏳ ממזג נרטיב...");
    await queueJob(chatId, "merge", { newsIds: session?.last_news_ids || [] }, msg.message_id);
    return;
  }
  if (text.startsWith("/generate")) {
    const session = await getSession(chatId);
    const newsIds = session?.last_news_ids || [];
    if (newsIds.length === 0) { await sendMessage(chatId, "אין חדשות. שלח /news קודם."); return; }
    const num = parseInt(text.split(" ")[1], 10);
    const idx = (isNaN(num) ? 1 : num) - 1;
    const msg = await sendMessage(chatId, `⏳ מייצר נוסח לחדשה ${idx + 1}...`);
    await queueJob(chatId, "generate", { newsItemId: newsIds[idx] || newsIds[0] }, msg.message_id);
    return;
  }
  if (text === "/article") {
    const msg = await sendMessage(chatId, "⏳ מרחיב לכתבה...");
    await queueJob(chatId, "article", {}, msg.message_id);
    return;
  }
  if (text === "/voice") {
    const msg = await sendMessage(chatId, "⏳ מייצר הקלטה בקול בן...");
    await queueJob(chatId, "voice", {}, msg.message_id);
    return;
  }
  if (text === "/commentary") {
    const session = await getSession(chatId);
    const newsIds = session?.last_news_ids || [];
    if (newsIds.length === 0) { await sendMessage(chatId, "אין חדשות. שלח /news קודם."); return; }
    const msg = await sendMessage(chatId, "⏳ מייצר פרשנות...");
    await queueJob(chatId, "commentary", { newsItemId: newsIds[0] }, msg.message_id);
    return;
  }

  // Free text → AI refine
  if (!text.startsWith("/")) {
    const session = await getSession(chatId);
    if (!session?.last_generated_text) {
      await sendMessage(chatId, "אין טקסט לתקן. שלח /digest קודם, ואז כתוב מה לשנות.");
      return;
    }
    const msg = await sendMessage(chatId, "⏳ מתקן...");
    await queueJob(chatId, "refine", {
      currentText: session.last_generated_text,
      instruction: text,
    }, msg.message_id);
    return;
  }

  await sendMessage(chatId, "פקודה לא מוכרת. שלח /start לרשימת הפקודות.");
}

export { textActionButtons, saveSession as updateSession };
