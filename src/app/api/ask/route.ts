import { NextRequest } from "next/server";
import { aiStream } from "@/lib/anthropic";
import { getSupabase } from "@/lib/supabase";
import { consumeAskQuota } from "@/lib/ask-quota";
import { planQuery, retrieveForPlan, buildAnswerPrompt, type AskSource } from "@/lib/ask";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Streaming answer endpoint for the in-app ask box.
 *
 * Protocol (extends the one in /api/digest with a `status` event):
 *   event: status  data: {"phase":"planning"|"searching"|"found","text":"…","count":n}
 *   data: {"text":"<chunk>"}                      … while Claude writes
 *   event: done    data: {"sources":[…],"mode":"…","basis":"…","cached":false}
 *   event: error   data: {"error":"…"}
 *
 * CLICK-ONLY. Nothing calls this on a schedule; the standing rule here is that
 * Claude runs on an explicit user action and nowhere else.
 */

// Answers about "this month" go stale. Six hours keeps a demo instant without
// serving yesterday's news as today's.
const CACHE_HOURS = 6;

const normalize = (q: string) =>
  q.toLowerCase().replace(/[?!.,;:"'׳״()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

function sse(encoder: TextEncoder, event: string | null, payload: unknown): Uint8Array {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  return encoder.encode(event ? `event: ${event}\n${data}` : data);
}

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const question = (sp.get("q") || "").trim().slice(0, 300);
  const refresh = sp.get("refresh") === "1";

  if (!question) {
    return new Response(JSON.stringify({ error: "חסרה שאלה" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const supabase = getSupabase();
  const cacheKey = `ask|v1|${normalize(question)}`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ─── Cache: a repeat question costs nothing and returns instantly ───
        if (!refresh) {
          try {
            const { data: cached } = await supabase
              .from("narrative_cache")
              .select("narratives, created_at")
              .eq("cache_key", cacheKey)
              .maybeSingle();
            const ageH = cached?.created_at
              ? (Date.now() - new Date(cached.created_at).getTime()) / 3_600_000
              : Infinity;
            if (cached?.narratives?.answer && ageH < CACHE_HOURS) {
              const c = cached.narratives;
              const n = c.sources?.length || 0;
              controller.enqueue(sse(encoder, "status", { phase: "found", text: `${n} מקורות (מהזיכרון)`, count: n }));
              controller.enqueue(sse(encoder, null, { text: c.answer }));
              controller.enqueue(sse(encoder, "done", { ...c, cached: true }));
              controller.close();
              return;
            }
          } catch { /* cache miss → answer fresh */ }
        }

        // ─── Quota: only for answers that will actually cost money ───
        const quota = await consumeAskQuota();
        if (!quota.allowed) {
          controller.enqueue(sse(encoder, "error", {
            error: `נגמרה מכסת השאלות להיום (${quota.cap}). שאלות שכבר נשאלו עדיין עונות מיד.`,
          }));
          controller.close();
          return;
        }

        // ─── 1. Plan ───
        controller.enqueue(sse(encoder, "status", { phase: "planning", text: "מנתח את השאלה…" }));
        const plan = await planQuery(question, new Date());

        // ─── 2. Retrieve ───
        controller.enqueue(sse(encoder, "status", { phase: "searching", text: "מחפש במאגר…" }));
        const r = await retrieveForPlan(plan);

        if (r.sources.length === 0) {
          controller.enqueue(sse(encoder, "status", { phase: "found", text: "לא נמצאו מקורות", count: 0 }));
          controller.enqueue(sse(encoder, null, {
            text: `לא מצאתי כתבות על "${question}" — לא במאגר שלנו ולא בחיפוש חי. נסה לנסח אחרת, או לשאול על שם חברה, פרויקט או עיר.`,
          }));
          controller.enqueue(sse(encoder, "done", { sources: [], mode: plan.mode, basis: "", cached: false }));
          controller.close();
          return;
        }

        const outlets = new Set(r.sources.map((s) => s.source).filter(Boolean)).size;
        controller.enqueue(sse(encoder, "status", {
          phase: "found",
          text: `${r.sources.length} כתבות מ-${outlets} מקורות`,
          count: r.sources.length,
          webCount: r.webCount,
        }));

        // ─── 3. Answer ───
        let answer = "";
        for await (const chunk of aiStream({
          model: "claude-sonnet-5",
          max_tokens: 2000,
          messages: [{ role: "user", content: buildAnswerPrompt(question, plan, r) }],
        })) {
          answer += chunk;
          controller.enqueue(sse(encoder, null, { text: chunk }));
        }

        const payload = {
          answer,
          sources: r.sources as AskSource[],
          mode: plan.mode,
          basis: `${r.sources.length} כתבות${plan.from ? ` · מ-${plan.from}` : ""}`,
          widenedTo: r.widenedTo,
          webCount: r.webCount,
          internalCount: r.internalCount,
          // What we ACTUALLY searched for, surfaced rather than hidden. The
          // planner rewrites the question, so without this a thin answer is
          // indistinguishable from thin coverage — which is exactly how the
          // first live probe looked before this was added.
          searched: { terms: plan.terms, from: plan.from, to: plan.to, mode: plan.mode },
        };

        // Persist only a real answer — caching an empty string would serve the
        // failure back for six hours. An empty answer is the signature of the
        // thinking budget eating max_tokens, so log it loudly if it happens.
        if (answer.trim()) {
          try {
            await supabase.from("narrative_cache").upsert(
              { cache_key: cacheKey, narratives: payload, count: r.sources.length, created_at: new Date().toISOString() },
              { onConflict: "cache_key" },
            );
          } catch (e) {
            console.error("[ask] failed to cache answer:", e instanceof Error ? e.message : e);
          }
        } else {
          console.error(`[ask] EMPTY answer for "${question}" with ${r.sources.length} sources`);
        }

        controller.enqueue(sse(encoder, "done", { ...payload, cached: false }));
      } catch (err) {
        console.error("[ask] failed:", err);
        controller.enqueue(sse(encoder, "error", {
          error: err instanceof Error ? err.message : "שגיאה לא צפויה",
        }));
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
