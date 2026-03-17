import { NextRequest, NextResponse } from "next/server";
import { generateWhatsAppText } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { newsItemIds, style } = await request.json();

  if (!newsItemIds?.length || !style) {
    return NextResponse.json({ error: "Missing newsItemIds or style" }, { status: 400 });
  }

  const results = [];

  for (const newsItemId of newsItemIds) {
    const { data: newsItem } = await supabase
      .from("news_items")
      .select("*")
      .eq("id", newsItemId)
      .single();

    if (!newsItem) continue;

    const text = await generateWhatsAppText(
      { title: newsItem.title, summary: newsItem.summary || "", source: newsItem.source },
      style
    );

    const { data: saved } = await supabase
      .from("generated_texts")
      .insert({ news_item_id: newsItemId, style, whatsapp_text: text })
      .select()
      .single();

    results.push({
      newsItemId,
      text,
      id: saved?.id,
    });
  }

  return NextResponse.json({ results });
}
