import { NextRequest, NextResponse } from "next/server";
import { firstText } from "@/lib/anthropic";
import { getSupabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const body = await request.json();
  const { query, from, to } = body;

  if (!query) {
    return NextResponse.json({ error: "חובה לשלוח מילות חיפוש" }, { status: 400 });
  }

  // Search the archive through the indexed `search_news` RPC — the same path
  // /api/archive uses.
  //
  // This used to run `.or(title.ilike.%q%, summary.ilike.%q%)` directly against
  // news_items. A leading-wildcard ILIKE across two columns cannot use the
  // trigram index, so it sequentially scanned all 32K+ rows; add the Claude call
  // on top and the request blew Vercel's 60s ceiling with a bare
  // FUNCTION_INVOCATION_TIMEOUT (measured 2026-08-25 on "פינוי בינוי").
  // The RPC answers the same question in ~1.5s.
  const { data: rpcRows, error: rpcErr } = await supabase.rpc("search_news", {
    p_query: query,
    p_from: from || null,
    p_to: to || null,
    p_limit: 60,
    p_offset: 0,
  });
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  // Same Hebrew word-boundary gate as the archive search: `search_news` matches
  // substrings, and in Hebrew "-ים" pluralises almost everything, so without
  // this an article would be written from coincidental matches.
  const HEB = "א-ת";
  const words: string[] = query
    .toLowerCase()
    .split(/[\s,"'׳״]+/)
    .filter((w: string) => w.length > 2);
  const relevant = (rpcRows || []).filter((r: { title?: string; summary?: string }) => {
    const text = `${r.title || ""} ${r.summary || ""}`.toLowerCase();
    return words.every((w: string) => {
      const safe = w.replace(/[^\p{L}\p{N}]/gu, "");
      return new RegExp(`(?:^|[^${HEB}])[הובכלמשד]?${safe}(?![${HEB}])`, "u").test(text);
    });
  });

  const data = relevant.slice(0, 15);

  if (!data?.length) {
    return NextResponse.json({ error: `לא נמצאו חדשות עבור "${query}"` }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const archiveData = data.map((item: any, i: number) =>
    `${i + 1}. ${item.title}\n   ${item.summary || ""}\n   מקור: ${item.source || ""}\n   תאריך: ${item.fetched_at?.split("T")[0] || ""}\n   ניקוד: ${item.news_scores?.[0]?.score || "N/A"}`
  ).join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    // 2200, not 3000, and that is a measurement rather than a guess. This route
    // answers a button on /archive and was returning a bare 504
    // FUNCTION_INVOCATION_TIMEOUT. Measured 2026-08-25 on this exact prompt:
    //   3000 -> 55.7s, model stopped on its own at 2030 tokens
    //   2200 -> 47.8s, stopped on its own at 1731 tokens (complete article)
    //   1600 -> 43.3s, stop_reason "max_tokens" — the article gets cut off
    // The model's natural length here is ~1700-2000 tokens, so 3000 bought no
    // extra content, only latency against Vercel's hard 60s ceiling. 2200 keeps
    // the article whole and leaves ~12s of headroom.
    max_tokens: 2200,
    system: `אתה בן סולומון, מומחה נדל"ן עם מועדון צרכנות של 300,000+ חברים.
כתוב כתבה ארכיונית מקיפה על בסיס נתונים היסטוריים.

כללים:
- 800-1,500 מילים
- כל טענה חייבת להיות מבוססת על הנתונים שהתקבלו
- סדר כרונולוגי — מה קרה קודם, מה אחר כך, מה עכשיו
- מספרים ספציפיים תמיד
- טון: מומחה שמסביר, לא מטיף
- עברית שיחתית
- בלי מקפים ארוכים (—)
- *כוכביות* לבולד
- אל תמציא מספרים או עובדות!
- חתימה: "בן סולומון והחברים מהקליקה"`,
    messages: [{
      role: "user",
      content: `כתוב כתבה ארכיונית על הנושא: "${query}"

הנה כל החדשות הרלוונטיות שנמצאו בארכיון (${data.length} ידיעות):

${archiveData}

מבנה הכתבה:
1. *כותרת* — חזקה, עם מספר
2. *פתיחה* — למה זה חשוב, מה השתנה
3. *ציר זמן* — מה קרה חודש אחרי חודש (לפי התאריכים)
4. *מגמה* — לאן הולכים?
5. *השורה התחתונה* — מה לעשות עם המידע הזה
6. חתימה`
    }],
  });

  const text = firstText(response);
  const cleanText = text.replace(/—/g, "-");

  return NextResponse.json({
    text: cleanText,
    query,
    period: { from: from || "all", to: to || "now" },
    articlesUsed: data.length,
  });
}

export const maxDuration = 60;
