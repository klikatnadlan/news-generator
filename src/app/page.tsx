"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { NewsCard } from "@/components/news-card";
import { ScanStatus } from "@/components/scan-status";
import { UsernameDialog } from "@/components/username-dialog";
import { ResultsPanel } from "@/components/results-panel";
import type { ScoredNews } from "@/lib/types";
import Link from "next/link";

type Phase = "select" | "generating" | "generating-digest" | "results" | "digest";
type NarrativePhase = "closed" | "timerange" | "loading" | "preview" | "generating" | "done";

const WORKFLOW_STEPS = [
  { num: 1, label: "סרוק חדשות" },
  { num: 2, label: "בחר ידיעות" },
  { num: 3, label: "צור נוסח" },
  { num: 4, label: "שתף בוואטסאפ" },
];

export default function HomePage() {
  const [news, setNews] = useState<ScoredNews[]>([]);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("select");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [results, setResults] = useState<
    { title: string; source: string; sourceUrl: string; text: string; newsItemId: string; textId: string }[]
  >([]);
  const [digestText, setDigestText] = useState<string>("");
  const [digestTextId, setDigestTextId] = useState<string>("");
  const [username, setUsername] = useState<string | null>(null);

  // Source filter state
  const [activeSource, setActiveSource] = useState<string | null>(null);

  // Narrative overlay state
  const [narrativePhase, setNarrativePhase] = useState<NarrativePhase>("closed");
  const [narrativeNews, setNarrativeNews] = useState<ScoredNews[]>([]);
  const [narrativeSelected, setNarrativeSelected] = useState<Set<string>>(new Set());
  const [narrativeText, setNarrativeText] = useState<string>("");
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  useEffect(() => {
    setUsername(localStorage.getItem("news-gen-username"));
  }, []);

  // Unique sources from today's feed
  const sources = useMemo(
    () => Array.from(new Set(news.map((n) => n.source).filter(Boolean))),
    [news]
  );

  // Filtered news based on active source
  const filteredNews = useMemo(
    () => (activeSource ? news.filter((n) => n.source === activeSource) : news),
    [news, activeSource]
  );

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/today");
      const data = await res.json();
      setNews(data.news || []);
      setLastScan(data.lastScan);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  // Determine current workflow step for the stepper
  const currentStep =
    phase === "results" || phase === "digest"
      ? 4
      : phase === "generating" || phase === "generating-digest"
      ? 3
      : loading
      ? 1
      : news.length === 0
      ? 1
      : 2;

  const handleSelect = (id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selected.size === filteredNews.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredNews.map((n) => n.id)));
    }
  };

  const handleBatchGenerate = async () => {
    if (selected.size === 0) return;
    setPhase("generating");
    setGenerateError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsItemIds: Array.from(selected),
          style: "regular",
        }),
      });
      const data = await res.json();

      if (data.error) {
        setGenerateError(data.error);
        setPhase("select");
        return;
      }

      const apiResults = data.results || [];

      if (apiResults.length === 0) {
        setGenerateError("לא נוצרו נוסחים. נסו שוב.");
        setPhase("select");
        return;
      }

      const mapped = apiResults.map(
        (r: { text: string; newsItemId: string; id: string }) => {
          const newsItem = news.find((n) => n.id === r.newsItemId);
          return {
            title: newsItem?.title || "",
            source: newsItem?.source || "",
            sourceUrl: newsItem?.source_url || "",
            text: r.text,
            newsItemId: r.newsItemId,
            textId: r.id || "",
          };
        }
      );
      setResults(mapped);
      setPhase("results");
    } catch {
      setGenerateError("שגיאה ביצירת הנוסחים. נסו שוב.");
      setPhase("select");
    }
  };

  const handleDigestGenerate = async () => {
    if (selected.size === 0) return;
    setPhase("generating-digest");
    setGenerateError(null);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsItemIds: Array.from(selected),
        }),
      });
      const data = await res.json();

      if (data.error) {
        setGenerateError(data.error);
        setPhase("select");
        return;
      }

      setDigestText(data.digest);
      setDigestTextId(data.textId || "");
      setPhase("digest");
    } catch {
      setGenerateError("שגיאה ביצירת הדייג'סט. נסו שוב.");
      setPhase("select");
    }
  };

  const handleRegenerate = async (
    newsItemId: string,
    style: "short" | "regular" | "commentary"
  ): Promise<{ text: string; id: string } | null> => {
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsItemIds: [newsItemId],
          style,
        }),
      });
      const data = await res.json();
      if (data.results?.[0]) {
        return { text: data.results[0].text, id: data.results[0].id || "" };
      }
    } catch {
      // ignore
    }
    return null;
  };

  const handleBackToSelect = () => {
    setPhase("select");
    setResults([]);
    setDigestText("");
    setDigestTextId("");
  };

  const fetchNarrativeNews = async (
    timeRange: "week" | "month" | "custom",
    startDate?: string,
    endDate?: string
  ) => {
    setNarrativePhase("loading");
    setNarrativeError(null);
    try {
      const params = new URLSearchParams({ timeRange });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (activeSource) params.set("source", activeSource);
      const res = await fetch(`/api/narrative?${params}`);
      const data = await res.json();
      const items: ScoredNews[] = data.news || [];
      setNarrativeNews(items);
      setNarrativeSelected(new Set(items.map((n) => n.id)));
      setNarrativePhase("preview");
    } catch {
      setNarrativeError("שגיאה בטעינת הידיעות. נסו שוב.");
      setNarrativePhase("timerange");
    }
  };

  const handleNarrativeGenerate = async () => {
    const ids = Array.from(narrativeSelected);
    if (ids.length === 0) return;
    setNarrativePhase("generating");
    setNarrativeError(null);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemIds: ids }),
      });
      const data = await res.json();
      if (data.error) {
        setNarrativeError(data.error);
        setNarrativePhase("preview");
        return;
      }
      setNarrativeText(data.digest);
      setNarrativePhase("done");
    } catch {
      setNarrativeError("שגיאה ביצירת הנרטיב. נסו שוב.");
      setNarrativePhase("preview");
    }
  };

  const closeNarrative = () => {
    setNarrativePhase("closed");
    setNarrativeNews([]);
    setNarrativeText("");
    setNarrativeError(null);
    setCustomStart("");
    setCustomEnd("");
  };

  const allSelected = filteredNews.length > 0 && selected.size === filteredNews.length;

  // One-Tap Daily: auto-select top 3 and generate digest
  const handleQuickDigest = async () => {
    const top3 = news.slice(0, 3).map((n) => n.id);
    setSelected(new Set(top3));
    setPhase("generating-digest");
    setGenerateError(null);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemIds: top3 }),
      });
      const data = await res.json();
      if (data.error) {
        setGenerateError(data.error);
        setPhase("select");
        return;
      }
      setDigestText(data.digest);
      setDigestTextId(data.textId || "");
      setPhase("digest");
    } catch {
      setGenerateError("שגיאה ביצירת הדייג'סט. נסו שוב.");
      setPhase("select");
    }
  };

  return (
    <main className="min-h-screen bg-background" dir="rtl">
      <UsernameDialog />

      {/* Header */}
      <header
        className="border-b shadow-sm"
        style={{ borderBottomColor: "#1d3557", borderBottomWidth: "3px" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#1d3557" }}>
              מחולל כותרות ופרשנות יומי
            </h1>
            <p className="text-sm text-muted-foreground">קליקת הנדל״ן</p>
          </div>
          <div className="flex items-center gap-3">
            {username && (
              <span className="text-sm text-muted-foreground">
                שלום, <strong>{username}</strong>
              </span>
            )}
            <Link
              href="/history"
              className="text-sm hover:underline"
              style={{ color: "#1d3557" }}
            >
              היסטוריה
            </Link>
          </div>
        </div>
      </header>

      {/* Workflow Steps */}
      <div className="max-w-2xl mx-auto px-4 mt-4">
        <div className="flex items-center justify-between gap-1 text-xs sm:text-sm">
          {WORKFLOW_STEPS.map((step, i) => (
            <div key={step.num} className="flex items-center gap-1">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                  currentStep >= step.num
                    ? "text-white"
                    : "bg-muted text-muted-foreground"
                }`}
                style={
                  currentStep >= step.num
                    ? { backgroundColor: "#1d3557" }
                    : undefined
                }
              >
                {currentStep > step.num ? "✓" : step.num}
              </span>
              <span
                className={
                  currentStep >= step.num
                    ? "font-medium"
                    : "text-muted-foreground"
                }
              >
                {step.label}
              </span>
              {i < WORKFLOW_STEPS.length - 1 && (
                <span className="mx-1 text-muted-foreground hidden sm:inline">
                  &rarr;
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 mt-4">
        {/* === PHASE: SELECT === */}
        {phase === "select" && (
          <>
            <ScanStatus
              lastScan={lastScan}
              onScanComplete={fetchNews}
              hasNews={news.length > 0}
            />

            {/* Error message from failed generation */}
            {generateError && (
              <div
                className="mt-3 rounded-lg p-3 text-center text-sm font-medium"
                style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}
              >
                {generateError}
              </div>
            )}

            <div
              className={`mt-4 space-y-3 ${
                selected.size > 0 ? "pb-28" : "pb-8"
              }`}
            >
              {loading ? (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="text-4xl mb-3 animate-pulse">📡</div>
                  <p className="text-lg">טוען חדשות...</p>
                </div>
              ) : news.length === 0 ? (
                /* Empty state handled by ScanStatus */
                null
              ) : (
                <>
                  {/* Quick digest button */}
                  {news.length >= 3 && selected.size === 0 && (
                    <Button
                      className="w-full shadow-md font-bold text-base py-5"
                      size="lg"
                      onClick={handleQuickDigest}
                      style={{ backgroundColor: "#1d3557" }}
                    >
                      ⚡ דייג&apos;סט יומי מהיר (Top 3)
                    </Button>
                  )}

                  {/* Source filter buttons + Narrative button */}
                  {sources.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-wrap">
                      <button
                        onClick={() => setActiveSource(null)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors shrink-0"
                        style={
                          !activeSource
                            ? { backgroundColor: "#1d3557", color: "white", borderColor: "#1d3557" }
                            : { borderColor: "#ccc", color: "#555", backgroundColor: "white" }
                        }
                      >
                        הכל ({news.length})
                      </button>
                      {sources.map((src) => {
                        const isActive = activeSource === src;
                        const count = news.filter((n) => n.source === src).length;
                        return (
                          <button
                            key={src}
                            onClick={() => setActiveSource(isActive ? null : src)}
                            className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors shrink-0"
                            style={
                              isActive
                                ? { backgroundColor: "#1d3557", color: "white", borderColor: "#1d3557" }
                                : { borderColor: "#ccc", color: "#555", backgroundColor: "white" }
                            }
                          >
                            {src} ({count})
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setNarrativePhase("timerange")}
                        className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors shrink-0 mr-auto"
                        style={{ borderColor: "#7c3aed", color: "#7c3aed", backgroundColor: "#faf5ff" }}
                      >
                        📊 נרטיב{activeSource ? ` (${activeSource})` : ""}
                      </button>
                    </div>
                  )}

                  {/* Instruction bar with select all */}
                  <div
                    className="rounded-lg p-3"
                    style={{ backgroundColor: "#f0f4ff", color: "#1d3557" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          סמנו ידיעות ולחצו על הכפתור למטה
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {filteredNews.length} ידיעות
                          {activeSource ? ` מ${activeSource}` : " נמצאו"}
                          {selected.size > 0 &&
                            ` · ${selected.size} נבחרו`}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                        className="text-xs shrink-0"
                        style={{ borderColor: "#1d3557", color: "#1d3557" }}
                      >
                        {allSelected ? "בטל הכל" : "בחר הכל"}
                      </Button>
                    </div>
                  </div>

                  {filteredNews.map((item) => (
                    <NewsCard
                      key={item.id}
                      news={item}
                      selected={selected.has(item.id)}
                      onSelect={handleSelect}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Floating action buttons */}
            {selected.size > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-50">
                <div className="max-w-2xl mx-auto px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent space-y-2">
                  <Button
                    className="w-full shadow-lg text-white font-bold text-base py-6"
                    size="lg"
                    onClick={handleBatchGenerate}
                    style={{ backgroundColor: "#e63946" }}
                  >
                    צור נוסח נפרד ל-{selected.size} ידיעות
                  </Button>
                  {selected.size >= 2 && (
                    <Button
                      className="w-full shadow-md font-bold text-sm py-4"
                      size="lg"
                      variant="outline"
                      onClick={handleDigestGenerate}
                      style={{ borderColor: "#1d3557", color: "#1d3557" }}
                    >
                      📌 צור דייג'סט יומי מאוחד ({selected.size} ידיעות)
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* === PHASE: GENERATING / GENERATING-DIGEST === */}
        {(phase === "generating" || phase === "generating-digest") && (
          <div className="text-center py-20 space-y-4">
            <div className="text-5xl animate-bounce">⚡</div>
            <p className="text-xl font-bold" style={{ color: "#1d3557" }}>
              {phase === "generating-digest"
                ? "מייצר דייג'סט יומי מאוחד..."
                : `מייצר ${selected.size} נוסחים במקביל...`}
            </p>
            <p className="text-muted-foreground">
              Claude כותב בקול של בן סולומון. זה לוקח 15-30 שניות.
            </p>
            <div className="flex justify-center mt-4">
              <div
                className="h-2 w-48 rounded-full overflow-hidden"
                style={{ backgroundColor: "#e5e7eb" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: "#1d3557",
                    width: "70%",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              הנוסחים יופיעו כאן ברגע שיהיו מוכנים
            </p>
          </div>
        )}

        {/* === PHASE: RESULTS === */}
        {phase === "results" && (
          <div className="mt-4 pb-8">
            <ResultsPanel
              results={results}
              onBack={handleBackToSelect}
              onRegenerate={handleRegenerate}
            />
          </div>
        )}

        {/* === PHASE: DIGEST === */}
        {phase === "digest" && (
          <div className="mt-4 pb-8 space-y-4">
            {/* Digest header */}
            <div
              className="rounded-lg p-4 border-2"
              style={{ backgroundColor: "#f0f7f0", borderColor: "#2d8a4e" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">📌</span>
                <span className="font-bold text-lg" style={{ color: "#1d3557" }}>
                  דייג'סט יומי מוכן!
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 mr-9">
                הודעה אחת שלמה, מוכנה להעתקה ושיתוף בוואטסאפ
              </p>
            </div>

            {/* Digest text */}
            <div
              className="whitespace-pre-wrap text-sm leading-relaxed rounded-lg p-5 border"
              style={{ backgroundColor: "#fafafa", minHeight: "200px" }}
              dir="rtl"
            >
              {digestText}
            </div>

            {/* Digest actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(digestText);
                }}
              >
                📋 העתק דייג'סט
              </Button>
              <Button
                size="sm"
                className="text-white"
                style={{ backgroundColor: "#25D366" }}
                onClick={() => {
                  const encoded = encodeURIComponent(digestText);
                  window.open(`https://wa.me/?text=${encoded}`, "_blank");
                }}
              >
                📱 שתף בוואטסאפ
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDigestGenerate}
              >
                🔄 נסח מחדש
              </Button>
            </div>

            {/* Back button */}
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="lg"
                onClick={handleBackToSelect}
                className="font-medium"
                style={{ borderColor: "#1d3557", color: "#1d3557" }}
              >
                ← חזרה לבחירת ידיעות
              </Button>
            </div>
          </div>
        )}
        {/* === Coming Soon Features === */}
        {phase === "select" && news.length > 0 && (
          <div className="mt-6 mb-8">
            <div
              className="rounded-lg p-4 border"
              style={{ backgroundColor: "#f8f9fa", borderColor: "#e5e7eb" }}
            >
              <p className="text-sm font-bold mb-3" style={{ color: "#1d3557" }}>
                🚀 בקרוב
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md p-2.5 text-xs text-center border opacity-60" style={{ backgroundColor: "#fff" }}>
                  🤖 שליחה ישירה לוואטסאפ
                </div>
                <div className="rounded-md p-2.5 text-xs text-center border opacity-60" style={{ backgroundColor: "#fff" }}>
                  🎙️ הקלטה → טקסט מוכן
                </div>
                <div className="rounded-md p-2.5 text-xs text-center border opacity-60" style={{ backgroundColor: "#fff" }}>
                  ⚙️ Pipeline אוטומטי יומי
                </div>
                <div className="rounded-md p-2.5 text-xs text-center border opacity-60" style={{ backgroundColor: "#fff" }}>
                  📊 A/B Testing
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* === NARRATIVE OVERLAY === */}
      {narrativePhase !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeNarrative(); }}
        >
          <div
            className="relative flex flex-col bg-white w-full max-w-2xl mx-auto mt-auto rounded-t-2xl overflow-hidden"
            style={{ maxHeight: "90vh" }}
            dir="rtl"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b shrink-0"
              style={{ borderColor: "#7c3aed" }}
            >
              <div>
                <span className="font-bold text-base" style={{ color: "#7c3aed" }}>
                  📊 נרטיב{activeSource ? ` — ${activeSource}` : ""}
                </span>
                {narrativePhase === "preview" && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {narrativeNews.length} ידיעות נבחרו · לחצו על כרטיס לביטול בחירה
                  </p>
                )}
              </div>
              <button
                onClick={closeNarrative}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">

              {/* Step 1: Time range picker */}
              {narrativePhase === "timerange" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium" style={{ color: "#1d3557" }}>
                    בחרו טווח זמן לנרטיב:
                  </p>
                  {narrativeError && (
                    <div className="rounded-md p-3 text-sm" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>
                      {narrativeError}
                    </div>
                  )}
                  {[
                    { key: "week", label: "📅 שבוע אחרון", desc: "7 ימים אחורה" },
                    { key: "month", label: "📅 חודש אחרון", desc: "30 ימים אחורה" },
                  ].map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => fetchNarrativeNews(key as "week" | "month")}
                      className="w-full text-right rounded-xl border-2 p-4 transition-all hover:shadow-md"
                      style={{ borderColor: "#7c3aed" }}
                    >
                      <div className="font-bold" style={{ color: "#7c3aed" }}>{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                    </button>
                  ))}
                  {/* Custom range */}
                  <div className="rounded-xl border-2 p-4" style={{ borderColor: "#e5e7eb" }}>
                    <p className="font-bold text-sm mb-3" style={{ color: "#1d3557" }}>📅 טווח מותאם</p>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">מתאריך</label>
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="w-full mt-1 border rounded-md px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">עד תאריך</label>
                        <input
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="w-full mt-1 border rounded-md px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full mt-3 text-white"
                      size="sm"
                      disabled={!customStart || !customEnd}
                      onClick={() => fetchNarrativeNews("custom", customStart, customEnd)}
                      style={{ backgroundColor: "#7c3aed" }}
                    >
                      טען ידיעות
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Loading */}
              {narrativePhase === "loading" && (
                <div className="text-center py-16 space-y-3">
                  <div className="text-4xl animate-pulse">📊</div>
                  <p className="font-bold" style={{ color: "#7c3aed" }}>טוען ידיעות...</p>
                </div>
              )}

              {/* Step 3: Preview articles as regular feed */}
              {narrativePhase === "preview" && (
                <div className="space-y-3">
                  {narrativeError && (
                    <div className="rounded-md p-3 text-sm" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>
                      {narrativeError}
                    </div>
                  )}
                  {narrativeNews.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>לא נמצאו ידיעות בטווח הזמן הזה.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setNarrativePhase("timerange")}
                      >
                        חזרה לבחירת טווח
                      </Button>
                    </div>
                  ) : (
                    narrativeNews.map((item) => (
                      <NewsCard
                        key={item.id}
                        news={item}
                        selected={narrativeSelected.has(item.id)}
                        onSelect={(id, isSelected) => {
                          setNarrativeSelected((prev) => {
                            const next = new Set(prev);
                            if (isSelected) next.add(id);
                            else next.delete(id);
                            return next;
                          });
                        }}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Step 4: Generating narrative */}
              {narrativePhase === "generating" && (
                <div className="text-center py-16 space-y-3">
                  <div className="text-4xl animate-bounce">✍️</div>
                  <p className="font-bold text-lg" style={{ color: "#7c3aed" }}>
                    בונה נרטיב מ-{narrativeSelected.size} ידיעות...
                  </p>
                  <p className="text-sm text-muted-foreground">Claude מנתח ומסכם את הסיפורים החשובים</p>
                </div>
              )}

              {/* Step 5: Narrative result */}
              {narrativePhase === "done" && (
                <div className="space-y-4">
                  <div
                    className="rounded-lg p-4 border-2"
                    style={{ backgroundColor: "#faf5ff", borderColor: "#7c3aed" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">📊</span>
                      <span className="font-bold text-lg" style={{ color: "#7c3aed" }}>
                        הנרטיב מוכן!
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 mr-9">
                      {activeSource ? `נרטיב ${activeSource} ·` : ""} מבוסס על {narrativeSelected.size} ידיעות
                    </p>
                  </div>

                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed rounded-lg p-5 border"
                    style={{ backgroundColor: "#fafafa", minHeight: "160px" }}
                    dir="rtl"
                  >
                    {narrativeText}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => { await navigator.clipboard.writeText(narrativeText); }}
                    >
                      📋 העתק נרטיב
                    </Button>
                    <Button
                      size="sm"
                      className="text-white"
                      style={{ backgroundColor: "#25D366" }}
                      onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(narrativeText)}`, "_blank")}
                    >
                      📱 שתף בוואטסאפ
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNarrativePhase("preview")}
                    >
                      🔄 שנה בחירה
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer: generate button when in preview */}
            {narrativePhase === "preview" && narrativeSelected.size > 0 && (
              <div className="shrink-0 px-4 pb-5 pt-3 border-t" style={{ borderColor: "#e5e7eb" }}>
                <Button
                  className="w-full font-bold text-white py-5"
                  size="lg"
                  onClick={handleNarrativeGenerate}
                  style={{ backgroundColor: "#7c3aed" }}
                >
                  📊 בנה נרטיב מ-{narrativeSelected.size} ידיעות
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
