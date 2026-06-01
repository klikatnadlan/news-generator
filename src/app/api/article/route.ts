import { NextRequest } from "next/server";
import { streamArticle } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

/**
 * Streaming article endpoint. Returns text/event-stream so the article
 * (600-1000 words) is rendered progressively rather than appearing all
 * at once after a long wait.
 *
 * Body: { newsItemId: string, fromNarrative?: string }
 *
 * Protocol mirrors /api/digest:
 *   - `data: {"text": "<chunk>"}`  for each delta
 *   - `event: done` with the persisted textId
 *   - `event: error` on failure
 */
export async function POST(request: NextRequest) {
  const { newsItemId, fromNarrative } = await request.json();

  if (!newsItemId) {
    return new Response(JSON.stringify({ error: "Missing newsItemId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: newsItem, error } = await supabase
    .from("news_items")
    .select("*")
    .eq("id", newsItemId)
    .single();

  if (error || !newsItem) {
    return new Response(JSON.stringify({ error: "News item not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        for await (const chunk of streamArticle(
          { title: newsItem.title, summary: newsItem.summary || "", source: newsItem.source },
          fromNarrative || "",
        )) {
          fullText += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        }

        // Em-dash cleanup before persisting (matches the digest/generate routes)
        const cleaned = fullText.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");

        // Persist after streaming completes
        let textId = "";
        try {
          const { data: saved, error: saveErr } = await supabase
            .from("generated_texts")
            .insert({
              news_item_id: newsItemId,
              style: fromNarrative ? "article_from_narrative" : "article",
              whatsapp_text: cleaned,
            })
            .select()
            .single();
          if (saveErr) console.error("article: persist returned error", saveErr.message);
          textId = saved?.id || "";
        } catch (persistErr) {
          console.error("article: failed to persist generated_text", persistErr);
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
      "X-Accel-Buffering": "no",
    },
  });
}

export const maxDuration = 60;
