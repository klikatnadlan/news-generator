import { NextRequest, NextResponse } from "next/server";
import { generateDailyDigest } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { newsItemIds } = await request.json();

  if (!newsItemIds?.length) {
    return NextResponse.json({ error: "Missing newsItemIds" }, { status: 400 });
  }

  // Fetch all selected news items
  const { data: newsItems, error } = await supabase
    .from("news_items")
    .select("*")
    .in("id", newsItemIds);

  if (error || !newsItems?.length) {
    return NextResponse.json({ error: "Failed to fetch news items" }, { status: 500 });
  }

  // Order by the selection order
  const ordered = newsItemIds
    .map((id: string) => newsItems.find((n: { id: string }) => n.id === id))
    .filter(Boolean);

  const articles = ordered.map((n: { title: string; summary: string; source: string }) => ({
    title: n.title,
    summary: n.summary || "",
    source: n.source,
  }));

  const digest = await generateDailyDigest(articles);

  // Save the digest as a generated_text linked to the first news item
  const { data: saved } = await supabase
    .from("generated_texts")
    .insert({
      news_item_id: ordered[0].id,
      style: "digest",
      whatsapp_text: digest,
    })
    .select()
    .single();

  return NextResponse.json({
    digest,
    textId: saved?.id || "",
  });
}
