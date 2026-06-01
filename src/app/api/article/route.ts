import { NextRequest, NextResponse } from "next/server";
import { generateArticle } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { newsItemId, fromNarrative } = await request.json();

  if (!newsItemId) {
    return NextResponse.json({ error: "Missing newsItemId" }, { status: 400 });
  }

  const { data: newsItem, error } = await supabase
    .from("news_items")
    .select("*")
    .eq("id", newsItemId)
    .single();

  if (error || !newsItem) {
    return NextResponse.json({ error: "News item not found" }, { status: 404 });
  }

  const article = await generateArticle(
    { title: newsItem.title, summary: newsItem.summary || "", source: newsItem.source },
    fromNarrative
  );

  const { data: saved } = await supabase
    .from("generated_texts")
    .insert({
      news_item_id: newsItemId,
      style: fromNarrative ? "article_from_narrative" : "article",
      whatsapp_text: article,
    })
    .select()
    .single();

  return NextResponse.json({
    text: article,
    id: saved?.id || "",
  });
}

export const maxDuration = 60;
