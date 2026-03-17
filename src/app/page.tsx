"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { NewsCard } from "@/components/news-card";
import { ScanStatus } from "@/components/scan-status";
import { UsernameDialog } from "@/components/username-dialog";
import { ResultsPanel } from "@/components/results-panel";
import type { ScoredNews } from "@/lib/types";
import Link from "next/link";

type Phase = "select" | "generating" | "generating-digest" | "results" | "digest";

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
    { title: string; text: string; newsItemId: string; textId: string }[]
  >([]);
  const [digestText, setDigestText] = useState<string>("");
  const [digestTextId, setDigestTextId] = useState<string>("");
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(localStorage.getItem("news-gen-username"));
  }, []);

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
    if (selected.size === news.length) {
      // Deselect all
      setSelected(new Set());
    } else {
      // Select all
      setSelected(new Set(news.map((n) => n.id)));
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

  const allSelected = news.length > 0 && selected.size === news.length;

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
                          {news.length} ידיעות נמצאו
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

                  {news.map((item) => (
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
      </div>
    </main>
  );
}
