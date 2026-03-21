import { NextRequest, NextResponse } from "next/server";
import { generateMergedNarrative } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { items } = await request.json();

  if (!items?.length) {
    return NextResponse.json({ error: "Missing items" }, { status: 400 });
  }

  // items = [{ title, source, text, newsItemId }]
  const merged = await generateMergedNarrative(
    items.map((i: { title: string; source: string; text: string }) => ({
      title: i.title,
      source: i.source,
      text: i.text,
    }))
  );

  // Save as a generated_text linked to the first item
  const { data: saved } = await supabase
    .from("generated_texts")
    .insert({
      news_item_id: items[0].newsItemId,
      style: "merged_narrative",
      whatsapp_text: merged,
    })
    .select()
    .single();

  return NextResponse.json({
    mergedText: merged,
    textId: saved?.id || "",
  });
}
