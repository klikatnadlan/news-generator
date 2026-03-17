import { NextRequest, NextResponse } from "next/server";
import { generateWhatsAppText } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { newsItemIds, style } = await request.json();

  if (!newsItemIds?.length || !style) {
    return NextResponse.json({ error: "Missing newsItemIds or style" }, { status: 400 });
  }

  // Fetch all news items in one query
  const { data: newsItems, error } = await supabase
    .from("news_items")
    .select("*")
    .in("id", newsItemIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate all texts in parallel
  const generatePromises = (newsItems || []).map(async (newsItem) => {
    const text = await generateWhatsAppText(
      { title: newsItem.title, summary: newsItem.summary || "", source: newsItem.source },
      style
    );

    const { data: saved } = await supabase
      .from("generated_texts")
      .insert({ news_item_id: newsItem.id, style, whatsapp_text: text })
      .select()
      .single();

    return {
      newsItemId: newsItem.id,
      text,
      id: saved?.id,
    };
  });

  const results = await Promise.all(generatePromises);

  // Maintain original order
  const orderedResults = newsItemIds
    .map((id: string) => results.find((r) => r.newsItemId === id))
    .filter(Boolean);

  return NextResponse.json({ results: orderedResults });
}
