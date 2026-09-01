"use client";

import { useState, useRef, useCallback } from "react";
import { SUGGESTED_QUESTIONS } from "@/lib/ask-questions";

interface Source {
  title: string;
  source: string;
  url: string;
  date: string | null;
  web: boolean;
}

// One list, shared with /api/warm?ask=1 — the chips and the pre-warm MUST be the
// same strings or the cache never hits and the "instant" demo path is a lie.
const CHIPS = SUGGESTED_QUESTIONS;

/**
 * Render bold and leave everything else as text.
 *
 * Handles BOTH conventions on purpose. The answer arrives in markdown (`**x**`),
 * because the model reaches for sub-headers whether the prompt asks or not; the
 * WhatsApp output arrives in WhatsApp's own syntax (`*x*`), because that is what
 * gets pasted into WhatsApp. Either way, raw asterisks on a screen someone is
 * presenting from look broken.
 *
 * Copying is unaffected — the clipboard gets `output.text`, asterisks intact, so
 * the message still bolds correctly once it lands in WhatsApp.
 *
 * Done by splitting rather than by setting innerHTML: this text is model output
 * built from web sources, so it must never become markup.
 */
function renderBold(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <strong key={i}>{part.slice(1, -1)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [basis, setBasis] = useState("");
  const [cached, setCached] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastAsked = useRef("");

  // Stage 3: turn a finished answer into something sendable.
  const [output, setOutput] = useState<{ kind: "whatsapp" | "paragraph"; text: string } | null>(null);
  const [formatting, setFormatting] = useState<"whatsapp" | "paragraph" | null>(null);
  const [copied, setCopied] = useState("");

  const copy = useCallback(async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  }, []);

  const makeOutput = useCallback(async (kind: "whatsapp" | "paragraph") => {
    if (!answer || formatting) return;
    setFormatting(kind);
    setOutput(null);
    try {
      const res = await fetch("/api/ask/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: lastAsked.current, answer, sources, format: kind }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || "לא הצלחנו לנסח");
      setOutput({ kind, text: data.text });
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא הצלחנו לנסח כרגע.");
    } finally {
      setFormatting(null);
    }
    // `answer` and `sources` are read fresh on every click, so they belong here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, sources, formatting]);

  const ask = useCallback(async (q: string, refresh = false) => {
    const text = q.trim();
    if (!text || busy) return;
    lastAsked.current = text;
    setBusy(true);
    setAnswer(""); setSources([]); setError(""); setBasis(""); setCached(false);
    setOutput(null); setCopied("");
    setStatus("שולח…");

    try {
      const url = `/api/ask?q=${encodeURIComponent(text)}${refresh ? "&refresh=1" : ""}`;
      const res = await fetch(url);
      if (!res.body) throw new Error("אין תשובה מהשרת");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          let event: string | null = null;
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (!data) continue;
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { continue; }

          if (event === "status") setStatus(String(parsed.text || ""));
          else if (event === "error") setError(String(parsed.error || "שגיאה"));
          else if (event === "done") {
            setSources((parsed.sources as Source[]) || []);
            setBasis(String(parsed.basis || ""));
            setCached(Boolean(parsed.cached));
            setStatus("");
          } else if (typeof parsed.text === "string") {
            const chunk = parsed.text;
            setAnswer((prev) => prev + chunk);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "משהו השתבש. נסה שוב.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  }, [busy]);

  // The app is LIGHT (--lf-bg #f8f9fb / --lf-text #0f1419). Only the top nav and
  // per-page hero cards are dark. This panel follows the archive's idiom exactly:
  // a dark gradient header card over a light body of white cards.
  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      <div className="max-w-3xl mx-auto px-4 py-4">
        {/* header card — same treatment as the deep-feed's */}
        <div className="rounded-2xl px-6 py-6 mb-4 text-center relative overflow-hidden"
          style={{ background: "linear-gradient(165deg, #0f1419 0%, #161e2b 55%, #1a2335 100%)" }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(circle at 75% 20%, rgba(220,38,38,0.14), transparent 45%)" }} />
          <h1 className="relative text-[19px] font-extrabold text-white" style={{ fontFamily: "DM Sans, system-ui" }}>
            שאל את לידרפיד
          </h1>
          <p className="relative text-[12.5px] mt-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
            שאלה בעברית חופשית. התשובה נכתבת מהכתבות שבמאגר, עם קישור לכל מקור.
          </p>
        </div>

        {/* input */}
        <div className="flex items-center gap-2 rounded-xl px-3 h-12 mb-3"
          style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(question)}
            placeholder="מה קרה בשיכון ובינוי החודש?"
            dir="rtl"
            disabled={busy}
            className="flex-1 min-w-0 bg-transparent text-[14px] focus:outline-none disabled:opacity-50"
            style={{ color: "#0f1419" }}
          />
          <button
            onClick={() => ask(question)}
            disabled={busy || !question.trim()}
            className="shrink-0 text-[12px] font-bold px-4 py-1.5 rounded-lg text-white disabled:opacity-40"
            style={{ background: "#dc2626" }}
          >
            {busy ? "…" : "שאל"}
          </button>
        </div>

        {/* chips */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => { setQuestion(c); ask(c); }}
              disabled={busy}
              className="text-[11px] px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-40"
              style={{ background: "#fff", color: "#5f6368", border: "1px solid #e5e7eb" }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* status */}
        {status && (
          <div className="flex items-center gap-2 text-[12px] mb-4" style={{ color: "#5f6368" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#dc2626" }} />
            {status}
          </div>
        )}

        {error && (
          <div className="rounded-xl p-3 mb-4 text-[12.5px]"
            style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {/* answer */}
        {answer && (
          <div className="rounded-xl p-4 mb-4" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
            <p className="text-[14px] leading-[1.85] whitespace-pre-wrap" style={{ color: "#0f1419" }}>
              {renderBold(answer)}
            </p>
            {!busy && (basis || cached) && (
              <div className="flex items-center gap-2 mt-3 pt-3 text-[10.5px]"
                style={{ borderTop: "1px solid #f1f3f5", color: "#9ca3af" }}>
                {basis && <span>{basis}</span>}
                {cached && <span>· מהזיכרון</span>}
                <button onClick={() => ask(lastAsked.current, true)} className="mr-auto hover:underline" style={{ color: "#5f6368" }}>
                  רענן
                </button>
              </div>
            )}
          </div>
        )}

        {/* output actions — only once an answer is finished */}
        {answer && !busy && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <button
              onClick={() => makeOutput("whatsapp")}
              disabled={!!formatting}
              className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: "#fff", color: "#0f1419", border: "1px solid #e5e7eb" }}
            >
              {formatting === "whatsapp" ? "מנסח…" : "📱 הודעת וואטסאפ"}
            </button>
            <button
              onClick={() => makeOutput("paragraph")}
              disabled={!!formatting}
              className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: "#fff", color: "#0f1419", border: "1px solid #e5e7eb" }}
            >
              {formatting === "paragraph" ? "מנסח…" : "📝 פסקה לכתבה"}
            </button>
            <button
              onClick={() => copy(answer, "answer")}
              className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "#fff", color: "#0f1419", border: "1px solid #e5e7eb" }}
            >
              {copied === "answer" ? "✅ הועתק" : "📋 העתק תשובה"}
            </button>
          </div>
        )}

        {/* the produced output */}
        {output && (
          <div className="rounded-xl p-4 mb-4" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] font-bold" style={{ color: "#9ca3af" }}>
                {output.kind === "whatsapp" ? "📱 מוכן לוואטסאפ" : "📝 פסקה לכתבה"}
              </span>
              <button
                onClick={() => copy(output.text, "output")}
                className="mr-auto text-[11px] font-bold px-2.5 py-1 rounded-md text-white"
                style={{ background: "#dc2626" }}
              >
                {copied === "output" ? "✅ הועתק" : "📋 העתק"}
              </button>
            </div>
            <p className="text-[13.5px] leading-[1.8] whitespace-pre-wrap" style={{ color: "#0f1419" }}>
              {renderBold(output.text)}
            </p>
          </div>
        )}

        {/* sources */}
        {sources.length > 0 && (
          <div className="rounded-xl p-4 mb-4" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
            <h2 className="text-[11px] font-bold mb-2.5" style={{ color: "#9ca3af" }}>
              המקורות ({sources.length})
            </h2>
            <ol className="space-y-2">
              {sources.map((s, i) => (
                <li key={`${s.url}-${i}`} className="flex gap-2 text-[12px]">
                  <span className="tabular-nums shrink-0" style={{ color: "#9ca3af" }}>[{i + 1}]</span>
                  <span className="min-w-0">
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="hover:underline" style={{ color: "#0f1419" }}>
                      {s.title}
                    </a>
                    <span className="mr-1.5 text-[10.5px]" style={{ color: "#9ca3af" }}>
                      {[s.source, s.date].filter(Boolean).join(" · ")}
                    </span>
                    {s.web && (
                      // Same cyan "from the web" badge the deep-feed uses, so a
                      // reader tells our own coverage from a live search at a glance.
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-block mr-1.5"
                        style={{ background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc" }}>
                        🌐 מהרשת
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
