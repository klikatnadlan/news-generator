import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isRealEstate, dedupeStories } from "@/lib/classify";

// Detect real source from article URL (mirrors rss.ts logic)
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
  if (lower.includes("nadlancenter.co.il")) return "מרכז הנדל\"ן";
  if (lower.includes("magdilim.co.il")) return "מגדילים";
  if (lower.includes("madlan.co.il")) return "מדלן";
  if (lower.includes("homeless.co.il")) return "הומלס";
  if (lower.includes("dira.co.il")) return "דירה";
  return null;
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  // Pull more than we need so the real-estate filter doesn't shrink the top-N.
  // The last-scan lookup is independent of the scores query — fired together so
  // the response waits for ONE DB round-trip, not two in series.
  const [{ data, error }, { data: lastScan }] = await Promise.all([
    supabase
      .from("news_scores")
      .select("*, news_items(*)")
      .eq("scan_date", today)
      .gte("score", 30)
      .order("score", { ascending: false })
      // 200, not 30: the response now carries a real count of the day, and a
      // count computed off a 30-row window would silently cap on a busy day.
      // Today's scored rows are a few dozen, so this stays one cheap read.
      .limit(200),
    supabase
      .from("news_items")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1),
  ]);

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
      };
    })
    // Real-estate-only on the dashboard "ידיעות מובילות" strip. The score rides
    // along so a high-confidence item is not dropped for lacking a keyword.
    .filter((n: any) => isRealEstate(n.title || "", n.summary || "", n.source, n.score));

  // Dedupe BEFORE the slice — otherwise a duplicated story eats one of the six
  // visible slots and the strip shows the same headline twice.
  const deduped = dedupeStories(news);

  // `news` is the six-item strip; `count` is how many stories the day actually
  // has. They are different numbers and were being confused: the dashboard
  // printed news.length under the label "ידיעות היום" and so reported 6 on a
  // day the home page reported 17. Same day, same filters, two answers — the
  // difference was purely the display cap. The count uses the identical
  // definition as the home feed (score ≥ 30, real-estate, deduped) so the two
  // screens agree.
  return NextResponse.json({
    news: deduped.slice(0, 6),
    count: deduped.length,
    lastScan: lastScan?.[0]?.fetched_at || null,
  });
}
