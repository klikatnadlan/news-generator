import { NextRequest, NextResponse } from "next/server";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const audioFile = formData.get("audio") as File;

  if (!audioFile) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  // Use ElevenLabs Speech-to-Text API
  const elevenLabsForm = new FormData();
  elevenLabsForm.append("file", audioFile);
  elevenLabsForm.append("model_id", "scribe_v1");
  elevenLabsForm.append("language_code", "heb");

  const response = await fetch(
    "https://api.elevenlabs.io/v1/speech-to-text",
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: elevenLabsForm,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("ElevenLabs STT error:", errorText);
    return NextResponse.json(
      { error: "STT failed" },
      { status: response.status }
    );
  }

  const result = await response.json();
  return NextResponse.json({ text: result.text || "" });
}
