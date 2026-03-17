"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { NewsCard } from "@/components/news-card";
import { ScanStatus } from "@/components/scan-status";
import { UsernameDialog } from "@/components/username-dialog";
import type { ScoredNews } from "@/lib/types";
import Link from "next/link";

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
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchResults, setBatchResults] = useState<
    { title: string; text: string }[] | null
  >(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [combinedCopyLabel, setCombinedCopyLabel] = useState("📋 העתק הכל");

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

  // Determine current workflow step
  const currentStep = loading
    ? 1
    : news.length === 0
    ? 1
    : selected.size === 0
    ? 2
    : batchResults
    ? 4
    : 3;

  const handleSelect = (id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBatchGenerate = async () => {
    if (selected.size === 0) return;
    setBatchGenerating(true);
    setBatchMessage(null);
    setBatchResults(null);
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
      const results = data.results || [];
      setBatchMessage(`נוצרו ${results.length} נוסחים בהצלחה`);

      // Map results with titles
      const mapped = results.map(
        (r: { text: string; newsItemId: string }) => {
          const newsItem = news.find((n) => n.id === r.newsItemId);
          return { title: newsItem?.title || "", text: r.text };
        }
      );
      setBatchResults(mapped);
    } finally {
      setBatchGenerating(false);
    }
  };

  const handleCopyCombined = async () => {
    if (!batchResults) return;
    const combined = batchResults.map((r) => r.text).join("\n\n~~~~~~~~\n\n");
    await navigator.clipboard.writeText(combined);
    setCombinedCopyLabel("✓ הועתק!");
    setTimeout(() => setCombinedCopyLabel("📋 העתק הכל"), 2000);
  };

  return (
    <main className="min-h-screen bg-background" dir="rtl">
      <UsernameDialog />

      {/* Header */}
      <header
        className="border-b"
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
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
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
                {step.num}
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
        <ScanStatus
          lastScan={lastScan}
          onScanComplete={fetchNews}
          hasNews={news.length > 0}
        />

        <div
          className={`mt-4 space-y-4 ${
            selected.size > 0 ? "pb-24" : "pb-8"
          }`}
        >
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">
              <div className="text-3xl mb-3">🔄</div>
              <p>טוען חדשות...</p>
            </div>
          ) : news.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="text-3xl">📰</div>
              <p className="text-muted-foreground text-lg">
                אין חדשות מומלצות היום
              </p>
              <p className="text-muted-foreground text-sm">
                לחץ על ״סרוק עכשיו״ כדי לחפש חדשות חדשות.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {news.length} ידיעות נמצאו &middot;{" "}
                {selected.size > 0
                  ? `${selected.size} נבחרו`
                  : "בחר ידיעות ליצירת נוסח"}
              </p>
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

          {/* Batch success message */}
          {batchMessage && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium text-center">
              {batchMessage}
            </div>
          )}

          {/* Combined preview */}
          {batchResults && batchResults.length > 0 && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">תצוגה מקדימה משולבת</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyCombined}
                >
                  {combinedCopyLabel}
                </Button>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed border rounded-md p-3 bg-background max-h-[400px] overflow-y-auto">
                {batchResults.map((r, i) => (
                  <div key={i}>
                    {i > 0 && (
                      <div className="text-center text-muted-foreground my-3">
                        ~~~~~~~~
                      </div>
                    )}
                    {r.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating batch button */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto z-50">
          <Button
            className="w-full shadow-lg"
            size="lg"
            onClick={handleBatchGenerate}
            disabled={batchGenerating}
          >
            {batchGenerating
              ? "מייצר..."
              : `צור נוסח ל-${selected.size} ידיעות שנבחרו`}
          </Button>
        </div>
      )}
    </main>
  );
}
