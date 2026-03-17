import { NextRequest, NextResponse } from "next/server";
import { checkHumanityScore } from "@/lib/anthropic";

export async function POST(request: NextRequest) {
  const { text } = await request.json();

  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  try {
    const result = await checkHumanityScore(text);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
