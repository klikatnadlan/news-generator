"use client";

import { useState, useRef, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ScoredNews } from "@/lib/types";
import { VoicePlayButton } from "./voice-play-button";
import { VoiceRecordButton } from "./voice-record-button";

interface NewsCardProps {
  news: ScoredNews;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  showDate?: boolean;
}

function formatNewsDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" });
}

const SOURCES: Record<string, { label: string; color: string }> = {
  "גלובס": { label: "גלובס", color: "#0066cc" },
  "globes": { label: "גלובס", color: "#0066cc" },
  "כלכליסט": { label: "כלכליסט", color: "#c0392b" },
  "calcalist": { label: "כלכליסט", color: "#c0392b" },
  "דה מרקר": { label: "דה מרקר", color: "#16a34a" },
  "themarker": { label: "דה מרקר", color: "#16a34a" },
  "ביזפורטל": { label: "ביזפורטל", color: "#d97706" },
  "bizportal": { label: "ביזפורטל", color: "#d97706" },
  "ynet": { label: "ynet", color: "#dc2626" },
  "וואלה": { label: "וואלה", color: "#0284c7" },
  "walla": { label: "וואלה", color: "#0284c7" },
  "מעריב": { label: "מעריב", color: "#1e3a5f" },
  "ישראל היום": { label: "ישראל היום", color: "#1d4ed8" },
  "מרכז הנדל": { label: 'מרכז הנדל"ן', color: "#7c3aed" },
  "מגדילים": { label: "מגדילים", color: "#059669" },
  "מדלן": { label: "מדלן", color: "#7c3aed" },
  "הומלס": { label: "הומלס", color: "#dc2626" },
  "ice": { label: "ICE", color: "#0ea5e9" },
};

