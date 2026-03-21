"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { NewsCard } from "@/components/news-card";
import { ScanStatus } from "@/components/scan-status";
import { UsernameDialog } from "@/components/username-dialog";
import { ResultsPanel } from "@/components/results-panel";
import type { ScoredNews } from "@/lib/types";
import Link from "next/link";
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
  const dayOrder = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"];

  const news = allNews.filter(item => {
    if (selectedDay === "הכל") return true;
    if (selectedDay === "היום") return item.scan_date === todayStr;
    const itemDay = item.scan_date ? getHebrewDay(item.scan_date) : "";
    return itemDay === selectedDay;
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

  const handleBatchGenerate = async () => {
    if (selected.size === 0) return;
    setPhase("generating"); setGenerateError(null);
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newsItemIds: Array.from(selected), style: "regular" }) });
      const data = await res.json();
      if (data.error) { setGenerateError(data.error); setPhase("select"); return; }
      const r = data.results || [];
      if (r.length === 0) { setGenerateError("לא נוצרו נוסחים."); setPhase("select"); return; }
      setResults(r.map((x: { text: string; newsItemId: string; id: string }) => {
        const n = allNews.find(nn => nn.id === x.newsItemId);
        return { title: n?.title || "", source: n?.source || "", sourceUrl: n?.source_url || "", text: x.text, newsItemId: x.newsItemId, textId: x.id || "" };
      }));
      setPhase("results");
    } catch { setGenerateError("שגיאה. נסו שוב."); setPhase("select"); }
  };

  const handleDigestGenerate = async () => {
    if (selected.size === 0) return;
    setPhase("generating-digest"); setGenerateError(null);
    try {
      const res = await fetch("/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newsItemIds: Array.from(selected) }) });
      const data = await res.json();
      if (data.error) { setGenerateError(data.error); setPhase("select"); return; }
      setDigestText(data.digest); setDigestTextId(data.textId || ""); setPhase("digest");
    } catch { setGenerateError("שגיאה. נסו שוב."); setPhase("select"); }
  };

  const handleRegenerate = async (newsItemId: string, style: "short" | "regular" | "commentary"): Promise<{ text: string; id: string } | null> => {
    try { const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newsItemIds: [newsItemId], style }) }); const d = await res.json(); if (d.results?.[0]) return { text: d.results[0].text, id: d.results[0].id || "" }; } catch { /**/ }
    return null;
  };

  const handleBackToSelect = () => { setPhase("select"); setResults([]); setDigestText(""); setDigestTextId(""); };

  const handleQuickDigest = async () => {
    const top3 = news.slice(0, 3).map(n => n.id);
    setSelected(new Set(top3)); setPhase("generating-digest"); setGenerateError(null);
    try {
      const res = await fetch("/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newsItemIds: top3 }) });
      const data = await res.json();
      if (data.error) { setGenerateError(data.error); setPhase("select"); return; }
      setDigestText(data.digest); setDigestTextId(data.textId || ""); setPhase("digest");
    } catch { setGenerateError("שגיאה. נסו שוב."); setPhase("select"); }
  };

  const allSelected = news.length > 0 && news.every(n => selected.has(n.id));

  const now = new Date();
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const groupedByDay = news.reduce<Record<string, WeekNews[]>>((acc, item) => {
    const day = item.scan_date ? getHebrewDay(item.scan_date) : "?";
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});

  return (
    <main className="min-h-screen" style={{ background: "var(--lf-bg)" }} dir="rtl">
      <UsernameDialog />

      <header className="lf-header">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-12">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-extrabold text-white tracking-tight" style={{ fontFamily: "DM Sans, system-ui" }}>לידרפיד</span>
            <span className="text-[10px] text-white/30 hidden sm:inline">|</span>
            <span className="text-[10px] text-white/30 hidden sm:inline">מודיעין נדל״ן</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/headlines" className="text-[12px] text-white/60 hover:text-white transition-colors">כותרות</Link>
            <Link href="/dashboard" className="text-[12px] text-white/60 hover:text-white transition-colors">לוח בקרה</Link>
            <Link href="/archive" className="text-[12px] text-white/60 hover:text-white transition-colors">ארכיון</Link>
            <Link href="/history" className="text-[12px] text-white/60 hover:text-white transition-colors">היסטוריה</Link>
            {username && <span className="text-[11px] text-white/25 hidden sm:inline">{username}</span>}
          </nav>
        </div>
      </header>

      {showHero && phase === "select" && (
        <section className="lf-hero">
          <div className="lf-hero-grid" />
          <div className="relative max-w-3xl mx-auto px-4 py-8 sm:py-10">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-emerald-400 font-medium">מערכת פעילה</span>
                </div>
                <h1 className="text-[26px] sm:text-[32px] font-extrabold text-white leading-tight" style={{ fontFamily: "Heebo, system-ui" }}>לידרפיד</h1>
                <p className="text-[13px] text-white/50 mt-0.5">מודיעין נדל״ן · קליקת הנדל״ן</p>
              </div>
              <div className="text-left">
                <p className="text-[22px] font-bold text-white/90" style={{ fontFamily: "DM Sans, system-ui" }}>{timeStr}</p>
                <p className="text-[11px] text-white/40">{dateStr}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="lf-stat-pill px-3 py-2.5 text-center">
                <p className="text-[22px] font-extrabold text-white leading-none" style={{ fontFamily: "DM Sans" }}>{loading ? "—" : allNews.filter(n => n.scan_date === todayStr).length}</p>
                <p className="text-[10px] text-white/40 mt-1">ידיעות היום</p>
              </div>
              <div className="lf-stat-pill px-3 py-2.5 text-center">
                <p className="text-[22px] font-extrabold text-white leading-none" style={{ fontFamily: "DM Sans" }}>{loading ? "—" : allNews.length}</p>
                <p className="text-[10px] text-white/40 mt-1">סה״כ השבוע</p>
              </div>
              <div className="lf-stat-pill px-3 py-2.5 text-center">
                <p className="text-[13px] font-bold text-white/80 leading-none mt-0.5">{lastScan ? new Date(lastScan).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                <p className="text-[10px] text-white/40 mt-1.5">סריקה אחרונה</p>
              </div>
            </div>
            {!loading && news.length >= 3 && (
              <div className="mt-4 flex gap-2">
                <button className="flex-1 py-2.5 rounded-lg text-[13px] font-bold text-white transition-all hover:opacity-90" style={{ background: "rgba(220, 38, 38, 0.85)", backdropFilter: "blur(4px)" }} onClick={() => { setShowHero(false); handleQuickDigest(); }}>תקציר יומי מהיר</button>
                <button className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-white/80 transition-all hover:text-white" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }} onClick={() => setShowHero(false)}>בחירה ידנית</button>
              </div>
            )}
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
              <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-2.5 text-[13px]" style={{ color: "var(--lf-text-secondary)" }}>
                  <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--lf-navy)", borderTopColor: "transparent" }} />
                  טוען ידיעות...
                </div>
              </div>
            ) : allNews.length === 0 ? null : (<>
              {!showHero && news.length >= 3 && selected.size === 0 && (
                <button className="lf-btn lf-btn-dark w-full !py-2.5 text-[13px]" onClick={handleQuickDigest}>תקציר יומי מהיר — 3 מובילות</button>
              )}

              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {["היום", ...dayOrder, "הכל"].map(day => (
                  <button key={day} onClick={() => { setSelectedDay(day); setSelected(new Set()); }}
                    className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                    style={{ background: selectedDay === day ? "var(--lf-navy)" : "transparent", color: selectedDay === day ? "#fff" : "var(--lf-text-tertiary)", border: `1px solid ${selectedDay === day ? "var(--lf-navy)" : "var(--lf-border)"}` }}>
                    {day === "היום" ? `היום (${todayDay})` : day}
                  </button>
                ))}
                <span className="text-[10px] mx-0.5" style={{ color: "var(--lf-border)" }}>|</span>
                <Link href="/headlines" className="px-2.5 py-1 text-[11px] rounded-full whitespace-nowrap shrink-0 font-medium transition-colors" style={{ background: "transparent", color: "#dc2626", border: "1px solid #fecaca" }}>כותרות</Link>
                <button onClick={handleSelectAll} className="text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-gray-100 whitespace-nowrap shrink-0 mr-auto" style={{ color: "var(--lf-text-secondary)" }}>{allSelected ? "בטל הכל" : "בחר הכל"}</button>
              </div>

              {selectedDay === "הכל" ? (
                <div className="space-y-4 mt-2">
                  {dayOrder.filter(d => groupedByDay[d]?.length).map(day => (
                    <div key={day}>
                      <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 py-1" style={{ background: "var(--lf-bg)" }}>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: "var(--lf-navy)" }}>יום {day}</span>
                        <span className="text-[10px]" style={{ color: "var(--lf-text-tertiary)" }}>{groupedByDay[day].length} ידיעות</span>
                        <div className="flex-1 h-px" style={{ background: "var(--lf-border)" }} />
                      </div>
                      {groupedByDay[day].map((item, idx) => (
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
                  <p className="text-[13px]">אין ידיעות ליום {selectedDay === "היום" ? "הזה" : selectedDay}</p>
                  <button className="text-[12px] mt-2 underline" style={{ color: "var(--lf-navy)" }} onClick={() => setSelectedDay("הכל")}>הצג את כל השבוע</button>
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
            <div className="text-center">
              <p className="text-[15px] font-bold" style={{ color: "var(--lf-text)" }}>{phase === "generating-digest" ? "מייצר תקציר..." : `מייצר ${selected.size} נוסחים...`}</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--lf-text-tertiary)" }}>15-30 שניות</p>
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
              <div className="lf-card whitespace-pre-wrap text-[13px] leading-[1.7] p-5 cursor-pointer group relative" dir="rtl" onClick={() => setDigestEditing(true)}>
                {digestText}
                <span className="absolute top-2 left-2 text-[10px] opacity-0 group-hover:opacity-100 bg-gray-100 px-1.5 py-0.5 rounded" style={{ color: "var(--lf-text-tertiary)" }}>לחץ לעריכה</span>
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
                <span className="font-semibold">אנושיות: {digestHumanity.score}/10</span>
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
              <button className="lf-btn lf-btn-outline text-[11px] !py-1.5 !px-3" style={{ borderColor: "var(--lf-red)", color: "var(--lf-red)" }} disabled={digestExpandingArticle} onClick={async () => { setDigestExpandingArticle(true); try { const r = await fetch("/api/article", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newsItemId: Array.from(selected)[0] || "", fromNarrative: digestText }) }); const d = await r.json(); if (d.text) setDigestArticleText(d.text); } finally { setDigestExpandingArticle(false); } }}>{digestExpandingArticle ? "מרחיב..." : "הרחב לכתבה"}</button>
            </div>
            {digestArticleText && (
              <div className="lf-card p-4 space-y-2" style={{ borderRight: "3px solid var(--lf-red)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--lf-red)" }}>כתבה — {digestArticleText.trim().split(/\s+/).filter(Boolean).length} מילים</span>
                  <button onClick={() => setDigestArticleText(null)} className="text-[11px]" style={{ color: "var(--lf-text-tertiary)" }}>✕</button>
                </div>
                <div className="whitespace-pre-wrap text-[13px] leading-[1.7] max-h-[360px] overflow-y-auto rounded-lg p-3" style={{ background: "var(--lf-surface)" }} dir="rtl">{digestArticleText}</div>
                <div className="flex gap-1.5">
                  <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2" onClick={async () => { await navigator.clipboard.writeText(digestArticleText); }}>העתק</button>
                  <VoicePlayButton text={digestArticleText} />
                </div>
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
