import { NextRequest, NextResponse } from "next/server";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const VOICE_ID = "bPFQW9IdOgp0dTMgOL0D"; // Ben Solomon v3

export async function POST(request: NextRequest) {
  const { text } = await request.json();

  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  // Strip *bold* markers for cleaner speech
  const cleanText = text.replace(/\*/g, "");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: "eleven_v3",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("ElevenLabs TTS error:", errorText);
    // Pass the provider's own reason through. A bare "TTS failed" cost an audit
    // pass to diagnose: the real answer was sitting in ElevenLabs' response the
    // whole time — "API key ID used as API key ... keys start with 'sk_'", i.e.
    // the key ID was stored instead of the key. Surface it so the next person
    // reads the cause instead of guessing.
    let detail = errorText.slice(0, 300);
    let hint: string | undefined;
    try {
      const parsed = JSON.parse(errorText);
      detail = parsed?.detail?.message || parsed?.detail?.status || detail;
      if (String(detail).includes("API key ID used as API key")) {
        hint = "המפתח שנשמר הוא ה-ID של המפתח ולא המפתח עצמו. מפתח אמיתי מתחיל ב-sk_ ומוצג רק ברגע היצירה או הרענון ב-ElevenLabs. לעדכן את ELEVENLABS_API_KEY ב-Vercel וב-.env.local.";
      }
    } catch { /* not JSON — keep the raw text */ }
    return NextResponse.json(
      { error: "TTS failed", detail, hint },
      { status: response.status }
    );
  }

  // Return audio as binary
  const audioBuffer = await response.arrayBuffer();
  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.byteLength.toString(),
    },
  });
}
