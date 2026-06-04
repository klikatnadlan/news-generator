import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── "מעקבים" (topic watches) ───
// GET    → list all active alerts + match count + latest date (one RPC call)
// POST   → create an alert { name, keywords[], emoji }
// DELETE → ?id=<uuid>
// Matching is pure SQL (see migration 004) — zero AI tokens.

export async function GET() {
  const { data, error } = await supabase.rpc("alert_overview");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const alerts = (data || []).map((a: { id: string; name: string; emoji: string; keywords: string[]; match_count: number; latest_published: string | null }) => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    keywords: a.keywords,
    matchCount: Number(a.match_count) || 0,
    latestDate: a.latest_published,
  }));
  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = (body.name || "").trim();
  const emoji = (body.emoji || "🔔").trim() || "🔔";
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((k: string) => String(k).trim()).filter(Boolean)
    : [];

  if (!name || keywords.length === 0) {
    return NextResponse.json({ error: "צריך שם ולפחות מילת מפתח אחת" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("topic_alerts")
    .insert({ name, keywords, emoji })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alert: data });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const { error } = await supabase.from("topic_alerts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
