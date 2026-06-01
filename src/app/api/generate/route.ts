import { NextRequest } from "next/server";
import { streamWhatsAppText } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

type Style = "short" | "regular" | "commentary";

/**
 * Streaming multi-item WhatsApp text generator.
 *
 * Receives newsItemIds[] + style. For each id, opens a Claude stream and
 * multiplexes all of them into a single SSE response — each delta is
 * tagged with its newsItemId so the client can route the chunk to the
 * right card.
 *
 * Wire format:
 *   data: {"newsItemId": "...", "text": "<chunk>"}\n\n
 *   event: item-done\ndata: {"newsItemId": "...", "textId": "..."}\n\n
 *   event: all-done\ndata: {}\n\n
 *   event: error\ndata: {"error": "..."}\n\n   (terminal failure)
 *
 * Items run in parallel (3 at a time to match Claude rate limits)
 * so total wall-clock ≈ slowest single item, not N × slowest.
 */
export async function POST(request: NextRequest) {
  const { newsItemIds, style } = (await request.json()) as {
    newsItemIds: string[];
    style: Style;
  };

  if (!newsItemIds?.length || !style) {
    return new Response(JSON.stringify({ error: "Missing newsItemIds or style" }), {
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
  const orderedItems = newsItemIds
    .map((id) => newsItems.find((n) => n.id === id))
    .filter(Boolean) as typeof newsItems;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string | null, data: object) => {
        const prefix = event ? `event: ${event}\n` : "";
        controller.enqueue(
          encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Process one item end-to-end: stream Claude → persist → emit item-done
      const processItem = async (item: typeof orderedItems[number]) => {
        let fullText = "";
        try {
          for await (const chunk of streamWhatsAppText(
            { title: item.title, summary: item.summary || "", source: item.source },
            style,
          )) {
            fullText += chunk;
            sendEvent(null, { newsItemId: item.id, text: chunk });
          }

          const cleaned = fullText.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");

          let textId = "";
          try {
            const { data: saved, error: saveErr } = await supabase
              .from("generated_texts")
              .insert({ news_item_id: item.id, style, whatsapp_text: cleaned })
              .select()
              .single();
            if (saveErr) console.error(`generate: persist returned error for ${item.id}`, saveErr.message);
            textId = saved?.id || "";
          } catch (persistErr) {
            console.error(`generate: failed to persist text for ${item.id}`, persistErr);
          }

          sendEvent("item-done", { newsItemId: item.id, textId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          // Per-item failure doesn't tear down the whole stream — just signal
          // this item's done with an error so the client can mark it failed.
          sendEvent("item-done", { newsItemId: item.id, textId: "", error: msg });
        }
      };

      try {
        // Bounded concurrency: 3 simultaneous Claude calls
        const CONCURRENCY = 3;
        for (let i = 0; i < orderedItems.length; i += CONCURRENCY) {
          const slice = orderedItems.slice(i, i + CONCURRENCY);
          await Promise.all(slice.map(processItem));
        }
        sendEvent("all-done", {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        sendEvent("error", { error: msg });
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
