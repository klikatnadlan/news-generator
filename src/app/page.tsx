"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { NewsCard } from "@/components/news-card";
import { ScanStatus } from "@/components/scan-status";
import { UsernameDialog } from "@/components/username-dialog";
import { ResultsPanel } from "@/components/results-panel";
import { SiteNav } from "@/components/site-nav";
import type { ScoredNews } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VoicePlayButton } from "@/components/voice-play-button";
import { VoiceRecordButton } from "@/components/voice-record-button";
import { Textarea } from "@/components/ui/textarea";

type Phase = "select" | "generating" | "generating-digest" | "results" | "digest";

const DAYS_HEB = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

interface WeekNews extends ScoredNews {
  scan_date?: string;
}

function getHebrewDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return DAYS_HEB[d.getDay()];
}

export default function HomePage() {
  const router = useRouter();
  const [heroQuery, setHeroQuery] = useState("");
  const [allNews, setAllNews] = useState<WeekNews[]>([]);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("select");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [results, setResults] = useState<{ title: string; source: string; sourceUrl: string; text: string; newsItemId: string; textId: string }[]>([]);
  const [digestText, setDigestText] = useState("");
  const [digestTextId, setDigestTextId] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [digestEditing, setDigestEditing] = useState(false);
  const [digestRefineInstruction, setDigestRefineInstruction] = useState("");
  const [selectedDay, setSelectedDay] = useState("היום");
  const [digestRefining, setDigestRefining] = useState(false);
  const [digestSent, setDigestSent] = useState(false);
  const [digestCopyLabel, setDigestCopyLabel] = useState<string | null>(null);
  const [digestHumanity, setDigestHumanity] = useState<{ score: number; flags: string[]; suggestion: string } | "loading" | null>(null);
  const [digestExpandingArticle, setDigestExpandingArticle] = useState(false);
  const [digestArticleText, setDigestArticleText] = useState<string | null>(null);
  const [showHero, setShowHero] = useState(true);
  // True while the corresponding SSE stream is open — drives the typing
  // cursor + "LIVE · Claude כותב" pill in the digest/article cards.
  const [digestStreaming, setDigestStreaming] = useState(false);
  const [articleStreaming, setArticleStreaming] = useState(false);

  useEffect(() => { setUsername(localStorage.getItem("news-gen-username")); }, []);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/week");
      const data = await res.json();
      setAllNews(data.news || []);
      setLastScan(data.lastScan);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNews(); const i = setInterval(fetchNews, 5 * 60 * 1000); return () => clearInterval(i); }, [fetchNews]);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayDay = DAYS_HEB[new Date().getDay()];

  // Smart default: if "היום" has no news yet (e.g. morning before the scan, or
  // the daily scan found only duplicates) but the week has items, auto-show
  // the whole week so the user never lands on an empty page. Runs once after
  // the first load; never overrides a manual day choice afterwards.
  const [autoSwitchedDay, setAutoSwitchedDay] = useState(false);
  useEffect(() => {
    if (autoSwitchedDay || loading || allNews.length === 0) return;
    const todayCount = allNews.filter((n) => n.scan_date === todayStr).length;
    if (selectedDay === "היום" && todayCount === 0) {
      setSelectedDay("הכל");
    }
    setAutoSwitchedDay(true);
  }, [autoSwitchedDay, loading, allNews, selectedDay, todayStr]);

  // Rolling 7-day window going BACKWARD from today (today + 6 past days).
  // Each past day stores the real ISO date, so picking ב' on a Sunday
  // means "last Monday", not "this coming Monday".
  const pastDays = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i - 1);
    return { iso: d.toISOString().split("T")[0], label: DAYS_HEB[d.getDay()] };
  });

  const news = allNews.filter(item => {
    if (selectedDay === "הכל") return true;
    if (selectedDay === "היום") return item.scan_date === todayStr;
    return item.scan_date === selectedDay; // ISO date string
  });

  const handleSelect = (id: string, sel: boolean) => {
    setSelected(prev => { const n = new Set(prev); sel ? n.add(id) : n.delete(id); return n; });
  };
  const handleSelectAll = () => {
    const filteredIds = news.map(n => n.id);
    const allSel = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
    if (allSel) {
      setSelected(prev => { const n = new Set(prev); filteredIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); filteredIds.forEach(id => n.add(id)); return n; });
    }
  };

  /**
   * Streaming batch generation. Pre-seeds N empty result cards on the
   * results screen, then consumes the SSE multi-stream from /api/generate
   * to fill each card progressively (each delta tagged with newsItemId).
   */
  const handleBatchGenerate = async () => {
    if (selected.size === 0) return;
    setGenerateError(null);
    const ids = Array.from(selected);

    // Seed empty results so the user sees titles/cards immediately instead
    // of a long spinner while Claude warms up.
    const skeletons = ids.map((id) => {
      const n = allNews.find((nn) => nn.id === id);
      return {
        title: n?.title || "",
        source: n?.source || "",
        sourceUrl: n?.source_url || "",
        text: "",
        newsItemId: id,
        textId: "",
      };
    });
    setResults(skeletons);
    setPhase("results");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemIds: ids, style: "regular" }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setGenerateError(data.error || `שגיאה (${res.status}). נסו שוב.`);
        setPhase("select");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          if (!evt.trim()) continue;
          let eventType = "message";
          let dataStr = "";
          for (const line of evt.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === "item-done") {
              setResults((prev) =>
                prev.map((r) =>
                  r.newsItemId === parsed.newsItemId
                    ? { ...r, textId: parsed.textId || "" }
                    : r,
                ),
              );
            } else if (eventType === "all-done") {
              // nothing to do — UI already reflects final state
            } else if (eventType === "error") {
              setGenerateError(parsed.error || "שגיאה ביצירת הנוסחים.");
              return;
            } else if (typeof parsed.text === "string" && parsed.newsItemId) {
              setResults((prev) =>
                prev.map((r) =>
                  r.newsItemId === parsed.newsItemId
                    ? { ...r, text: (r.text || "") + parsed.text }
                    : r,
                ),
              );
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch {
      setGenerateError("הרשת קרסה באמצע. בדוק חיבור ונסה שוב.");
      setPhase("select");
    }
  };

  const handleDigestGenerate = async () => {
    if (selected.size === 0) return;
    await runDigestStream(Array.from(selected));
  };

  /**
   * Regenerate a single item. /api/generate is an SSE multi-stream now, so we
   * consume the stream for the one id, accumulate its text, and return the
   * cleaned result once the item-done event arrives. (Used by ResultsPanel's
   * "נסח מחדש" — previously this did res.json() and silently failed forever.)
   */
  const handleRegenerate = async (newsItemId: string, style: "short" | "regular" | "commentary"): Promise<{ text: string; id: string } | null> => {
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemIds: [newsItemId], style }),
      });
      if (!res.ok || !res.body) return null;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let textId = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          if (!evt.trim()) continue;
          let eventType = "message";
          let dataStr = "";
          for (const line of evt.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === "item-done") {
              textId = parsed.textId || "";
            } else if (typeof parsed.text === "string") {
              text += parsed.text;
            }
          } catch { /* skip */ }
        }
      }

      text = text.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");
      return text ? { text, id: textId } : null;
    } catch {
      return null;
    }
  };

  const handleBackToSelect = () => { setPhase("select"); setResults([]); setDigestText(""); setDigestTextId(""); };

  const handleQuickDigest = async () => {
    const top3 = news.slice(0, 3).map(n => n.id);
    setSelected(new Set(top3));
    await runDigestStream(top3);
  };

  /**
   * Consume /api/article as a Server-Sent Events stream. Renders the article
   * progressively into digestArticleText so the user watches Claude write
   * the 600-1000 word piece in real time.
   */
  const runArticleStream = async () => {
    const newsItemId = Array.from(selected)[0] || "";
    if (!newsItemId) return;
    setDigestExpandingArticle(true);
    setArticleStreaming(true);
    setDigestArticleText("");
    try {
      const res = await fetch("/api/article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemId, fromNarrative: digestText }),
      });
      if (!res.ok || !res.body) {
        setDigestExpandingArticle(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aborted = false;
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          if (!evt.trim()) continue;
          let eventType = "message";
          let dataStr = "";
          for (const line of evt.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === "done") {
              // article saved — no extra state to update
            } else if (eventType === "error") {
              aborted = true;
              break;
            } else if (typeof parsed.text === "string") {
              setDigestArticleText((prev) => (prev || "") + parsed.text);
            }
          } catch {
            // skip
          }
        }
      }
      // Final em-dash cleanup once the article stream completes
      setDigestArticleText((prev) =>
        prev ? prev.replace(/\s*—\s*/g, ", ").replace(/–/g, "-") : prev,
      );
    } catch {
      // network error — leave whatever was streamed in place
    } finally {
      setDigestExpandingArticle(false);
      setArticleStreaming(false);
    }
  };

  /**
   * Consume /api/digest as a Server-Sent Events stream. Each text delta is
   * appended to digestText so the user sees Claude typing in real time.
   * On first chunk we flip from "generating-digest" (spinner) to "digest"
   * (text view). The terminal `event: done` carries the persisted textId.
   */
  const runDigestStream = async (ids: string[]) => {
    setPhase("generating-digest");
    setDigestText("");
    setDigestTextId("");
    setGenerateError(null);
    setDigestStreaming(true);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemIds: ids }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setGenerateError(data.error || `שגיאה (${res.status}). נסו שוב.`);
        setPhase("select");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedFirstChunk = false;
      let aborted = false;

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          if (!evt.trim()) continue;
          let eventType = "message";
          let dataStr = "";
          for (const line of evt.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === "done") {
              setDigestTextId(parsed.textId || "");
            } else if (eventType === "error") {
              setGenerateError(parsed.error || "שגיאה ביצירת התקציר.");
              setPhase("select");
              aborted = true;
              break;
            } else if (typeof parsed.text === "string") {
              if (!receivedFirstChunk) {
                setPhase("digest");
                receivedFirstChunk = true;
              }
              setDigestText((prev) => prev + parsed.text);
            }
          } catch {
            // Skip unparseable chunks (shouldn't happen but be resilient)
          }
        }
      }

      // Final em-dash cleanup once the stream is complete (matches the
      // server-side cleanup applied to the persisted copy).
      if (receivedFirstChunk) {
        setDigestText((prev) => prev.replace(/\s*—\s*/g, ", ").replace(/–/g, "-"));
      }

      if (!receivedFirstChunk && !aborted) {
        setGenerateError("התקציר חזר ריק. נסו עם פחות ידיעות.");
        setPhase("select");
      }
    } catch {
      setGenerateError("הרשת קרסה באמצע. בדוק חיבור ונסה שוב.");
      setPhase("select");
    } finally {
      setDigestStreaming(false);
    }
  };

  const allSelected = news.length > 0 && news.every(n => selected.has(n.id));

  const now = new Date();
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const groupedByDate = news.reduce<Record<string, WeekNews[]>>((acc, item) => {
    if (!item.scan_date) return acc;
    if (!acc[item.scan_date]) acc[item.scan_date] = [];
    acc[item.scan_date].push(item);
    return acc;
  }, {});

  return (
    <main className="min-h-screen" style={{ background: "var(--lf-bg)" }} dir="rtl">
      <UsernameDialog />

      <SiteNav />

      {showHero && phase === "select" && (
        <section className="lf-hero">
          <div className="lf-hero-grid" />
          <div className="lf-hero-glow" />

          <div className="relative max-w-3xl mx-auto px-4 pt-12 pb-10 sm:pt-16 sm:pb-14 text-center">
            {/* Date/time — subtle, top-left */}
            <div className="absolute top-4 left-4 text-left lf-fade-in" style={{ animationDelay: "120ms" }}>
              <p suppressHydrationWarning className="text-[16px] sm:text-[18px] font-bold text-white/90 leading-none tabular-nums" style={{ fontFamily: "DM Sans" }}>{timeStr}</p>
              <p suppressHydrationWarning className="text-[10px] text-white/40 mt-1">{dateStr}</p>
            </div>

            {/* LIVE pill — centered above title */}
            <div className="lf-fade-in" style={{ animationDelay: "200ms" }}>
              <div className="lf-live-pill">
                <span className="lf-live-dot" />
                <span className="text-[10px] font-bold text-emerald-400 tracking-[0.18em]" style={{ fontFamily: "DM Sans" }}>LIVE</span>
                <span className="text-[10px] text-white/25">·</span>
                <span className="text-[10px] text-white/55">מערכת פעילה</span>
              </div>
            </div>

            {/* Hero title — massive */}
            <h1
              className="mt-6 text-[48px] sm:text-[68px] lg:text-[80px] font-black text-white leading-[1.02] tracking-tight lf-fade-in"
              style={{ animationDelay: "400ms", fontFamily: "Heebo, system-ui" }}
            >
              לידרפיד
              <span className="lf-dot-red" aria-hidden="true" />
            </h1>

            {/* "by ben solomon" — signature line, projector style */}
            <p
              className="text-[12px] sm:text-[13px] text-white/50 italic mt-1.5 lf-fade-in"
              style={{ animationDelay: "550ms", fontFamily: "Georgia, serif" }}
            >
              by ben solomon
            </p>

            {/* Subtitle — three beats of the brand promise */}
            <div className="mt-5 sm:mt-6 space-y-1">
              <p
                className="text-[15px] sm:text-[19px] text-white/85 font-medium leading-relaxed lf-fade-in"
                style={{ animationDelay: "750ms" }}
              >
                לקרוא את הבאזז, להבין את הבאזז
              </p>
              <p
                className="text-[15px] sm:text-[19px] text-white/85 font-medium leading-relaxed lf-fade-in"
                style={{ animationDelay: "1050ms" }}
              >
                לדעת על מה כולם ידברו <span className="text-red-400 font-bold">גם מחר</span>
              </p>
            </div>

            {/* Smart search — jump straight into the archive */}
            <form
              onSubmit={(e) => { e.preventDefault(); const q = heroQuery.trim(); if (q) router.push(`/archive?q=${encodeURIComponent(q)}`); }}
              className="mt-6 max-w-[520px] mx-auto lf-fade-in"
              style={{ animationDelay: "1200ms" }}
            >
              <div className="flex items-center gap-2 rounded-full px-4 h-12 transition-colors"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 opacity-70"><circle cx="11" cy="11" r="7" stroke="#fff" strokeWidth="2"/><path d="M21 21l-4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
                <input
                  value={heroQuery}
                  onChange={(e) => setHeroQuery(e.target.value)}
                  placeholder="להבין את השוק במהירות"
                  className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/45 focus:outline-none"
                  dir="rtl"
                />
                <button type="submit" className="shrink-0 text-[13px] font-bold px-3 py-1.5 rounded-full transition-all hover:opacity-90"
                  style={{ background: "#dc2626", color: "#fff" }}>חפש ←</button>
              </div>
            </form>

            {/* Stats — animated reveal */}
            <div
              className="mt-10 grid grid-cols-3 gap-2.5 sm:gap-4 lf-fade-in"
              style={{ animationDelay: "1350ms" }}
            >
              <div className="lf-stat-card-v2">
                <p className="lf-stat-number">
                  {loading ? "—" : allNews.filter(n => n.scan_date === todayStr).length}
                </p>
                <p className="lf-stat-label">ידיעות היום</p>
              </div>
              <div className="lf-stat-card-v2">
                <p className="lf-stat-number">
                  {loading ? "—" : allNews.length}
                </p>
                <p className="lf-stat-label">סה״כ השבוע</p>
              </div>
              <div className="lf-stat-card-v2">
                <p className="lf-stat-number lf-stat-number-sm">
                  {lastScan ? new Date(lastScan).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </p>
                <p className="lf-stat-label">סריקה אחרונה</p>
              </div>
            </div>

            {/* CTAs */}
            {!loading && news.length >= 3 && (
              <div
                className="mt-7 flex flex-col sm:flex-row gap-2.5 max-w-[440px] mx-auto lf-fade-in"
                style={{ animationDelay: "1650ms" }}
              >
                <button
                  className="lf-hero-cta-primary"
                  onClick={() => { setShowHero(false); handleQuickDigest(); }}
                  title="Claude יסכם את 3 הידיעות הכי חשובות היום לטקסט וואטסאפ מוכן לשליחה. ~20 שניות."
                >
                  תקציר יומי מהיר ←
                </button>
                <button
                  className="lf-hero-cta-secondary"
                  onClick={() => setShowHero(false)}
                  title="בחר ידעות בעצמך מהפיד המלא ותפיק נוסחים אישיים."
                >
                  בחירה ידנית
                </button>
              </div>
            )}

            {/* How it works — 3-step explainer (always visible in hero) */}
            <div
              className="mt-10 grid grid-cols-3 gap-3 sm:gap-4 max-w-[520px] mx-auto lf-fade-in"
              style={{ animationDelay: "1850ms" }}
            >
              {[
                { num: "1", emoji: "📡", title: "סורק", text: "200+ כותרות יומיות מ-15 מקורות" },
                { num: "2", emoji: "🤖", title: "מדרג", text: "Claude נותן ציון ובוחר את הסיפורים החשובים" },
                { num: "3", emoji: "📱", title: "מייצר", text: "הודעת וואטסאפ מוכנה בקול של בן" },
              ].map((s) => (
                <div key={s.num} className="text-center">
                  <div className="text-[24px] mb-1">{s.emoji}</div>
                  <p className="text-[11px] font-bold text-white/85 leading-tight">{s.title}</p>
                  <p className="text-[10px] mt-0.5 text-white/45 leading-[1.4]">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {(!showHero || phase !== "select") && (
        <div style={{ background: "var(--lf-navy)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="max-w-3xl mx-auto px-4 flex items-center gap-3 h-8 text-[11px]">
            <span className="text-white/40">ידיעות</span>
            <span className="text-white font-semibold" style={{ fontFamily: "DM Sans" }}>{news.length}</span>
            {selected.size > 0 && <><span className="text-white/20">|</span><span className="text-[11px] font-semibold" style={{ color: "#fca5a5" }}>{selected.size} נבחרו</span></>}
            <span className="text-white/20">|</span>
            <span className="text-white/40">סריקה</span>
            <span className="text-white/60">{lastScan ? new Date(lastScan).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            {showHero === false && phase === "select" && <button className="mr-auto text-[10px] text-white/30 hover:text-white/60 transition-colors" onClick={() => setShowHero(true)}>הראה סקירה</button>}
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-5">
        {phase === "select" && (<>
          <ScanStatus lastScan={lastScan} onScanComplete={fetchNews} hasNews={allNews.length > 0} />
          {generateError && <div className="mt-3 rounded-lg p-3 text-center text-[13px] font-medium" style={{ background: "var(--lf-red-soft)", color: "var(--lf-red)", border: "1px solid #fecaca" }}>{generateError}</div>}

          <div className={`mt-4 space-y-2.5 ${selected.size > 0 ? "pb-28" : "pb-8"}`}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--lf-navy)", borderTopColor: "transparent" }} />
                <p className="text-[13px]" style={{ color: "var(--lf-text-secondary)" }}>אוסף את הידיעות מ-RSS… (~5 שניות)</p>
              </div>
            ) : allNews.length === 0 ? null : (<>
              {!showHero && news.length >= 3 && selected.size === 0 && (
                <button className="lf-btn lf-btn-dark w-full !py-2.5 text-[13px]" onClick={handleQuickDigest}>תקציר יומי מהיר — 3 מובילות</button>
              )}

              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <button
                  key="היום"
                  onClick={() => { setSelectedDay("היום"); setSelected(new Set()); }}
                  className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                  style={{ background: selectedDay === "היום" ? "var(--lf-navy)" : "transparent", color: selectedDay === "היום" ? "#fff" : "var(--lf-text-tertiary)", border: `1px solid ${selectedDay === "היום" ? "var(--lf-navy)" : "var(--lf-border)"}` }}>
                  היום ({todayDay})
                </button>
                {pastDays.map(d => (
                  <button
                    key={d.iso}
                    onClick={() => { setSelectedDay(d.iso); setSelected(new Set()); }}
                    className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                    style={{ background: selectedDay === d.iso ? "var(--lf-navy)" : "transparent", color: selectedDay === d.iso ? "#fff" : "var(--lf-text-tertiary)", border: `1px solid ${selectedDay === d.iso ? "var(--lf-navy)" : "var(--lf-border)"}` }}>
                    {d.label}
                  </button>
                ))}
                <button
                  key="הכל"
                  onClick={() => { setSelectedDay("הכל"); setSelected(new Set()); }}
                  className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                  style={{ background: selectedDay === "הכל" ? "var(--lf-navy)" : "transparent", color: selectedDay === "הכל" ? "#fff" : "var(--lf-text-tertiary)", border: `1px solid ${selectedDay === "הכל" ? "var(--lf-navy)" : "var(--lf-border)"}` }}>
                  הכל
                </button>
                <span className="text-[10px] mx-0.5" style={{ color: "var(--lf-border)" }}>|</span>
                <Link href="/headlines" className="px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap shrink-0 font-medium transition-colors" style={{ background: "transparent", color: "#dc2626", border: "1px solid #fecaca" }}>כותרות</Link>
                <button onClick={handleSelectAll} className="text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-gray-100 whitespace-nowrap shrink-0 mr-auto" style={{ color: "var(--lf-text-secondary)" }}>{allSelected ? "בטל הכל" : "בחר הכל"}</button>
              </div>

              {selectedDay === "הכל" ? (
                <div className="space-y-4 mt-2">
                  {Object.keys(groupedByDate).sort().reverse().map(iso => (
                    <div key={iso}>
                      <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 py-1" style={{ background: "var(--lf-bg)" }}>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: "var(--lf-navy)" }}>יום {DAYS_HEB[new Date(iso + "T12:00:00").getDay()]}׳ · {new Date(iso + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}</span>
                        <span className="text-[10px]" style={{ color: "var(--lf-text-tertiary)" }}>{groupedByDate[iso].length} ידיעות</span>
                        <div className="flex-1 h-px" style={{ background: "var(--lf-border)" }} />
                      </div>
                      {groupedByDate[iso].map((item, idx) => (
                        <div key={item.id} className="lf-animate mb-2.5" style={{ animationDelay: `${idx * 40}ms` }}>
                          <NewsCard news={item} selected={selected.has(item.id)} onSelect={handleSelect} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                news.map((item, idx) => (
                  <div key={item.id} className="lf-animate" style={{ animationDelay: `${idx * 40}ms` }}>
                    <NewsCard news={item} selected={selected.has(item.id)} onSelect={handleSelect} />
                  </div>
                ))
              )}

              {news.length === 0 && !loading && (
                <div className="text-center py-12" style={{ color: "var(--lf-text-tertiary)" }}>
                  <p className="text-[13px]">
                    אין ידיעות {selectedDay === "היום"
                      ? "להיום"
                      : `ליום ${DAYS_HEB[new Date(selectedDay + "T12:00:00").getDay()]}׳ (${new Date(selectedDay + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })})`}
                  </p>
                  <button className="text-[12px] mt-2 underline" style={{ color: "var(--lf-navy)" }} onClick={() => setSelectedDay("הכל")}>הצג את הכל</button>
                </div>
              )}
            </>)}
          </div>

          {selected.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-50 lf-glass">
              <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
                <button className="lf-btn lf-btn-red w-full !py-3 text-[13px] font-bold" onClick={handleBatchGenerate}>צור נוסח ל-{selected.size} ידיעות</button>
                {selected.size >= 2 && <button className="lf-btn lf-btn-dark w-full !py-2.5 text-[12px]" onClick={handleDigestGenerate}>תקציר מאוחד ({selected.size})</button>}
              </div>
            </div>
          )}
        </>)}

        {(phase === "generating" || phase === "generating-digest") && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--lf-navy)", borderTopColor: "transparent" }} />
            <div className="text-center max-w-xs">
              <p className="text-[15px] font-bold" style={{ color: "var(--lf-text)" }}>
                {phase === "generating-digest" ? "Claude כותב את התקציר היומי…" : `Claude כותב ${selected.size} נוסחים במקביל…`}
              </p>
              <p className="text-[12px] mt-1.5" style={{ color: "var(--lf-text-tertiary)" }}>
                {phase === "generating-digest" ? "מסכם את הסיפורים הכי חשובים בקול של בן · ~20 שניות" : "כל נוסח בקול של בן, מותאם לוואטסאפ · ~25 שניות"}
              </p>
            </div>
          </div>
        )}

        {phase === "results" && <div className="mt-4 pb-8"><ResultsPanel results={results} onBack={handleBackToSelect} onRegenerate={handleRegenerate} /></div>}

        {phase === "digest" && (
          <div className="mt-4 pb-8 space-y-3">
            <div className="lf-card p-4 flex items-center gap-3" style={{ borderRight: "3px solid #059669" }}>
              <div>
                <p className="text-[14px] font-bold" style={{ color: "var(--lf-text)" }}>תקציר יומי מוכן</p>
                <p className="text-[11px]" style={{ color: "var(--lf-text-tertiary)" }}>{digestText.trim().split(/\s+/).filter(Boolean).length} מילים · ערכו, תקנו, שתפו</p>
              </div>
            </div>
            {digestEditing ? (
              <div className="space-y-2">
                <Textarea value={digestText} onChange={e => setDigestText(e.target.value)} className="min-h-[220px] text-[13px] leading-[1.7]" dir="rtl" />
                <button onClick={() => setDigestEditing(false)} className="lf-btn lf-btn-dark text-[11px] !py-1.5 !px-3">סיום עריכה</button>
              </div>
            ) : (
              <div className="lf-card whitespace-pre-wrap text-[13px] leading-[1.7] p-5 cursor-pointer group relative" dir="rtl" onClick={() => !digestStreaming && setDigestEditing(true)}>
                {digestStreaming && (
                  <div className="absolute top-2 right-2">
                    <span className="lf-streaming-pill">LIVE · Claude כותב</span>
                  </div>
                )}
                <span className={digestStreaming ? "lf-streaming-cursor" : ""}>{digestText}</span>
                {!digestStreaming && (
                  <span className="absolute top-2 left-2 text-[10px] opacity-0 group-hover:opacity-100 bg-gray-100 px-1.5 py-0.5 rounded" style={{ color: "var(--lf-text-tertiary)" }}>לחץ לעריכה</span>
                )}
              </div>
            )}
            <div className="lf-ai-box p-3 space-y-1.5">
              <span className="text-[10px] font-semibold" style={{ color: "#7c3aed" }}>תקן עם AI</span>
              <div className="flex gap-1.5">
                <Textarea value={digestRefineInstruction} onChange={e => setDigestRefineInstruction(e.target.value)} placeholder="מה לשנות?" className="text-[12px] min-h-[32px] max-h-[80px] resize-none flex-1" dir="rtl" rows={1} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!digestRefineInstruction.trim() || digestRefining) return; setDigestRefining(true); fetch("/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentText: digestText, instruction: digestRefineInstruction.trim() }) }).then(r => r.json()).then(d => { if (d.text) { setDigestText(d.text); setDigestRefineInstruction(""); } }).finally(() => setDigestRefining(false)); } }} />
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="sm" onClick={async () => { if (!digestRefineInstruction.trim() || digestRefining) return; setDigestRefining(true); try { const r = await fetch("/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentText: digestText, instruction: digestRefineInstruction.trim() }) }); const d = await r.json(); if (d.text) { setDigestText(d.text); setDigestRefineInstruction(""); } } finally { setDigestRefining(false); } }} disabled={!digestRefineInstruction.trim() || digestRefining} className="text-white text-[10px] h-6 px-2 rounded" style={{ backgroundColor: "#7c3aed" }}>{digestRefining ? "..." : "תקן"}</Button>
                  <VoiceRecordButton onTranscript={t => setDigestRefineInstruction(p => (p ? p + " " + t : t))} />
                </div>
              </div>
            </div>
            {digestHumanity && digestHumanity !== "loading" && (
              <div className="lf-card p-3 text-[11px]" style={{ borderRight: `3px solid ${digestHumanity.score >= 7 ? "#059669" : digestHumanity.score >= 5 ? "#d97706" : "#dc2626"}` }}>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">אנושיות: {digestHumanity.score}/10</span>
                  <span
                    className="text-[9px] text-white font-bold rounded-full w-3.5 h-3.5 inline-flex items-center justify-center cursor-help"
                    style={{ background: "#9ca3af" }}
                    title="כמה הטקסט נשמע כמו אדם אמיתי (לא בוט). 7+ = מצוין לשליחה. 5-6 = יש מה לערוך. מתחת ל-5 = להריץ שוב או לערוך ידנית."
                  >?</span>
                </div>
                {digestHumanity.flags?.length > 0 && <span className="mr-2" style={{ color: "var(--lf-text-tertiary)" }}>{digestHumanity.flags.join(" · ")}</span>}
                {digestHumanity.suggestion && <p className="mt-1" style={{ color: "var(--lf-text-secondary)" }}>{digestHumanity.suggestion}</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-2">
              <button className={`lf-btn text-[11px] !py-1.5 !px-3 ${digestCopyLabel ? "lf-btn-dark" : "lf-btn-outline"}`} onClick={async () => { await navigator.clipboard.writeText(digestText); setDigestCopyLabel("✓"); setTimeout(() => setDigestCopyLabel(null), 1500); }}>{digestCopyLabel || "העתק"}</button>
              <button className="lf-btn text-[11px] !py-1.5 !px-3 text-white" style={{ background: "#25D366" }} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(digestText)}`, "_blank")}>וואטסאפ</button>
              <button className="lf-btn lf-btn-outline text-[11px] !py-1.5 !px-3" onClick={handleDigestGenerate}>נסח מחדש</button>
              <button className={`lf-btn text-[11px] !py-1.5 !px-3 ${digestSent ? "lf-btn-dark" : "lf-btn-outline"}`} onClick={() => setDigestSent(true)} disabled={digestSent || (digestHumanity !== null && digestHumanity !== "loading" && digestHumanity.score < 6)}>{digestSent ? "✓ נשלח" : (digestHumanity !== null && digestHumanity !== "loading" && digestHumanity.score < 6) ? "נחסם (< 6)" : "סמן כנשלח"}</button>
              <VoicePlayButton text={digestText} />
              <button className="lf-btn lf-btn-outline text-[11px] !py-1.5 !px-3" disabled={digestHumanity === "loading"} onClick={async () => { setDigestHumanity("loading"); try { const r = await fetch("/api/humanity-score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: digestText }) }); setDigestHumanity(await r.json()); } catch { setDigestHumanity(null); } }}>{digestHumanity === "loading" ? "בודק..." : "בדיקת אנושיות"}</button>
              <button className="lf-btn lf-btn-outline text-[11px] !py-1.5 !px-3" style={{ borderColor: "var(--lf-red)", color: "var(--lf-red)" }} disabled={digestExpandingArticle} onClick={runArticleStream}>{digestExpandingArticle ? "Claude כותב..." : "הרחב לכתבה"}</button>
            </div>
            {digestArticleText !== null && (
              <div className="lf-card p-4 space-y-2" style={{ borderRight: "3px solid var(--lf-red)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold" style={{ color: "var(--lf-red)" }}>כתבה — {digestArticleText.trim().split(/\s+/).filter(Boolean).length} מילים</span>
                    {articleStreaming && <span className="lf-streaming-pill">LIVE · Claude כותב</span>}
                  </div>
                  <button onClick={() => setDigestArticleText(null)} className="text-[11px]" style={{ color: "var(--lf-text-tertiary)" }}>✕</button>
                </div>
                <div className="whitespace-pre-wrap text-[13px] leading-[1.7] max-h-[360px] overflow-y-auto rounded-lg p-3" style={{ background: "var(--lf-surface)" }} dir="rtl">
                  <span className={articleStreaming ? "lf-streaming-cursor" : ""}>{digestArticleText}</span>
                </div>
                {!articleStreaming && (
                  <div className="flex gap-1.5">
                    <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2" onClick={async () => { await navigator.clipboard.writeText(digestArticleText || ""); }}>העתק</button>
                    <VoicePlayButton text={digestArticleText} />
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-center pt-4">
              <button className="lf-btn lf-btn-outline text-[12px] !px-5" onClick={handleBackToSelect}>← חזרה לידיעות</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
