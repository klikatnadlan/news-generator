import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Weekly strategic brief. CLICK-TRIGGERED ONLY (no cron) and cached per ISO
// week, so even many clicks cost at most ~1 Sonnet call/week. Synthesizes from
// token-free inputs: the trend radar + the week's top headlines.
function weekStartIso(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back to Sunday
  return d.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const weekStart = weekStartIso();
  const cacheKey = `weekly_brief|${weekStart}`;

  // Cache: same week → return instantly, zero tokens.
  if (!refresh) {
    try {
      const { data: cached } = await supabase
        .from("narrative_cache")
        .select("narratives, created_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (cached?.narratives?.text) {
        return NextResponse.json({ brief: cached.narratives.text, generatedAt: cached.created_at, cached: true });
      }
    } catch {
      /* fall through to generate */
    }
  }

  // ─── Token-free inputs ───
  // 1) Trend radar (this week vs last)
  const { data: radar } = await supabase.rpc("alert_radar");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hot = ((radar || []) as any[])
    .map((a) => ({ name: a.name, cur: Number(a.cur_7d) || 0, prev: Number(a.prev_7d) || 0 }))
    .filter((a) => a.cur > 0)
    .sort((a, b) => b.cur - a.cur)
    .slice(0, 18);
  const hotLines = hot.map((a) => `- ${a.name}: ${a.cur} השבוע (מול ${a.prev} שבוע שעבר)`).join("\n");

  // 2) Top headlines of the week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: scores } = await supabase
    .from("news_scores")
    .select("score, scan_date, news_items(title, source_url)")
    .gte("scan_date", weekAgo.toISOString().split("T")[0])
    .order("score", { ascending: false })
    .limit(30);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headlines = ((scores || []) as any[])
    .map((s) => (s.news_items?.title || "").replace(/<[^>]*>/g, ""))
    .filter(Boolean)
    .slice(0, 30);
  const headlineLines = headlines.map((t: string) => `- ${t}`).join("\n");

  if (hot.length === 0 && headlines.length === 0) {
    return NextResponse.json({ brief: "אין מספיק נתונים השבוע כדי לייצר מודיעין. נסה אחרי הסריקה הבאה.", cached: false });
  }

  const prompt = `אתה אנליסט נדל"ן בכיר שכותב בריף מודיעין שבועי לבן סולומון (מייסד קליקת הנדל"ן).

📈 מגמות (נפח באזים, השבוע מול שבוע שעבר):
${hotLines || "(אין)"}

📰 כותרות מובילות השבוע:
${headlineLines || "(אין)"}

כתוב בריף קצר, חד ואסטרטגי בעברית עסקית. מבנה:
*מה רץ השבוע* — 2-3 הסיפורים המרכזיים, עם מספרים/שמות.
*מה מתחמם* — נושאים/חברות שנפח הסיקור שלהם עולה, ומה זה אומר.
*מהלכי חברות בולטים* — אם יש.
*למה לשים לב שבוע הבא* — תובנה אחת קדימה.

כללים: נקודתי, בלי הקדמות ובלי מליצות, בלי מקפים ארוכים, מבוסס רק על הנתונים שקיבלת. עד ~200 מילים.`;

  let brief = "";
  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brief = ((resp.content[0] as any)?.text || "").trim();
  } catch (e) {
    console.error("weekly-brief: generation failed", e);
    return NextResponse.json({ error: "לא הצלחנו לייצר את המודיעין כרגע. נסה שוב." }, { status: 500 });
  }

  if (brief) {
    try {
      await supabase
        .from("narrative_cache")
        .upsert({ cache_key: cacheKey, narratives: { text: brief }, count: hot.length, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
    } catch (cacheErr) {
      console.error("weekly-brief: cache write failed", cacheErr);
    }
  }

  return NextResponse.json({ brief, generatedAt: new Date().toISOString(), cached: false });
}

export const maxDuration = 60;