function getSource(s: string) {
  for (const [k, v] of Object.entries(SOURCES)) {
    if (s.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return { label: s, color: "#6b7280" };
}

export function NewsCard({ news, selected, onSelect, showDate }: NewsCardProps) {
  const [copyLabel, setCopyLabel] = useState<string | null>(null);
  const [generating, setGenerating] = useState<"message" | "article" | null>(null);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [generatedType, setGeneratedType] = useState<"message" | "article" | null>(null);
  const [resultCopyLabel, setResultCopyLabel] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  // Click the title (or subtitle) to reveal the full subtitle (it's clamped to
  // 2 lines by default so long decks don't get cut off with no way to read them).
  const [expanded, setExpanded] = useState(false);
  // In-app reader + article summary
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerText, setReaderText] = useState<string | null>(null);
  const [readerFull, setReaderFull] = useState(false);
  const [readerLoading, setReaderLoading] = useState(false);
  const [artSummary, setArtSummary] = useState<string | null>(null);
  const [artSummaryLoading, setArtSummaryLoading] = useState(false);
  const [artSummaryCopied, setArtSummaryCopied] = useState(false);
  const [frameOpen, setFrameOpen] = useState(false); // 🌐 iframe view
  const [actionsOpen, setActionsOpen] = useState(false); // ⋮ kebab — clean card by default
  const [readerCopied, setReaderCopied] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  // Close the iframe and scroll back to the card (so the user lands on the
  // card's buttons, not stranded at the bottom of a tall frame).
  const closeFrame = () => { setFrameOpen(false); cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const closeReader = () => { setReaderOpen(false); cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  // Resize ONLY this card's summary box (Ben: the global var grew text all over
  // the site — he wants just the cube he's reading).
  const [summarySize, setSummarySize] = useState(12.5);
  const bumpSummarySize = (delta: number) => setSummarySize((s) => Math.min(24, Math.max(11, s + delta)));

  const openReader = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!news.source_url) return;
    setReaderOpen((o) => !o);
    if (readerText !== null) return; // already fetched
    setReaderLoading(true);
    try {
      const res = await fetch(`/api/article-read?url=${encodeURIComponent(news.source_url)}`);
      const d = await res.json();
      setReaderText(d.text || "");
      setReaderFull(!!d.full);
    } catch { setReaderText(""); } finally { setReaderLoading(false); }
  };
  const summarizeArticle = async () => {
    setArtSummaryLoading(true);
    try {
      const u = `/api/article-summary?url=${encodeURIComponent(news.source_url || "")}&title=${encodeURIComponent(news.title || "")}&summary=${encodeURIComponent(news.summary || "")}`;
      const res = await fetch(u);
      const d = await res.json();
      setArtSummary(d.summary || d.error || "שגיאה");
    } catch { setArtSummary("לא הצלחנו לסכם כרגע."); } finally { setArtSummaryLoading(false); }
  };

  const src = getSource(news.source);
  const scoreColor = news.score >= 80 ? "#059669" : news.score >= 60 ? "#d97706" : "#dc2626";

  // Paywalled sources — AI can only read headlines, not full articles.
  // (כלכליסט is FREE — not paywalled.)
  const PAYWALLED_SOURCES = ["גלובס", "דה מרקר"];
  const isPaywalled = PAYWALLED_SOURCES.some(s => news.source.includes(s));

  const generate = async (type: "message" | "article", e: React.MouseEvent) => {
    e.stopPropagation();
    setGenerating(type); setGeneratedText(null); setGeneratedType(null);
    // /api/generate and /api/article are Server-Sent Event streams now, so we
    // read the stream and append text deltas live (progressive typing) rather
    // than awaiting a single JSON body.
    const url = type === "message" ? "/api/generate" : "/api/article";
    const body = type === "message"
      ? { newsItemIds: [news.id], style: "regular" }
      : { newsItemId: news.id };
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) { setGenerating(null); return; }
      setGeneratedType(type);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          if (!evt.trim()) continue;
          let dataStr = "";
          for (const line of evt.split("\n")) {
            if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const p = JSON.parse(dataStr);
            if (typeof p.text === "string") {
              acc += p.text;
              setGeneratedText(acc);
            }
          } catch { /* skip non-text events (item-done / done / all-done) */ }
        }
      }
      // Final em-dash cleanup
      if (acc) setGeneratedText(acc.replace(/\s*—\s*/g, ", ").replace(/–/g, "-"));
    } catch { /* leave whatever streamed */ } finally { setGenerating(null); }
  };

  const refine = async () => {
    if (!refineInstruction.trim() || refining || !generatedText) return;
    setRefining(true);
    try {
      const res = await fetch("/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentText: generatedText, instruction: refineInstruction.trim() }) });
      const d = await res.json();
      if (d.text) { setGeneratedText(d.text); setRefineInstruction(""); }
    } finally { setRefining(false); }
  };

  const wc = generatedText ? generatedText.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <article ref={cardRef} className={`lf-card overflow-hidden cursor-pointer ${selected ? "lf-card-selected" : ""}`} onClick={() => onSelect(news.id, !selected)}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <button className="w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center shrink-0 transition-all" style={{ borderColor: selected ? "#0f1419" : "#d1d5db", background: selected ? "#0f1419" : "#fff" }} onClick={(e) => { e.stopPropagation(); onSelect(news.id, !selected); }}>
            {selected && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
          <span className="text-[11px] font-semibold px-2 py-[2px] rounded-md" style={{ color: src.color, background: src.color + "12", border: `1px solid ${src.color}22` }}>{src.label}</span>
          {showDate && formatNewsDate(news.published_at) && (
            <span className="text-[11px] inline-flex items-center gap-1" style={{ color: "#9ca3af" }}>🗓️ {formatNewsDate(news.published_at)}</span>
          )}
          <div className="flex items-center gap-1 mr-auto">
            {news.score != null && <span className="text-[20px] font-extrabold leading-none" style={{ color: scoreColor, fontFamily: "DM Sans, system-ui" }}>{news.score}</span>}
            {news.source_url && <a href={news.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] hover:underline mr-2" style={{ color: "#9ca3af" }}>מקור ←</a>}
            {/* ⋮ — actions live behind a kebab so the card stays clean for
                client-facing screenshots (Ben). */}
            <button onClick={(e) => { e.stopPropagation(); setActionsOpen((o) => !o); }} aria-label="פעולות"
              className="w-7 h-7 flex items-center justify-center rounded-lg border transition-colors"
              style={actionsOpen ? { borderColor: "#0f1419", background: "#0f1419", color: "#fff" } : { borderColor: "#e5e7eb", color: "#6b7280", background: "#fff" }}
              title="פעולות על הבאז">⋮</button>
          </div>
        </div>
        <h3 className="text-[16px] font-bold leading-[1.45] mb-1.5 cursor-pointer hover:opacity-70 transition-opacity" style={{ color: "#0f1419" }}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }} title="לחץ לפתיחת תת-הכותרת המלאה">
          {news.title.replace(/<[^>]*>/g, "")}
          {news.summary && <span className="text-[11px] font-normal mr-1" style={{ color: "#9ca3af" }}>{expanded ? "▴" : "▾"}</span>}
        </h3>
        {news.summary && (
          <p className={`leading-[1.6] mb-2.5 cursor-pointer ${expanded ? "" : "line-clamp-2"}`} style={{ color: "#6b7280", fontSize: "var(--lf-content-size, 13px)" }}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
            {news.summary.replace(/<[^>]*>/g, "")}
          </p>
        )}
        {news.reasoning && !/^[a-zA-Z]/.test(news.reasoning) && <p className="text-[11px] leading-[1.4] mb-3 px-2 py-1 rounded-md inline-block" style={{ color: "#92400e", background: "#fffbeb" }}>{news.reasoning}</p>}
        {actionsOpen && (
        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <button onClick={async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(`${news.title}${news.summary ? `\n${news.summary}` : ""}`); setCopyLabel("✓"); setTimeout(() => setCopyLabel(null), 1500); }} className="text-[11px] font-medium h-[30px] px-3 rounded-md border transition-colors" style={copyLabel ? { background: "#f0fdf4", borderColor: "#059669", color: "#059669" } : { borderColor: "#e5e7eb", color: "#6b7280", background: "#fff" }}>{copyLabel || "📋 העתק תכלס"}</button>
          {!isPaywalled && (
            <>
              <button onClick={(e) => generate("message", e)} disabled={generating !== null} className="text-[11px] font-semibold h-[30px] px-3.5 rounded-md text-white disabled:opacity-40 transition-colors" style={{ background: "#0f1419" }}>{generating === "message" ? "⏳ מייצר..." : "📝 צור הודעה"}</button>
              <button onClick={(e) => generate("article", e)} disabled={generating !== null} className="text-[11px] font-semibold h-[30px] px-3.5 rounded-md border disabled:opacity-40 transition-colors" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fff" }}>{generating === "article" ? "⏳ מייצר..." : "📰 צור כתבה"}</button>
            </>
          )}
          {news.source_url && (
            <button onClick={openReader} className="text-[11px] font-semibold h-[30px] px-3 rounded-md border transition-colors" style={{ borderColor: "#0ea5e9", color: "#0369a1", background: "#fff" }}>
              {readerOpen ? "▲ סגור" : "📖 קרא כאן"}
            </button>
          )}
          {news.source_url && (
            <button onClick={(e) => { e.stopPropagation(); setFrameOpen((o) => !o); }} className="text-[11px] font-semibold h-[30px] px-3 rounded-md border transition-colors" style={{ borderColor: "#7c3aed", color: "#6d28d9", background: "#fff" }}>
              {frameOpen ? "▲ סגור אתר" : "🌐 פתח כאתר"}
            </button>
          )}
          {isPaywalled && (
            <span className="text-[10px] px-2 py-1 rounded" style={{ color: "#9ca3af", background: "#f3f4f6" }}>🔒 אתר בתשלום</span>
          )}
        </div>
        )}

        {/* In-app reader + סכם באז */}
        {readerOpen && (
          <div className="mt-3 rounded-lg border" style={{ borderColor: "#e0f2fe", background: "#f8fcff" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "#e0f2fe" }}>
              <span className="text-[11px] font-bold" style={{ color: "#0369a1" }}>📖 קריאה בתוך האתר</span>
              <div className="flex items-center gap-1.5">
                <button onClick={summarizeArticle} disabled={artSummaryLoading} className="text-[11px] font-semibold h-7 px-2.5 rounded-md text-white disabled:opacity-50" style={{ background: "#7c3aed" }}>
                  {artSummaryLoading ? "⏳ מסכם…" : "🧠 סכם באז"}
                </button>
                {readerText && (
                  <button onClick={async () => { await navigator.clipboard.writeText(readerText); setReaderCopied(true); setTimeout(() => setReaderCopied(false), 1500); }}
                    className="text-[10px] font-bold h-6 px-2 rounded border" style={readerCopied ? { borderColor: "#059669", color: "#059669", background: "#f0fdf4" } : { borderColor: "#bae6fd", color: "#0369a1", background: "#fff" }}
                    title="העתק את כל הטקסט">{readerCopied ? "✓ הועתק" : "📋 העתק"}</button>
                )}
                {news.source_url && <a href={news.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold" style={{ color: "#9ca3af" }}>מקור ←</a>}
                <button onClick={closeReader} className="text-[10px] font-bold h-6 px-2 rounded" style={{ color: "#fff", background: "#0369a1" }} title="סגור את הבאז">✕ סגור</button>
              </div>
            </div>
            {artSummary && (
              <div className="px-3 py-2.5 border-b" style={{ borderColor: "#ede9fe", background: "#faf8ff" }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-bold" style={{ color: "#7c3aed" }}>🧠 סיכום</p>
                  <div className="flex items-center gap-1" title="גודל הטקסט של הסיכום הזה בלבד">
                    <button onClick={() => bumpSummarySize(-1)} className="h-5 px-1.5 rounded border text-[11px] leading-none font-bold" style={{ borderColor: "#ddd6fe", color: "#6d28d9", background: "#fff" }}>א−</button>
                    <button onClick={() => bumpSummarySize(1)} className="h-5 px-1.5 rounded border text-[11px] leading-none font-bold" style={{ borderColor: "#ddd6fe", color: "#6d28d9", background: "#fff" }}>א+</button>
                  </div>
                </div>
                <div className="whitespace-pre-wrap leading-[1.6]" style={{ color: "#374151", fontSize: `${summarySize}px` }} dir="rtl">{artSummary}</div>
                <button onClick={async () => { await navigator.clipboard.writeText(artSummary); setArtSummaryCopied(true); setTimeout(() => setArtSummaryCopied(false), 1500); }}
                  className="flex items-center gap-1 text-[11px] font-semibold mt-2 h-7 px-2.5 rounded-md border transition-colors"
                  style={artSummaryCopied ? { borderColor: "#059669", color: "#059669", background: "#f0fdf4" } : { borderColor: "#ddd6fe", color: "#6d28d9", background: "#fff" }}
                  title="העתק את הסיכום">
                  {artSummaryCopied ? "✓ הועתק" : "📋 העתק סיכום"}
                </button>
              </div>
            )}
            <div className="px-3 py-2.5 max-h-[320px] overflow-y-auto">
              {readerLoading ? (
                <div className="flex items-center gap-2 text-[12px] py-4" style={{ color: "#6b7280" }}>
                  <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#0ea5e9", borderTopColor: "transparent" }} />טוען את המאמר…
                </div>
              ) : readerText ? (
                <>
                  {!readerFull && (isPaywalled
                    ? <p className="text-[10px] mb-1.5" style={{ color: "#d97706" }}>🔒 אתר בתשלום — מוצג תקציר בלבד.</p>
                    : <p className="text-[10px] mb-1.5" style={{ color: "#9ca3af" }}>📄 תצוגה מקוצרת — הכתבה נטענת דינמית ולא נשלף הגוף המלא. אפשר לפתוח במקור ↑</p>
                  )}
                  <div className="whitespace-pre-wrap text-[13px] leading-[1.75]" style={{ color: "#1f2937" }} dir="rtl">{readerText}</div>
                </>
              ) : (
                <p className="text-[12px] py-3" style={{ color: "#9ca3af" }} dir="rtl">{isPaywalled ? "לא ניתן לשלוף את גוף הבאז — אתר בתשלום." : "לא הצלחנו לשלוף את גוף הבאז (נטען דינמית או חוסם)."} אפשר לפתוח במקור, או לסכם מהכותרת.</p>
              )}
            </div>
            {/* Bottom close — finished reading at the bottom, close from there */}
            <div className="flex items-center justify-center py-2 border-t" style={{ borderColor: "#e0f2fe", background: "#f8fcff" }}>
              <button onClick={closeReader} className="text-[12px] font-bold h-8 px-4 rounded-md text-white" style={{ background: "#0369a1" }}>▲ סגור באז</button>
            </div>
          </div>
        )}

        {/* 🌐 Open the real article as an iframe (graceful fallback if blocked) */}
        {frameOpen && news.source_url && (
          <div className="mt-3 rounded-lg border overflow-hidden" style={{ borderColor: "#ede9fe" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "#ede9fe", background: "#faf8ff" }}>
              <span className="text-[11px] font-bold" style={{ color: "#6d28d9" }}>🌐 גלישה באתר</span>
              <div className="flex items-center gap-2.5">
                <button onClick={openReader} className="text-[10px] font-semibold" style={{ color: "#0369a1" }}>📖 קרא כאן</button>
                <a href={news.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold" style={{ color: "#9ca3af" }}>מקור ↗</a>
                <button onClick={closeFrame} className="text-[10px] font-bold h-6 px-2 rounded" style={{ color: "#fff", background: "#6d28d9" }}>✕ סגור</button>
              </div>
            </div>
            <p className="text-[10px] px-3 py-1.5" style={{ color: "#9ca3af", background: "#fafafa" }} dir="rtl">אם העמוד נשאר ריק — האתר חוסם הצגה מוטמעת (כמו ynet/ביזפורטל). אז לחץ &quot;📖 קרא כאן&quot; או &quot;מקור&quot;.</p>
            <iframe src={news.source_url} title={news.title.replace(/<[^>]*>/g, "")} loading="lazy" referrerPolicy="no-referrer" className="w-full bg-white" style={{ height: "78vh", border: 0 }} />
            {/* Bottom close — after reading you're at the bottom; no need to scroll back up */}
            <div className="flex items-center justify-center py-2 border-t" style={{ borderColor: "#ede9fe", background: "#faf8ff" }}>
              <button onClick={closeFrame} className="text-[12px] font-bold h-8 px-4 rounded-md" style={{ color: "#fff", background: "#6d28d9" }}>✕ סגור את האתר</button>
            </div>
          </div>
        )}
      </div>
      {generatedText && (
        <div style={{ borderTop: "1px solid #e5e7eb" }} onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "#f9fafb" }}>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="font-semibold" style={{ color: "#0f1419" }}>{generatedType === "article" ? "📰 כתבה" : "📝 הודעה"}</span>
              <span style={{ color: "#9ca3af" }}>{wc} מילים</span>
            </div>
            <button onClick={() => { setGeneratedText(null); setGeneratedType(null); setEditing(false); }} className="text-[11px] w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-200" style={{ color: "#9ca3af" }}>✕</button>
          </div>
          <div className="px-4 py-3">
            {editing ? (
              <div className="space-y-2">
                <Textarea value={generatedText} onChange={(e) => setGeneratedText(e.target.value)} className="min-h-[140px] text-[13px] leading-[1.7]" dir="rtl" />
                <button onClick={() => setEditing(false)} className="text-[11px] font-semibold h-7 px-3 rounded-md text-white" style={{ background: "#0f1419" }}>סיום</button>
              </div>
            ) : (
              <div className={`whitespace-pre-wrap text-[13px] leading-[1.7] cursor-pointer rounded-md p-2 hover:bg-gray-50 text-right ${generatedType === "article" ? "max-h-[280px] overflow-y-auto" : ""}`} dir="rtl" onClick={() => setEditing(true)}>{generatedText}</div>
            )}
          </div>
          <div className="px-4 pb-2">
            <div className="lf-ai-box p-2.5 space-y-1.5">
              <span className="text-[10px] font-semibold" style={{ color: "#7c3aed" }}>תקן עם AI</span>
              <div className="flex gap-1.5">
                <Textarea value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)} placeholder="מה לשנות?" className="text-[12px] min-h-[32px] max-h-[72px] resize-none flex-1 rounded-md" dir="rtl" rows={1} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); refine(); } }} />
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="sm" onClick={refine} disabled={!refineInstruction.trim() || refining} className="text-white text-[10px] h-6 px-2 rounded-md" style={{ backgroundColor: "#7c3aed" }}>{refining ? "..." : "תקן"}</Button>
                  <VoiceRecordButton onTranscript={(t) => setRefineInstruction((p) => (p ? p + " " + t : t))} />
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            <button onClick={async () => { if (!generatedText) return; await navigator.clipboard.writeText(generatedText); setResultCopyLabel("✓"); setTimeout(() => setResultCopyLabel(null), 1500); }} className="text-[11px] font-medium h-7 px-2.5 rounded-md border" style={resultCopyLabel ? { background: "#f0fdf4", borderColor: "#059669", color: "#059669" } : { borderColor: "#e5e7eb", color: "#6b7280" }}>{resultCopyLabel || "📋 העתק"}</button>
            {generatedType === "message" && <button onClick={() => { if (!generatedText) return; window.open(`https://wa.me/?text=${encodeURIComponent(generatedText)}`, "_blank"); }} className="text-[11px] font-medium h-7 px-2.5 rounded-md text-white" style={{ background: "#25D366" }}>📱 וואטסאפ</button>}
            {generatedType === "message" && <button onClick={(e) => generate("article", e)} disabled={generating !== null} className="text-[11px] font-medium h-7 px-2.5 rounded-md border" style={{ borderColor: "#dc2626", color: "#dc2626" }}>הרחב לכתבה</button>}
            <VoicePlayButton text={generatedText} size="sm" className="text-[11px]" />
          </div>
        </div>
      )}
    </article>
  );
}
