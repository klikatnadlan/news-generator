import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("send_history")
    .select("*, generated_texts(*, news_items(*))")
    .order("sent_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ history: data });
}

export async function POST(request: NextRequest) {
  const { generatedTextId, sentBy, channel } = await request.json();

  if (!generatedTextId || !channel) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("send_history")
    .insert({
      generated_text_id: generatedTextId,
      sent_by: sentBy || null,
      channel,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ record: data });
}
