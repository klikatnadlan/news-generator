"use client";

import { useState, useEffect } from "react";
import { SiteNav } from "@/components/site-nav";
import Link from "next/link";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  score: number;
}

export default function DashboardPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [marketIndex, setMarketIndex] = useState<{
    index: number;
    trend: string;
    summary: string;
    movingAvg?: number;
    range?: { min: number; max: number };
  } | null>(null);
  const [isEmptyDay, setIsEmptyDay] = useState(false);
  const [emptyDayMessage, setEmptyDayMessage] = useState("");
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/news/today").then((r) => r.json()),
      fetch("/api/market-index").then((r) => r.json()),
    ])
      .then(([newsData, indexData]) => {
        setNews(newsData.news || []);
        setLastScan(newsData.lastScan);
        setIsEmptyDay(newsData.isEmptyDay || false);
        setEmptyDayMessage(newsData.emptyDayMessage || "");
        setMarketIndex(indexData);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleGenerateAll = async () => {
    if (news.length === 0) return;
    setGenerating(true);
    setGenError(null);
    try {
      const topIds = news.slice(0, 3).map((n) => n.id);
      const [digestRes, genRes] = await Promise.all([
        fetch("/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newsItemIds: topIds }) }),
        fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newsItemIds: topIds, style: "regular" }) }),
      ]);
      if (!digestRes.ok || !genRes.ok) {
        const which = !digestRes.ok ? "התקציר" : "הנוסחים";
        setGenError(`לא הצלחנו לייצר את ${which}. נסה שוב, או חזור למסך הראשי.`);
        return;
      }
      setGenerated(true);
    } catch {
      setGenError("הרשת קרסה באמצע. בדוק חיבור ונסה שוב.");
    } finally {
      setGenerating(false);
    }
  };

  const resetGenerate = () => {
    setGenerated(false);
    setGenError(null);
  };

  const getVerbal = (idx: number) => {
    if (idx >= 75) return { label: "אופטימי", color: "#059669" };
    if (idx >= 55) return { label: "חיובי", color: "#d97706" };
    if (idx >= 40) return { label: "מעורב", color: "#ea580c" };
    if (idx >= 25) return { label: "סוער", color: "#dc2626" };
    return { label: "חששות", color: "#374151" };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#dc2626", borderTopColor: "transparent" }} />
          <p className="text-[13px]" style={{ color: "#6b7280" }}>טוען נתוני יום ומדד אמון השוק…</p>
        </div>
      </div>
    );
  }

  const verbal = marketIndex ? getVerbal(marketIndex.movingAvg || marketIndex.index) : null;
  const indexVal = marketIndex ? (marketIndex.movingAvg || marketIndex.index) : 0;

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      {/* Header */}
      <SiteNav />

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Market Index */}
        {marketIndex && verbal && (
          <div className="lf-card p-5 mb-4" style={{ borderRight: `3px solid ${verbal.color}` }}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-[13px] font-bold" style={{ color: "#0f1419" }}>מד אמון השוק</p>
                  <span
                    className="text-[10px] text-white font-bold rounded-full w-4 h-4 inline-flex items-center justify-center cursor-help"
                    style={{ background: "#9ca3af" }}
                    title="ציון 0–100 שמסכם את הטון של כתבות הנדל״ן השבוע. 75+ = אופטימי, 55–74 = חיובי, 40–54 = מעורב, 25–39 = סוער, 0–24 = חששות. עדכון יומי."
                  >?</span>
                </div>
                <p className="text-[12px] leading-[1.5] mb-1" style={{ color: "#6b7280" }}>{marketIndex.summary}</p>
                {marketIndex.range && (
                  <p className="text-[11px]" style={{ color: "#9ca3af" }}>טווח שבועי: {marketIndex.range.min}–{marketIndex.range.max}</p>
                )}
                <p className="text-[10px] mt-1" style={{ color: "#d1d5db" }}>מבוסס ניתוח NLP על כתבות השבוע · לא המלצת השקעה</p>
              </div>
              <div className="text-center mr-4">
                <div className="text-[36px] font-extrabold leading-none" style={{ color: verbal.color, fontFamily: "DM Sans, system-ui" }}>
                  {indexVal}
                </div>
                <div className="text-[13px] font-bold mt-0.5" style={{ color: verbal.color }}>
                  {verbal.label}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="lf-card p-3.5">
            <p className="text-[11px] mb-0.5" style={{ color: "#9ca3af" }}>ידיעות היום</p>
            <p className="text-[24px] font-extrabold leading-none" style={{ color: "#0f1419", fontFamily: "DM Sans" }}>{news.length}</p>
          </div>
          <div className="lf-card p-3.5">
            <p className="text-[11px] mb-0.5" style={{ color: "#9ca3af" }}>סריקה אחרונה</p>
            <p className="text-[14px] font-bold" style={{ color: "#0f1419" }}>
              {lastScan ? new Date(lastScan).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>
          </div>
        </div>

        {/* Empty day */}
        {isEmptyDay && (
          <div className="lf-card p-4 mb-4" style={{ borderRight: "3px solid #d97706", background: "#fffbeb" }}>
            <p className="text-[13px] font-semibold" style={{ color: "#92400e" }}>{emptyDayMessage}</p>
          </div>
        )}

        {/* Top news */}
        {news.length > 0 && (
          <div className="space-y-2 mb-5">
            <p className="text-[12px] font-semibold mb-1" style={{ color: "#9ca3af" }}>ידיעות מובילות</p>
            {news.slice(0, 3).map((item) => {
              const scoreColor = item.score >= 80 ? "#059669" : item.score >= 60 ? "#d97706" : "#dc2626";
              return (
                <div key={item.id} className="lf-card p-3 flex items-center gap-3">
                  <span className="text-[16px] font-extrabold shrink-0 w-8 text-center" style={{ color: scoreColor, fontFamily: "DM Sans" }}>
                    {item.score}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold leading-[1.4]" style={{ color: "#0f1419" }}>{item.title}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Generate All */}
        {news.length > 0 && !generated && (
          <>
            <button
              className="lf-btn w-full !py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
              style={{ background: "#dc2626" }}
              onClick={handleGenerateAll}
              disabled={generating}
            >
              {generating ? "מייצר תקציר + נוסחים..." : "✨ צור הכל בלחיצה אחת"}
            </button>
            <p className="text-[11px] text-center mt-2" style={{ color: "#9ca3af" }}>
              ייצור תקציר יומי + 3 נוסחי וואטסאפ מהידיעות המובילות. ~30 שניות.
            </p>
            {genError && (
              <div className="mt-3 rounded-lg p-3 text-center text-[12px]" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                {genError}
              </div>
            )}
          </>
        )}

        {generated && (
          <div className="space-y-3">
            <div className="lf-card p-4 text-center" style={{ borderRight: "3px solid #059669" }}>
              <p className="text-[14px] font-bold" style={{ color: "#059669" }}>✓ הכל מוכן!</p>
              <p className="text-[12px]" style={{ color: "#9ca3af" }}>תקציר + 3 נוסחי וואטסאפ נשמרו בהיסטוריה</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={resetGenerate} className="lf-btn lf-btn-outline w-full !py-2.5 text-[13px]">
                🔄 צור שוב
              </button>
              <Link href="/history">
                <button className="lf-btn lf-btn-dark w-full !py-2.5 text-[13px]">
                  📋 לראות בהיסטוריה
                </button>
              </Link>
            </div>
            <Link href="/" className="block">
              <button className="lf-btn lf-btn-outline w-full !py-2 text-[12px]">← חזרה למסך הראשי</button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
