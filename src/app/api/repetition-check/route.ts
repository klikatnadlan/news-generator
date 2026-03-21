import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { checkRepetition } from "@/lib/anthropic";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Get last 7 sent texts
    const { data: recent } = await supabase
      .from("send_history")
      .select("whatsapp_text")
      .order("sent_at", { ascending: false })
      .limit(7);

    const recentTexts = recent?.map((r: { whatsapp_text: string }) => r.whatsapp_text).filter(Boolean) || [];

    const result = await checkRepetition(text, recentTexts);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Repetition check error:", error);
    return NextResponse.json({ isRepetitive: false, similarity: 0, suggestion: "" }, { status: 500 });
  }
}
