import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 20;

// Live "fresh from the field" strip for the Galilee growth portal. Token-free
// SQL over our own corpus — surfaces the most recent items mentioning the
// Galilee cluster, so the portal keeps updating (unlike the static original).
export async function GET() {
  const terms = ["מעלות", "נהריה", "כרמיאל", "מונפורט", "הגליל", "גליל מערבי", "שלומי", "תפן"];
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const orExpr = terms.map((t) => `title.ilike.*${t}*,summary.ilike.*${t}*`).join(",");
  try {
    const { data } = await supabase
      .from("news_items")
      .select("id,title,source,source_url,published_at")
      .or(orExpr)
      .gte("published_at", since)
      .not("source", "like", "פייסבוק%")
      .order("published_at", { ascending: false })
      .limit(40);
    const seen = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((data || []) as any[])
      .filter((d) => d.title && d.source_url && !seen.has(d.source_url) && seen.add(d.source_url))
      .slice(0, 12)
      .map((d) => ({ id: d.id, title: d.title, source: d.source || "", url: d.source_url, date: (d.published_at || "").slice(0, 10) }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
