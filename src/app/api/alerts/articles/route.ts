import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Articles matching one alert's keywords (newest first), shaped for NewsCard.
// GET /api/alerts/articles?id=<alert uuid>

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

export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
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

  const { data, error } = await supabase.rpc("match_alert_articles", {
    p_keywords: alert.keywords,
    p_limit: 100,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  return NextResponse.json({ alert, articles });
}
