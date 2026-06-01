import { NextRequest, NextResponse } from "next/server";
import { refineText } from "@/lib/anthropic";

export async function POST(request: NextRequest) {
  const { currentText, instruction } = await request.json();

  if (!currentText || !instruction) {
    return NextResponse.json(
      { error: "Missing currentText or instruction" },
      { status: 400 }
    );
  }

  const refined = await refineText(currentText, instruction);

  return NextResponse.json({ text: refined });
}

export const maxDuration = 60;
