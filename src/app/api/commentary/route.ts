import { NextRequest, NextResponse } from "next/server";
import { generateCommentary } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { newsItemId } = await request.json();

  if (!newsItemId) {
    return NextResponse.json({ error: "Missing newsItemId" }, { status: 400 });
  }

  const { data: newsItem } = await supabase
    .from("news_items")
    .select("*")
    .eq("id", newsItemId)
    .single();

  if (!newsItem) {
    return NextResponse.json({ error: "News item not found" }, { status: 404 });
  }

  const commentary = await generateCommentary({
    title: newsItem.title,
    summary: newsItem.summary || "",
    source: newsItem.source,
  });

  const { data: saved } = await supabase
    .from("commentaries")
    .insert({ news_item_id: newsItemId, ...commentary })
    .select()
    .single();

  return NextResponse.json({ commentary: saved });
}
