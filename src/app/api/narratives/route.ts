import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("globes.co.il")) return "גלובס";
  if (lower.includes("calcalist.co.il")) return "כלכליסט";
  if (lower.includes("themarker.com")) return "דה מרקר";
  if (lower.includes("ynet.co.il")) return "ynet";
  if (lower.includes("maariv.co.il")) return "מעריב";
  if (lower.includes("bizportal.co.il")) return "ביזפורטל";
  if (lower.includes("walla.co.il")) return "וואלה";
  if (lower.includes("israelhayom.co.il")) return "ישראל היום";
  if (lower.includes("ice.co.il")) return "ICE";
  return null;
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  return start.toISOString().split("T")[0];
}

// ─── Category classification (mirrors week-all logic) ───
const RE_KW = ["נדל\"ן","דירה","דירות","משכנתא","בנייה","קבלן","מחיר למשתכן","פינוי בינוי","התחדשות עירונית","מס רכישה","שכירות","מגורים","ריבית","תב\"ע","יזם","עסקאות נדל","התחלות בנייה"];
const HI_KW = ["הייטק","סטארטאפ","טכנולוגיה","בינה מלאכותית","AI","סייבר","ענן","גיוס הון","הנפקה","IPO","nvidia","אינווידיה","גוגל","אפל","מיקרוסופט","צ'יפ","שבב","יוניקורן","אקזיט","פינטק","ביוטק"];
const EC_KW = ["כלכלה","בורסה","מניות","דלק","אנרגיה","חשמל","אינפלציה","מדד","תוצר","מיסים","בנק","אשראי","ביטוח","קמעונאות","רכישה","מיזוג","שכר","אבטלה","שקל","דולר","מט\"ח"];

function classifyTitle(title: string): string {
  const t = title.toLowerCase();
  for (const k of RE_KW) if (t.includes(k.toLowerCase())) return 'נדל"ן';
  for (const k of HI_KW) if (t.includes(k.toLowerCase())) return "הייטק";
  for (const k of EC_KW) if (t.includes(k.toLowerCase())) return "כלכלה";
  return "אחר";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "";

  const today = new Date().toISOString().split("T")[0];
  const weekStart = getWeekStart();

  const { data, error } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .gte("scan_date", weekStart)
    .lte("scan_date", today)
    .order("score", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ narratives: [], weekStart, today });
  }

  const allHeadlines = data.map((s: any) => {
    const item = s.news_items;
    const realSource = detectSourceFromUrl(item.source_url) || item.source;
    const cleanTitle = (item.title || "").replace(/<[^>]*>/g, "");
    return {
      title: cleanTitle,
      source: realSource,
      score: s.score,
      scan_date: s.scan_date,
      category: classifyTitle(cleanTitle),
    };
  });

  // Filter by category if provided
  const headlines = category
    ? allHeadlines.filter((h: any) => h.category === category)
    : allHeadlines.filter((h: any) => h.score >= 30);

  const headlineList = headlines
    .map((h: any) => `[${h.scan_date}] ${h.title} (${h.source}, ציון: ${h.score})`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `אתה מנתח נרטיבים תקשורתיים${category ? ` בתחום ${category}` : ""}. קיבלת רשימת כותרות חדשות מהשבוע.

זהה את הנרטיבים המרכזיים שרצו השבוע — נושאים שחוזרים בכמה כתבות ממקורות שונים.

כותרות השבוע:
${headlineList}

החזר JSON בלבד, בפורמט הזה:
[
  {
    "title": "כותרת הנרטיב (קצרה, 3-6 מילים)",
    "count": מספר כתבות על הנושא,
    "summary": "משפט אחד שמסכם את הנרטיב",
    "sources": ["רשימת מקורות שכיסו את הנושא"]
  }
]

מקסימום 8 נרטיבים, מסודרים לפי כמות כתבות (מהרב למעט).
רק JSON, בלי הסברים.`,
      },
    ],
  });

  let narratives: any[] = [];
  try {
    const text = (response.content[0] as any).text || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      narratives = JSON.parse(match[0]);
    }
  } catch {
    narratives = [];
  }

  return NextResponse.json({ narratives, weekStart, today });
}

export const maxDuration = 30;
