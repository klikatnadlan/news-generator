import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Map a source URL to a clean Hebrew source name (incl. קליקת הנדל"ן).
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
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  // Full-corpus search via the search_news RPC: searches ALL news_items (not
  // just scored ones — that hid ~75% of the archive) with light Hebrew stemming
  // so "פרויקטים בחולון" finds "פרויקט … חולון". Empty query = browse by date.
  const { data, error } = await supabase.rpc("search_news", {
    p_query: query,
    p_from: from || null,
    p_to: to || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[];
  const total = rows.length > 0 ? Number(rows[0].total) || 0 : 0;

  // "גוגל פנימי": a search that finds nothing is a coverage gap — log it so we
  // can close it (new source / keywords). Fire-and-forget, never blocks.
  if (query && total === 0 && page === 1) {
    supabase.from("search_gaps").insert({ query: query.slice(0, 200), results: 0, page: "archive" }).then(() => {}, () => {});
  }

  const items = rows.map((r) => {
    const dateIso = (r.published_at || r.fetched_at || "") as string;
    return {
      id: r.id,
      title: (r.title || "").replace(/<[^>]*>/g, ""),
      summary: (r.summary || "").replace(/<[^>]*>/g, ""),
      source: detectSourceFromUrl(r.source_url) || r.source || "",
      url: r.source_url || "",
      created_at: r.fetched_at || r.published_at || "",
      score: r.score ?? null,
      scan_date: dateIso ? dateIso.slice(0, 10) : null,
    };
  });

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
