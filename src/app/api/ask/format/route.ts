import { NextRequest, NextResponse } from "next/server";
import { formatAskAnswer, type AskFormat } from "@/lib/anthropic";
import { consumeAskQuota } from "@/lib/ask-quota";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Turn an existing /ask answer into a WhatsApp message or an article paragraph.
 *
 * CLICK-ONLY, like /api/ask. Takes the answer the client already has rather
 * than re-running retrieval, so a format is one short call (~3 agorot) and
 * cannot return a different set of facts than the answer on screen.
 *
 * Not streamed: the output is a few lines, and a plain JSON response keeps the
 * client simple. It still consumes the daily quota — it is a paid call.
 */
const FORMATS = new Set<AskFormat>(["whatsapp", "paragraph", "article"]);

export async function POST(request: NextRequest) {
  let body: {
    question?: string;
    answer?: string;
    sources?: { title: string; source: string; url: string }[];
    format?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const question = (body.question || "").trim().slice(0, 300);
  const answer = (body.answer || "").trim();
  const format = body.format as AskFormat;

  if (!answer) return NextResponse.json({ error: "אין תשובה להמיר" }, { status: 400 });
  if (!FORMATS.has(format)) return NextResponse.json({ error: "פורמט לא מוכר" }, { status: 400 });

  const quota = await consumeAskQuota();
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `נגמרה מכסת השאלות להיום (${quota.cap}).` },
      { status: 429 },
    );
  }

  try {
    const text = await formatAskAnswer({
      question,
      answer,
      // An article draft needs more of the record than a WhatsApp line does.
      sources: Array.isArray(body.sources) ? body.sources.slice(0, format === "article" ? 20 : 12) : [],
      format,
    });
    if (!text) {
      // An empty string here is the thinking-budget signature, not an empty
      // result — surface it instead of handing the user a blank box.
      console.error(`[ask/format] EMPTY output for format=${format}`);
      return NextResponse.json({ error: "לא הצלחנו לנסח כרגע. נסה שוב." }, { status: 502 });
    }
    return NextResponse.json({ text });
  } catch (e) {
    console.error("[ask/format] failed:", e);
    return NextResponse.json({ error: "לא הצלחנו לנסח כרגע. נסה שוב." }, { status: 500 });
  }
}
