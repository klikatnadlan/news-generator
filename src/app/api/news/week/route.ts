import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

// ─── Real-estate-only keyword filter ───
// The home feed is a NADLAN-only stream. Articles that score well for
// "WhatsApp interest" but aren't actually about real estate (politics,
// general tech, defense, finance-without-housing-angle) get filtered out
// here so the home page stays focused.
const REALESTATE_KEYWORDS = [
  "נדל\"ן", "נדלן", "דירה", "דירות", "משכנתא", "משכנתאות",
  "בנייה", "בניה", "קבלן", "קבלנים", "יזם", "יזמים",
  "מחיר למשתכן", "פינוי בינוי", "פינוי-בינוי", "התחדשות עירונית", "תמ\"א",
  "מס רכישה", "מס שבח", "שכירות", "שכ\"ד", "היטל השבחה",
  "מגורים", "רוכשים", "רוכשי", "קונים", "רכישת דירה", "שוק הדיור",
  "ריבית", "ריביות", "בית מגורים", "מחירי דיור", "דיור",
  "תב\"ע", "בניין", "בניינים", "קומות", "פרויקט מגורים", "מגדל",
  "עסקאות נדל", "מכירות דירות", "התחלות בנייה", "היצע דירות",
  "השכרה", "שוכרים", "בעלי דירות", "משקיע נדל",
  "נטיש", "התחדשות", "תכנון ובניה", "ועדת תכנון",
];

const REALESTATE_SOURCES = new Set([
  'מרכז הנדל"ן',
  "מגדילים",
  "מדלן",
  "הומלס",
  "דירה",
]);

function isRealEstate(title: string, summary: string, source: string): boolean {
  // Source-based fast path: dedicated real-estate sources are always allowed
  if (REALESTATE_SOURCES.has(source)) return true;
  const text = `${title} ${summary || ""}`.toLowerCase();
  for (const kw of REALESTATE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return true;
  }
  return false;
}

/** Get the start of the current Hebrew week (Sunday) */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sunday
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  return start.toISOString().split("T")[0];
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];
  const weekStart = getWeekStart();

  const { data, error } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .gte("scan_date", weekStart)
    .lte("scan_date", today)
    .gte("score", 30)
    .order("score", { ascending: false })
    .limit(400);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const news = (data || [])
    .map((s: any) => {
      const item = s.news_items;
      const realSource = detectSourceFromUrl(item.source_url) || item.source;
      return {
        ...item,
        source: realSource,
        score: s.score,
        reasoning: s.reasoning,
        score_id: s.id,
        scan_date: s.scan_date,
      };
    })
    // Hard filter: home feed is real-estate only
    .filter((n: any) => isRealEstate(n.title || "", n.summary || "", n.source))
    .slice(0, 200);

  // Get last scan time
  const { data: lastScan } = await supabase
    .from("news_items")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    news,
    lastScan: lastScan?.[0]?.fetched_at || null,
    weekStart,
    today,
  });
}
