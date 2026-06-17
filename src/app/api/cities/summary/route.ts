import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { findCity } from "@/lib/cities";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// City intelligence summary — CLICK-TRIGGERED ONLY, Sonnet, cached.
// Pulls the city's articles (token-free retrieval) and synthesizes: key points,
// active developers/contractors, and the price/demand trend.
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const cityName = sp.get("city") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const refresh = sp.get("refresh") === "1";
  const city = findCity(cityName);
  if (!city) return NextResponse.json({ error: "עיר לא נמצאה" }, { status: 404 });

  const cacheKey = `city_summary|${city.name}|${from}|${to}`;
  if (!refresh) {
    try {
      const { data: cached } = await supabase.from("narrative_cache").select("narratives, created_at").eq("cache_key", cacheKey).maybeSingle();
      if (cached?.narratives?.text) return NextResponse.json({ summary: cached.narratives.text, cached: true });
    } catch { /* fall through */ }
  }

  // Token-free retrieval of the city's articles.
  const { data, error } = await supabase.rpc("search_news", {
    p_query: city.name,
    p_from: from || null,
    p_to: to || null,
    p_limit: 45,
    p_offset: 0,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[];
  if (rows.length === 0) {
    return NextResponse.json({ summary: `לא נמצאו באזים על ${city.name} בטווח הזה. נסה להרחיב את הטווח, או להוסיף מקורות מקומיים.`, cached: false });
  }
  const list = rows
    .map((r) => `- ${(r.title || "").replace(/<[^>]*>/g, "")}${r.summary ? ` — ${(r.summary || "").replace(/<[^>]*>/g, "").slice(0, 160)}` : ""}`)
    .join("\n");

  const prompt = `אתה אנליסט נדל"ן שמכין תדריך מודיעין על העיר ${city.name} (מחוז ${city.district}) עבור צוות שיווק שמוכר שם פרויקט.

קיבלת ${rows.length} כתבות על העיר:
${list}

כתוב תדריך קצר וחד בעברית עסקית. מבנה:
*הנקודות המרכזיות* — 3-5 נקודות על מה שקורה בעיר (פרויקטים, מחירים, רגולציה, ביקוש), עם מספרים/שמות.
*קבלנים ויזמים פעילים* — מי פעיל בעיר לפי הכתבות (שמות חברות). אם אין, כתוב "לא זוהו בכתבות".
*מגמת מחירים וביקוש* — משפט או שניים.
*זווית שיווקית* — תובנה אחת שיכולה לעזור למכור פרויקט בעיר.

כללים: נקודתי, בלי הקדמות, בלי מקפים ארוכים, מבוסס רק על הכתבות. עד ~200 מילים.`;

  let summary = "";
  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1300,
      messages: [{ role: "user", content: prompt }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary = ((resp.content[0] as any)?.text || "").trim();
  } catch (e) {
    console.error("city summary failed", e);
    return NextResponse.json({ error: "לא הצלחנו לייצר את התדריך כרגע. נסה שוב." }, { status: 500 });
  }

  if (summary) {
    try {
      await supabase.from("narrative_cache").upsert({ cache_key: cacheKey, narratives: { text: summary }, count: rows.length, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
    } catch { /* ignore */ }
  }
  return NextResponse.json({ summary, articleCount: rows.length, cached: false });
}

export const maxDuration = 60;
