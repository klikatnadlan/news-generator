import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { findCity } from "@/lib/cities";

// City-aware feed: unlike the generic search, this attributes a באז to a city
// correctly — it includes the city's OWN Facebook pages (muni + mayor), excludes
// OTHER cities' FB posts, and for common-word names (רחובות/שדרות/מודיעין…)
// requires the city in the TITLE so "streets"/"intelligence" don't false-match.
function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const l = url.toLowerCase();
  if (l.includes("klikatnadlan.co.il")) return 'קליקת הנדל"ן';
  if (l.includes("globes.co.il")) return "גלובס";
  if (l.includes("calcalist.co.il")) return "כלכליסט";
  if (l.includes("themarker.com")) return "דה מרקר";
  if (l.includes("ynet.co.il")) return "ynet";
  if (l.includes("maariv.co.il")) return "מעריב";
  if (l.includes("bizportal.co.il")) return "ביזפורטל";
  if (l.includes("walla.co.il")) return "וואלה";
  if (l.includes("ice.co.il")) return "ICE";
  if (l.includes("nadlancenter.co.il")) return 'מרכז הנדל"ן';
  if (l.includes("magdilim.co.il")) return "מגדילים";
  return null;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const sp = new URL(request.url).searchParams;
  const cityName = sp.get("city") || "";
  const chip = sp.get("chip") || "";
  const from = sp.get("from") || null; // yyyy-mm-dd; default handled client-side (last quarter)
  const to = sp.get("to") || null;     // exclusive range buckets / custom filter
  const page = parseInt(sp.get("page") || "1", 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  const city = findCity(cityName);
  if (!city) return NextResponse.json({ items: [], total: 0, page, totalPages: 0 });

  const { data, error } = await supabase.rpc("city_news", {
    p_city: city.name,
    p_aliases: city.aliases || [],
    p_strict: !!city.commonWord,
    p_chip: chip,
    p_from: from,
    p_to: to,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[];
  const total = rows.length > 0 ? Number(rows[0].total) || 0 : 0;
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

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}
