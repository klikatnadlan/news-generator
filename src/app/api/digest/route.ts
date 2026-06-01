import { NextRequest } from "next/server";
import { streamDailyDigest } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

/**
 * Streaming digest endpoint. Returns text/event-stream so the client
 * can render Claude's output progressively, like a typing effect.
 *
 * Protocol:
 *   - One or more `data: {"text": "<chunk>"}` events while Claude writes.
 *   - One terminal `event: done\ndata: {"textId": "..."}` with the saved row id.
 *   - On failure: `event: error\ndata: {"error": "..."}`.
 *
 * The Hebrew em-dash cleanup runs on the assembled string before persistence.
 */
export async function POST(request: NextRequest) {
  const { newsItemIds } = await request.json();

  if (!newsItemIds?.length) {
    return new Response(JSON.stringify({ error: "Missing newsItemIds" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: newsItems, error } = await supabase
    .from("news_items")
    .select("*")
    .in("id", newsItemIds);

  if (error || !newsItems?.length) {
    return new Response(JSON.stringify({ error: "Failed to fetch news items" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Preserve selection order
  const ordered = newsItemIds
    .map((id: string) => newsItems.find((n: { id: string }) => n.id === id))
    .filter(Boolean) as typeof newsItems;

  const articles = ordered.map((n: { title: string; summary: string; source: string }) => ({
    title: n.title,
    summary: n.summary || "",
    source: n.source,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        for await (const chunk of streamDailyDigest(articles)) {
          fullText += chunk;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`),
          );
        }

        // Hebrew em-dash cleanup on the assembled string
        const cleaned = fullText.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");

        // Persist the digest. Failure here shouldn't crash the stream — the
        // client already has the full text on screen.
        let textId = "";
        try {
          const { data: saved } = await supabase
            .from("generated_texts")
            .insert({
              news_item_id: ordered[0].id,
              style: "digest",
              whatsapp_text: cleaned,
            })
            .select()
            .single();
          textId = saved?.id || "";
        } catch (persistErr) {
          console.error("digest: failed to persist generated_text", persistErr);
        }

        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify({ textId })}\n\n`),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Vercel/Next.js response buffering
      "X-Accel-Buffering": "no",
    },
  });
}

export const maxDuration = 60;
