import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// "גוגל פנימי" backlog: searches that found nothing, grouped by query.
// Review this list → each entry is a coverage task (new source / keywords).
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("search_gaps")
    .select("query, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grouped = new Map<string, { query: string; count: number; last: string }>();
  for (const r of data || []) {
    const key = (r.query || "").trim();
    if (!key) continue;
    const g = grouped.get(key);
    if (g) { g.count++; } else { grouped.set(key, { query: key, count: 1, last: r.created_at }); }
  }
  const gaps = [...grouped.values()].sort((a, b) => b.count - a.count);
  return NextResponse.json({ totalLogged: (data || []).length, uniqueGaps: gaps.length, gaps });
}
