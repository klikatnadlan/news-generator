import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Articles matching one alert's keywords (newest first), shaped for NewsCard.
// GET /api/alerts/articles?id=<alert uuid>

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

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const from = params.get("from"); // optional "YYYY-MM-DD"
  const to = params.get("to");     // optional "YYYY-MM-DD"
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data: alert, error: aErr } = await supabase
    .from("topic_alerts")
    .select("id, name, emoji, keywords")
    .eq("id", id)
    .single();

  if (aErr || !alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  // Default to a 90-day window when the caller did not ask for a range.
  //
  // Unbounded, this endpoint died: `match_alert_articles` with p_limit 300 over
  // all of news_items answered `57014 canceling statement due to statement
  // timeout` for the broadest watch (measured 2026-08-25 on "כל הנדל״ן בכף ידך",
  // 29 keywords). The window is not a compromise — it is strictly better:
  //   limit=300, all-time -> TIMEOUT
  //   limit=300, 90 days  -> 3.0s, a full 300 rows
  //   limit=100, all-time -> 3.5s, only 100 rows
  // A watch answers "what is happening", so recent-and-more beats old-and-fewer.
  // An explicit ?from=/?to= is always honoured as given.
  const DEFAULT_WINDOW_DAYS = 90;
  const defaultedWindow = !from && !to;
  const effectiveFrom = from
    || (defaultedWindow
        ? new Date(Date.now() - DEFAULT_WINDOW_DAYS * 864e5).toISOString().slice(0, 10)
        : null);

  let limitUsed = 300;
  let { data, error } = await supabase.rpc("match_alert_articles", {
    p_keywords: alert.keywords,
    p_limit: limitUsed,
    p_from: effectiveFrom,
    p_to: to || null,
  });

  // Last resort for a watch so broad that even the window is not enough: fewer
  // rows rather than a 500 that empties the panel.
  if (error) {
    console.error("match_alert_articles failed, retrying with a smaller limit:", error.message);
    limitUsed = 100;
    const retry = await supabase.rpc("match_alert_articles", {
      p_keywords: alert.keywords,
      p_limit: limitUsed,
      p_from: effectiveFrom,
      p_to: to || null,
    });
    if (retry.error) {
      return NextResponse.json({ error: retry.error.message }, { status: 500 });
    }
    data = retry.data;
  }

  const articles = (data || []).map((r: { id: string; title: string; source: string; source_url: string; summary: string | null; published_at: string | null; score: number | null }) => ({
    id: r.id,
    title: (r.title || "").replace(/<[^>]*>/g, ""),
    source: detectSourceFromUrl(r.source_url) || r.source,
    source_url: r.source_url,
    summary: (r.summary || "").replace(/<[^>]*>/g, ""),
    published_at: r.published_at,
    score: r.score,        // may be null — NewsCard hides the badge when null
    reasoning: "",
    fetched_at: r.published_at,
    scan_batch: "",
  }));

  // Say when the result was scoped, so a short list reads as "last 90 days"
  // rather than "this watch has almost nothing".
  //
  // And say when it was CUT. Measured 2026-09-05: the broadest watch showed
  // 3,993 on its card and exactly 300 when opened. 300 is this p_limit, not a
  // fact about the world — but the panel printed it as "מתוך 300" and the
  // difference read as data loss. A number that is a ceiling has to admit it.
  return NextResponse.json({
    alert,
    articles,
    windowDays: defaultedWindow ? DEFAULT_WINDOW_DAYS : null,
    limitUsed,
    capped: articles.length >= limitUsed,
  });
}
