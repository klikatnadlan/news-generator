import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage, type InlineButton } from "@/lib/telegram";

export const maxDuration = 60;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scores.forEach((s: any, i: number) => {
    text += `*${i + 1}.* (${s.score} נק') ${s.news_items.title}\n_${s.news_items.source}_\n\n`;
  });
  text += "מה עושים?";

  const buttons: InlineButton[][] = [
    [
      { text: "📌 תקציר", callback_data: "action:digest" },
      { text: "📝 נוסח נפרד", callback_data: "action:generate" },
    ],
    [
      { text: "🔗 מזג נרטיב", callback_data: "action:merge" },
      { text: "💬 פרשנות", callback_data: "action:commentary" },
    ],
  ];

  // Send to all sessions (anyone who used /start)
  const { data: sessions } = await supabase
    .from("telegram_sessions")
    .select("chat_id");

  let sentCount = 0;
  const chatIds = sessions?.map((s: { chat_id: number }) => s.chat_id) || [];

  for (const chatId of chatIds) {
    try {
      await sendMessage(chatId, text, { replyMarkup: { inline_keyboard: buttons } });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newsIds = scores.map((s: any) => s.news_items.id);
      await supabase.from("telegram_sessions").upsert({
        chat_id: chatId,
        last_news_ids: newsIds,
        updated_at: new Date().toISOString(),
      });

      sentCount++;
    } catch (error) {
      console.error(`Failed to send morning to ${chatId}:`, error);
    }
  }

  return NextResponse.json({ sent: true, count: sentCount });
}
