import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const body = await request.json();
  const type = body.type || "weekly"; // "weekly" or "monthly"

  // Calculate date range
  const now = new Date();
  const from = new Date(now);
  if (type === "monthly") {
    from.setDate(from.getDate() - 30);
  } else {
    from.setDate(from.getDate() - 7);
  }

  const fromDate = from.toISOString().split("T")[0];
  const toDate = now.toISOString().split("T")[0];

  // Get top news from this period
  const { data: scores } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .gte("scan_date", fromDate)
    .lte("scan_date", toDate)
    .gte("score", 40)
    .order("score", { ascending: false })
    .limit(type === "monthly" ? 20 : 10);

  if (!scores?.length) {
    return NextResponse.json({ error: "אין מספיק חדשות לתקופה זו" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const articles = scores.map((s: any, i: number) =>
    `${i + 1}. [${s.score} נק'] ${s.news_items.title}\n   ${s.news_items.summary || ""}\n   מקור: ${s.news_items.source || ""}\n   תאריך: ${s.scan_date}`
  ).join("\n\n");

  const periodLabel = type === "monthly" ? "החודש" : "השבוע";
  const wordCount = type === "monthly" ? "800-1200" : "400-600";

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: `אתה בן סולומון, מומחה נדל"ן עם מועדון צרכנות של 300,000+ חברים.
כתוב סיכום ${periodLabel} בקול שלך — ישיר, חד, עם מספרים ספציפיים.

כללים:
- ${wordCount} מילים
- פתיחה פרובוקטיבית שתופסת
- כל נקודה חייבת מספר ספציפי
- טון: שיחתי, ישיר, לא פורמלי
- עברית שיחתית: "בגדול", "בשטח", "תכלס"
- סיום: "בן סולומון והחברים מהקליקה"
- בלי מקפים ארוכים (—)
- *כוכביות* לבולד
- אל תמציא מספרים או עובדות — רק מה שמופיע בחדשות`,
    messages: [{
      role: "user",
      content: `צור סיכום ${periodLabel} (${fromDate} עד ${toDate}) מהחדשות הבאות:

${articles}

מבנה:
1. *כותרת ראשית* — משפט אחד חזק שמסכם את ${periodLabel}
2. *3-5 נקודות מפתח* — כל אחת עם כותרת בולד + 2-3 שורות הסבר עם מספרים
3. *מגמה מרכזית* — מה הכיוון? מה להבין מכל זה?
4. *מה לעשות עכשיו* — המלצה אחת ברורה לקהל
5. חתימה`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleanText = text.replace(/—/g, "-");

  return NextResponse.json({
    text: cleanText,
    type,
    period: { from: fromDate, to: toDate },
    newsCount: scores.length,
  });
}

export const maxDuration = 60;
