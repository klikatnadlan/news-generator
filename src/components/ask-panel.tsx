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

  const ask = useCallback(async (q: string, refresh = false) => {
    const text = q.trim();
    if (!text || busy) return;
    lastAsked.current = text;
    setBusy(true);
    setAnswer(""); setSources([]); setError(""); setBasis(""); setCached(false);
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

  return (
    <div dir="rtl" className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-[20px] font-extrabold text-white mb-1" style={{ fontFamily: "DM Sans, system-ui" }}>
        שאל את לידרפיד
      </h1>
      <p className="text-[12px] mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
        שאלה בעברית חופשית. התשובה נכתבת מהכתבות שבמאגר, עם קישור לכל מקור.
      </p>

      {/* input */}
      <div className="flex items-center gap-2 rounded-xl px-3 h-12 mb-3"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(question)}
          placeholder="מה קרה בשיכון ובינוי החודש?"
          dir="rtl"
          disabled={busy}
          className="flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder-white/35 focus:outline-none disabled:opacity-50"
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
      <div className="flex flex-wrap gap-1.5 mb-6">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => { setQuestion(c); ask(c); }}
            disabled={busy}
            className="text-[11px] px-2.5 py-1.5 rounded-full transition-colors hover:bg-white/10 disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* status */}
      {status && (
        <div className="flex items-center gap-2 text-[12px] mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {status}
        </div>
      )}

      {error && (
        <div className="rounded-xl p-3 mb-4 text-[12.5px]"
          style={{ background: "rgba(220,38,38,0.12)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.25)" }}>
          {error}
        </div>
      )}

      {/* answer */}
      {answer && (
        <div className="rounded-xl p-4 mb-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[14px] leading-[1.85] whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>
            {answer}
          </p>
          {!busy && (basis || cached) && (
            <div className="flex items-center gap-2 mt-3 pt-3 text-[10.5px]"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}>
              {basis && <span>{basis}</span>}
              {cached && <span>· מהזיכרון</span>}
              <button onClick={() => ask(lastAsked.current, true)} className="mr-auto hover:text-white/70">
                רענן
              </button>
            </div>
          )}
        </div>
      )}

      {/* sources */}
      {sources.length > 0 && (
        <div>
          <h2 className="text-[11px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            המקורות ({sources.length})
          </h2>
          <ol className="space-y-1.5">
            {sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="flex gap-2 text-[12px]">
                <span className="tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>[{i + 1}]</span>
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="hover:underline" style={{ color: "rgba(255,255,255,0.72)" }}>
                  {s.title}
                  <span className="mr-1.5 text-[10.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {[s.source, s.date, s.web ? "רשת" : ""].filter(Boolean).join(" · ")}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
