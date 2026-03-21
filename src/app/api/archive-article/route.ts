import { NextRequest, NextResponse } from "next/server";
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

  // Search archive for relevant articles
  let builder = supabase
    .from("news_items")
    .select("*, news_scores(score, scan_date)")
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%`);

  if (from) builder = builder.gte("fetched_at", `${from}T00:00:00`);
  if (to) builder = builder.lte("fetched_at", `${to}T23:59:59`);

  const { data } = await builder
    .order("fetched_at", { ascending: false })
    .limit(15);

  if (!data?.length) {
    return NextResponse.json({ error: `לא נמצאו חדשות עבור "${query}"` }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const archiveData = data.map((item: any, i: number) =>
    `${i + 1}. ${item.title}\n   ${item.summary || ""}\n   מקור: ${item.source || ""}\n   תאריך: ${item.fetched_at?.split("T")[0] || ""}\n   ניקוד: ${item.news_scores?.[0]?.score || "N/A"}`
  ).join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
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

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleanText = text.replace(/—/g, "-");

  return NextResponse.json({
    text: cleanText,
    query,
    period: { from: from || "all", to: to || "now" },
    articlesUsed: data.length,
  });
}
