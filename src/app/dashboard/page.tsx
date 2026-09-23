"use client";

import { useState, useEffect } from "react";
import { SiteNav } from "@/components/site-nav";
import Link from "next/link";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  score: number;
  // The API already returned these; the card just never asked for them, so the
  // strip was three unreadable, unclickable headlines.
  summary?: string | null;
  source_url?: string | null;
}

export default function DashboardPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  // מד אמון השוק is now arithmetic over the tone the morning scoring marks on
  // each story (lib/market-tone). It refreshes itself, so there is no compute
  // button any more, and every number on the card can be traced to stories.
  const [marketIndex, setMarketIndex] = useState<{
    index: number | null;
    collecting?: boolean;
    collected?: number;
    minStories?: number;
    summary?: string;
    counts?: { positive: number; negative: number; neutral: number; total: number };
    /** The same index for the seven days before this window. */
    previous?: number | null;
    trend?: string | null;
    topPositive?: { title: string; url: string | null } | null;
    topNegative?: { title: string; url: string | null } | null;
    /** Newest day with data — may be yesterday before the morning scan. */
    date?: string | null;
    stale?: boolean;
  } | null>(null);
  // The day's true story count. `news` is only the top six shown below, so
  // rendering news.length as "ידיעות היום" understated the day (6 vs the home
  // page's 17 for the same date).
  const [todayCount, setTodayCount] = useState<number | null>(null);
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
        setTodayCount(typeof newsData.count === "number" ? newsData.count : null);
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

  const hasIndex = !!marketIndex && typeof marketIndex.index === "number";
  const verbal = hasIndex ? getVerbal(marketIndex!.index as number) : null;
  const indexVal = hasIndex ? (marketIndex!.index as number) : 0;
  const indexDateLabel = marketIndex?.date
    ? new Date(marketIndex.date + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })
    : "";
  const trendArrow = marketIndex?.trend === "עולה" ? "▲" : marketIndex?.trend === "יורד" ? "▼" : "";

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      {/* Header */}
      <SiteNav />

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Market Index */}
        {marketIndex && hasIndex && verbal && (
          <div className="lf-card p-5 mb-4" style={{ borderRight: `3px solid ${verbal.color}` }}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-[13px] font-bold" style={{ color: "#0f1419" }}>מד אמון השוק</p>
                  <span
                    className="text-[10px] text-white font-bold rounded-full w-4 h-4 inline-flex items-center justify-center cursor-help"
                    style={{ background: "#9ca3af" }}
                    title="כל בוקר כל ידיעת נדל״ן שנכנסת לפיד מסומנת: מחזקת את האמון בשוק, מחלישה אותו, או ניטרלית. המדד הוא המאזן של שבעת הימים האחרונים, מ-0 (הכל שלילי) עד 100 (הכל חיובי), ו-50 כשהכל ניטרלי. 75+ = אופטימי, 55–74 = חיובי, 40–54 = מעורב, 25–39 = סוער, 0–24 = חששות."
                  >?</span>
                </div>
                <p className="text-[12px] leading-[1.5] mb-1" style={{ color: "#6b7280" }}>{marketIndex.summary}</p>
                {typeof marketIndex.previous === "number" && (
                  <p className="text-[11px]" style={{ color: "#9ca3af" }}>
                    לפני שבוע: {marketIndex.previous} {trendArrow}
                  </p>
                )}
                {/* The two stories that pull hardest each way — what makes the
                    number explainable rather than just a number. */}
                {marketIndex.topNegative && (
                  <p className="text-[11px] mt-1 truncate" style={{ color: "#6b7280" }} title={marketIndex.topNegative.title}>
                    <span style={{ color: "#dc2626" }}>▼</span>{" "}
                    {marketIndex.topNegative.url ? (
                      <a href={marketIndex.topNegative.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{marketIndex.topNegative.title}</a>
                    ) : marketIndex.topNegative.title}
                  </p>
                )}
                {marketIndex.topPositive && (
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: "#6b7280" }} title={marketIndex.topPositive.title}>
                    <span style={{ color: "#059669" }}>▲</span>{" "}
                    {marketIndex.topPositive.url ? (
                      <a href={marketIndex.topPositive.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{marketIndex.topPositive.title}</a>
                    ) : marketIndex.topPositive.title}
                  </p>
                )}
                <p className="text-[10px] mt-1.5" style={{ color: "#9ca3af" }}>
                  {indexDateLabel ? `נכון ל-${indexDateLabel} · ` : ""}שבעת הימים האחרונים · לא המלצת השקעה
                </p>
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

        {/* Not enough stories in the window yet: say how many there are rather
            than print a number built on three headlines. */}
        {marketIndex && !hasIndex && (
          <div className="lf-card p-4 mb-4">
            <p className="text-[13px] font-bold" style={{ color: "#0f1419" }}>מד אמון השוק</p>
            <p className="text-[12px] leading-[1.5]" style={{ color: "#6b7280" }}>
              המדד נאסף מהטון של ידיעות הנדל״ן. עד עכשיו {marketIndex.collected ?? 0} ידיעות, והמספר יופיע כשיהיו {marketIndex.minStories ?? 15}. זה מתעדכן לבד כל בוקר.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="lf-card p-3.5">
            <p className="text-[11px] mb-0.5" style={{ color: "#9ca3af" }}>ידיעות היום</p>
            <p className="text-[24px] font-extrabold leading-none" style={{ color: "#0f1419", fontFamily: "DM Sans" }}>{todayCount ?? news.length}</p>
          </div>
          <div className="lf-card p-3.5">
            <p className="text-[11px] mb-0.5" style={{ color: "#9ca3af" }}>סריקה אחרונה</p>
            <p className="text-[14px] font-bold" style={{ color: "#0f1419" }}>
              {lastScan ? new Date(lastScan).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }) : "—"}
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
              // The card is a link when we have somewhere to go, and a plain box
              // when we don't. A card that looks clickable and isn't is worse
              // than one that never invited the click.
              const Card = item.source_url ? "a" : "div";
              const linkProps = item.source_url
                ? { href: item.source_url, target: "_blank", rel: "noopener noreferrer" }
                : {};
              return (
                <Card
                  key={item.id}
                  {...linkProps}
                  className={`lf-card p-3 flex items-start gap-3 ${item.source_url ? "block transition-shadow hover:shadow-md" : ""}`}
                >
                  <span className="text-[16px] font-extrabold shrink-0 w-8 text-center pt-0.5" style={{ color: scoreColor, fontFamily: "DM Sans" }}>
                    {item.score}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold leading-[1.4]" style={{ color: "#0f1419" }}>{item.title}</p>
                    {item.summary && (
                      <p className="text-[12px] leading-[1.5] mt-1 lf-clamp-2" style={{ color: "#6b7280" }}>
                        {item.summary}
                      </p>
                    )}
                    <p className="text-[10px] mt-1.5" style={{ color: "#9ca3af" }}>
                      {item.source}{item.source_url ? " · לכתבה המלאה ↗" : ""}
                    </p>
                  </div>
                </Card>
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
              <p className="text-[12px]" style={{ color: "#9ca3af" }}>תקציר + 3 נוסחי וואטסאפ נשמרו במעבדה</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={resetGenerate} className="lf-btn lf-btn-outline w-full !py-2.5 text-[13px]">
                🔄 צור שוב
              </button>
              <Link href="/history">
                <button className="lf-btn lf-btn-dark w-full !py-2.5 text-[13px]">
                  📋 לראות במעבדה
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
