import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  // Query through news_scores to filter only relevant news (score >= 30)
  let builder = supabase
    .from("news_scores")
    .select("score, scan_date, news_items!inner(id, title, summary, source, source_url, fetched_at, published_at)", { count: "exact" })
    .gte("score", 30);

  if (query) {
    builder = builder.or(`news_items.title.ilike.%${query}%,news_items.summary.ilike.%${query}%`);
  }
  if (from) {
    builder = builder.gte("scan_date", from);
  }
  if (to) {
    builder = builder.lte("scan_date", to);
  }

  const { data, count, error } = await builder
    .order("score", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data || []).map((row: any) => {
    const item = row.news_items;
    return {
      id: item.id,
      title: (item.title || "").replace(/<[^>]*>/g, ""),
      summary: (item.summary || "").replace(/<[^>]*>/g, ""),
      source: item.source || "",
      url: item.source_url || "",
      created_at: item.fetched_at || item.published_at || "",
      score: row.score || null,
      scan_date: row.scan_date || null,
    };
  });

  return NextResponse.json({
    items,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
