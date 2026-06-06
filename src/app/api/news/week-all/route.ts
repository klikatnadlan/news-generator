import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("klikatnadlan.co.il")) return 'קליקת הנדל"ן';
  if (lower.includes("globes.co.il")) return "גלובס";
  if (lower.includes("calcalist.co.il")) return "כלכליסט";
  if (lower.includes("themarker.com")) return "דה מרקר";
  if (lower.includes("ynet.co.il")) return "ynet";
  if (lower.includes("maariv.co.il")) return "מעריב";
  if (lower.includes("bizportal.co.il")) return "ביזפורטל";
  if (lower.includes("walla.co.il")) return "וואלה";
  if (lower.includes("israelhayom.co.il")) return "ישראל היום";
  if (lower.includes("news1.co.il")) return "News1";
  if (lower.includes("ice.co.il")) return "ICE";
  if (lower.includes("kan.org.il")) return "כאן";
  if (lower.includes("nadlancenter.co.il")) return 'מרכז הנדל"ן';
  if (lower.includes("magdilim.co.il")) return "מגדילים";
  if (lower.includes("madlan.co.il")) return "מדלן";
  if (lower.includes("homeless.co.il")) return "הומלס";
  if (lower.includes("dira.co.il")) return "דירה";
  return null;
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  return start.toISOString().split("T")[0];
}

// ─── Auto-classify headline into category ───
const REALESTATE_KEYWORDS = [
  "נדל\"ן", "דירה", "דירות", "משכנתא", "משכנתאות", "בנייה", "קבלן", "קבלנים",
  "מחיר למשתכן", "פינוי בינוי", "פינוי-בינוי", "התחדשות עירונית", "תמ\"א",
  "מס רכישה", "מס שבח", "שכירות", "שכ\"ד", "היטל השבחה",
  "מגורים", "רוכשים", "רוכשי", "קונים", "רכישת דירה", "שוק הדיור",
  "בנק ישראל", "ריבית", "ריביות", "בית מגורים", "מחירי דיור",
  "תב\"ע", "בניין", "קומות", "יזם", "יזמים", "פרויקט מגורים",
  "עסקאות נדל", "מכירות דירות", "התחלות בנייה", "היצע דירות",
];

const HITECH_KEYWORDS = [
  "הייטק", "סטארטאפ", "סטארט-אפ", "טכנולוגיה", "אפליקציה",
  "בינה מלאכותית", "AI", "סייבר", "ענן", "cloud", "SaaS",
  "גיוס הון", "משקיעים", "הנפקה", "IPO", "SPAC",
  "nvidia", "אינווידיה", "גוגל", "אפל", "מיקרוסופט", "מטא", "אמזון",
  "צ'יפ", "שבב", "מוליכים למחצה", "תוכנה", "פיתוח", "קוד",
  "יוניקורן", "אקזיט", "exit", "venture", "VC",
  "רובוט", "אוטומציה", "פינטק", "fintech", "ביוטק", "biotech",
];

const ECONOMY_KEYWORDS = [
  "כלכלה", "כלכלי", "בורסה", "מניות", "מנייה", "שוק ההון",
  "דלק", "אנרגיה", "חשמל", "גז", "נפט",
  "ייצוא", "יבוא", "סחר", "מכס", "תעופה", "ספנות",
  "אינפלציה", "מדד", "תוצר", "תמ\"ג", "GDP",
  "מיסים", "מע\"מ", "תקציב", "גירעון", "חוב",
  "בנק", "אשראי", "ביטוח", "פנסיה", "השקעה", "השקעות",
  "קמעונאות", "צרכנות", "מזון", "רשת", "רכישה", "מיזוג",
  "תעשייה", "ייצור", "עובדים", "שכר", "אבטלה", "תעסוקה",
  "שקל", "דולר", "אירו", "מט\"ח",
];

function classifyHeadline(title: string, summary?: string): "נדל\"ן" | "הייטק" | "כלכלה" | "אחר" {
  const text = `${title} ${summary || ""}`.toLowerCase();

  // Check real estate first (priority)
  for (const kw of REALESTATE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return "נדל\"ן";
  }

  // Check hitech
  for (const kw of HITECH_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return "הייטק";
  }

  // Check economy
  for (const kw of ECONOMY_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return "כלכלה";
  }

  return "אחר";
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];
  const weekStart = getWeekStart();

  // Fetch ALL scored items this week (no minimum score)
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

  const news = (data || []).map((s: any) => {
    const item = s.news_items;
    const realSource = detectSourceFromUrl(item.source_url) || item.source;
    const cleanTitle = (item.title || "").replace(/<[^>]*>/g, "");
    const cleanSummary = (item.summary || "").replace(/<[^>]*>/g, "");
    const category = classifyHeadline(cleanTitle, cleanSummary);

    return {
      ...item,
      title: cleanTitle,
      summary: cleanSummary,
      source: realSource,
      score: s.score,
      reasoning: s.reasoning,
      score_id: s.id,
      scan_date: s.scan_date,
      category,
    };
  });

  return NextResponse.json({
    news,
    weekStart,
    today,
  });
}
