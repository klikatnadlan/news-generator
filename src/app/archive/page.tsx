"use client";

import { useState, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { VoicePlayButton } from "@/components/voice-play-button";
import { SiteNav } from "@/components/site-nav";
import { NewsCard } from "@/components/news-card";
import type { ScoredNews } from "@/lib/types";
import Link from "next/link";

interface ArchiveItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  created_at: string;
  score: number | null;
  scan_date: string | null;
}

interface SearchResult {
  items: ArchiveItem[];
  total: number;
  page: number;
  totalPages: number;
}

function getSourceName(source: string): string {
  if (!source) return "";
  const s = source.toLowerCase();
  if (s.includes("globes") || s.includes("גלובס")) return "גלובס";
  if (s.includes("calcalist") || s.includes("כלכליסט")) return "כלכליסט";
  if (s.includes("themarker") || s.includes("דה מרקר")) return "דה מרקר";
  if (s.includes("ynet")) return "ynet";
  if (s.includes("maariv") || s.includes("מעריב")) return "מעריב";
  if (s.includes("walla") || s.includes("וואלה")) return "וואלה";
  if (s.includes("bizportal")) return "bizportal";
  if (s.includes("madlan") || s.includes("מדלן")) return "מדלן";
  if (s.includes("ice")) return "ICE";
  if (s.includes("nadlancenter") || s.includes("מרכז הנדל")) return 'מרכז הנדל"ן';
  try { return new URL(source).hostname.replace("www.", ""); } catch { return source.slice(0, 20); }
}

function getSourceColor(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("globes") || s.includes("גלובס")) return "#0066cc";
  if (s.includes("calcalist") || s.includes("כלכליסט")) return "#c0392b";
  if (s.includes("themarker") || s.includes("דה מרקר")) return "#16a34a";
  if (s.includes("ynet")) return "#dc2626";
  if (s.includes("maariv") || s.includes("מעריב")) return "#1e3a5f";
  if (s.includes("walla") || s.includes("וואלה")) return "#0284c7";
  if (s.includes("ice")) return "#0ea5e9";
  if (s.includes("nadlancenter") || s.includes("מרכז הנדל")) return "#7c3aed";
  return "#6b7280";
}

export default function ArchivePage() {
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryType, setSummaryType] = useState<"weekly" | "monthly" | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [archiveArticle, setArchiveArticle] = useState("");
  const [articleLoading, setArticleLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Render search results with the full NewsCard (same card as the home feed):
  // expandable subtitle, העתק תכלס, צור הודעה/כתבה, 📖 קרא כאן, 🌐 פתח כאתר, 🧠 סכם באז.
  const toScored = (it: ArchiveItem): ScoredNews => ({
    ...it,
    source_url: it.url || "",
    published_at: it.scan_date || it.created_at || null,
    score: it.score ?? null,
    reasoning: "",
  } as unknown as ScoredNews);

  const toggleSelect = (id: string, sel: boolean) => {
    setSelectedIds((prev) => { const n = new Set(prev); if (sel) n.add(id); else n.delete(id); return n; });
  };

  // Exclusive time buckets (like the cities feed): רבעון = 0-3 חודשים,
  // חצי שנה = 3-6, שנה = 6-12; the date inputs are the custom סנן (כל הזמנים =
  // both empty). Default: last quarter — freshest = most relevant.
  type ArchRange = "quarter" | "half" | "year" | "custom";
  const [archRange, setArchRange] = useState<ArchRange>("quarter");
  const monthsAgoIso = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };
  const rangeWindow = (r: ArchRange): { from: string; to: string } => {
    if (r === "quarter") return { from: monthsAgoIso(3), to: "" };
    if (r === "half") return { from: monthsAgoIso(6), to: monthsAgoIso(3) };
    if (r === "year") return { from: monthsAgoIso(12), to: monthsAgoIso(6) };
    return { from: fromDate, to: toDate };
  };

  const search = useCallback(async (page = 1, qOverride?: string, fromOverride?: string, toOverride?: string) => {
    const q = qOverride ?? query;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const f = fromOverride ?? fromDate;
      const t = toOverride ?? toDate;
      if (f) params.set("from", f);
      if (t) params.set("to", t);
      params.set("page", page.toString());
      const res = await fetch(`/api/archive?${params}`);
      setResults(await res.json());
    } finally { setLoading(false); }
  }, [query, fromDate, toDate]);

  const applyArchRange = (r: ArchRange) => {
    setArchRange(r);
    const win = rangeWindow(r);
    setFromDate(win.from); setToDate(win.to);
    search(1, undefined, win.from, win.to);
  };
  const applyArchAllTime = () => {
    setArchRange("custom");
    setFromDate(""); setToDate("");
    search(1, undefined, "", "");
  };

  // Auto-run a search when arriving from the home search bar (/archive?q=...)
  // Default window: last quarter.
  useEffect(() => {
    const q3 = monthsAgoIso(3);
    setFromDate(q3);
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) { setQuery(q); search(1, q, q3, ""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateSummary = async (type: "weekly" | "monthly") => {
    setSummaryLoading(true); setSummaryType(type); setSummaryText("");
    try {
      const res = await fetch("/api/weekly-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
      const data = await res.json();
      setSummaryText(data.error ? `❌ ${data.error}` : data.text);
    } finally { setSummaryLoading(false); }
  };

  const generateArchiveArticle = async () => {
    if (!query) return;
    setArticleLoading(true); setArchiveArticle("");
    try {
      const res = await fetch("/api/archive-article", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, from: fromDate, to: toDate }) });
      const data = await res.json();
      setArchiveArticle(data.error ? `❌ ${data.error}` : data.text);
    } finally { setArticleLoading(false); }
  };

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      {/* Header */}
      <SiteNav />

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* deep-feed hero — premium, in the home page's dark language */}
        <div className="rounded-2xl px-6 py-7 mb-4 text-center relative overflow-hidden" style={{ background: "linear-gradient(165deg, #0f1419 0%, #161e2b 55%, #1a2335 100%)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 75% 20%, rgba(220,38,38,0.14), transparent 45%)" }} />
          <h1 className="relative text-[30px] font-extrabold text-white leading-none tracking-tight" style={{ fontFamily: "DM Sans, system-ui" }}>
            דיפפיד <span className="text-[16px] font-bold align-middle" style={{ color: "#dc2626", letterSpacing: "0.04em" }}>deep-feed</span>
          </h1>
          <p className="relative text-[15px] font-bold text-white mt-2">מחקר חוצה גבולות בקליק</p>
          <p className="relative text-[12.5px] mt-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
            כשמנוע החיפוש החזק בעולם בא לתת עבודה<span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5 align-middle shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
          </p>
        </div>

        {/* Search */}
        <div className="lf-card p-4 mb-4">
          <div className="flex gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חפש: משכנתא, ריבית, בנק ישראל..."
              className="flex-1 h-10 px-3 text-[13px] border rounded-md focus:outline-none focus:ring-1"
              style={{ borderColor: "#e5e7eb" }}
              dir="rtl"
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <button onClick={() => search()} disabled={loading}
              className="lf-btn lf-btn-dark h-10 px-4 text-[13px]">
              {loading ? "⏳" : "חפש"}
            </button>
          </div>
          {/* Exclusive time buckets — default last quarter */}
          <div className="flex items-center flex-wrap gap-1.5 mb-3">
            <span className="text-[10px] shrink-0 ml-1" style={{ color: "#9ca3af" }}>🗓️ טווח:</span>
            {([["quarter", "רבעון אחרון"], ["half", "חצי שנה"], ["year", "שנה"]] as [ArchRange, string][]).map(([key, label]) => (
              <button key={key} onClick={() => applyArchRange(key)}
                className="px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors whitespace-nowrap"
                style={{ background: archRange === key ? "#dc2626" : "#fff", color: archRange === key ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>
                {label}
              </button>
            ))}
            <button onClick={applyArchAllTime}
              className="px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors whitespace-nowrap"
              style={{ background: archRange === "custom" && !fromDate && !toDate ? "#dc2626" : "#fff", color: archRange === "custom" && !fromDate && !toDate ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>
              ∞ כל הזמנים
            </button>
          </div>
          <div className="flex gap-2 items-center text-[12px] flex-wrap">
            <span style={{ color: "#9ca3af" }}>🎚️ סנן מותאם:</span>
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setArchRange("custom"); }}
              className="h-8 px-2 text-[12px] border rounded-md w-36" style={{ borderColor: "#e5e7eb" }} />
            <span style={{ color: "#9ca3af" }}>עד:</span>
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setArchRange("custom"); }}
              className="h-8 px-2 text-[12px] border rounded-md w-36" style={{ borderColor: "#e5e7eb" }} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => generateSummary("weekly")} disabled={summaryLoading}
            className="lf-btn lf-btn-dark text-[12px] !py-2">
            {summaryLoading && summaryType === "weekly" ? "⏳ מייצר..." : "📅 סיכום שבועי"}
          </button>
          <button onClick={() => generateSummary("monthly")} disabled={summaryLoading}
            className="lf-btn lf-btn-dark text-[12px] !py-2">
            {summaryLoading && summaryType === "monthly" ? "⏳ מייצר..." : "📊 סיכום חודשי"}
          </button>
          {query && (
            <button onClick={generateArchiveArticle} disabled={articleLoading}
              className="lf-btn text-[12px] !py-2 text-white" style={{ background: "#dc2626" }}>
              {articleLoading ? "⏳ מייצר..." : `📰 כתבה: "${query}"`}
            </button>
          )}
        </div>

        {/* Summary Result */}
        {summaryText && (
          <div className="lf-card p-4 mb-4" style={{ borderRight: "3px solid #059669" }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[13px] font-bold" style={{ color: "#0f1419" }}>
                {summaryType === "weekly" ? "📅 סיכום שבועי" : "📊 סיכום חודשי"}
              </span>
              <div className="flex gap-1.5">
                <VoicePlayButton text={summaryText} />
                <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2"
                  onClick={() => navigator.clipboard.writeText(summaryText)}>העתק</button>
              </div>
            </div>
            <Textarea value={summaryText} onChange={(e) => setSummaryText(e.target.value)}
              className="min-h-[200px] text-[13px] leading-[1.7]" dir="rtl" />
          </div>
        )}

        {/* Archive Article */}
        {archiveArticle && (
          <div className="lf-card p-4 mb-4" style={{ borderRight: "3px solid #dc2626" }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[13px] font-bold" style={{ color: "#0f1419" }}>📰 כתבה: &quot;{query}&quot;</span>
              <div className="flex gap-1.5">
                <VoicePlayButton text={archiveArticle} />
                <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2"
                  onClick={() => navigator.clipboard.writeText(archiveArticle)}>העתק</button>
              </div>
            </div>
            <Textarea value={archiveArticle} onChange={(e) => setArchiveArticle(e.target.value)}
              className="min-h-[300px] text-[13px] leading-[1.7]" dir="rtl" />
          </div>
        )}

        {/* Search Results */}
        {results && Array.isArray(results.items) && (
          <div className="space-y-2">
            <p className="text-[12px] mb-2" style={{ color: "#9ca3af" }}>
              {results.total} באזים · עמוד {results.page}/{results.totalPages}
            </p>
            {results.items.map((item) => (
              <NewsCard key={item.id} news={toScored(item)} selected={selectedIds.has(item.id)} onSelect={toggleSelect} showDate />
            ))}

            {results.totalPages > 1 && (
              <div className="flex gap-2 justify-center pt-3">
                {results.page > 1 && (
                  <button className="lf-btn lf-btn-outline text-[12px] !py-1.5 !px-3" onClick={() => search(results.page - 1)}>← הקודם</button>
                )}
                <span className="text-[12px] self-center" style={{ color: "#9ca3af" }}>{results.page}/{results.totalPages}</span>
                {results.page < results.totalPages && (
                  <button className="lf-btn lf-btn-outline text-[12px] !py-1.5 !px-3" onClick={() => search(results.page + 1)}>הבא →</button>
                )}
              </div>
            )}
          </div>
        )}

        {/* No matches for this search */}
        {results && Array.isArray(results.items) && results.items.length === 0 && !loading && (
          <div className="text-center py-12 space-y-2">
            <div className="text-3xl">🔍</div>
            <p className="text-[14px] font-bold" style={{ color: "#0f1419" }}>לא נמצאו באזים{query ? ` עבור “${query}”` : ""}</p>
            <p className="text-[12px]" style={{ color: "#6b7280" }}>נסו מילה אחרת, או הרחיבו את טווח התאריכים.</p>
            {query && (
              <div className="pt-2 space-y-1.5">
                <a href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer"
                  className="inline-block lf-btn lf-btn-outline text-[12px] !py-2 !px-4 font-semibold">
                  🌐 בינתיים — חפש בגוגל ←
                </a>
                <p className="text-[10px]" style={{ color: "#b8bec7" }}>רשמנו את הפער — ככה לידרפיד לומד לכסות גם את זה. 📈</p>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!results && !summaryText && !archiveArticle && (
          <div className="text-center py-16 space-y-4">
            <div className="text-4xl">🗂️</div>
            <div className="max-w-sm mx-auto space-y-2">
              <p className="text-[15px] font-bold" style={{ color: "#0f1419" }}>הארכיון מכיל אלפי כותרות מהחודשים האחרונים</p>
              <p className="text-[12px] leading-[1.6]" style={{ color: "#6b7280" }}>
                3 דברים שאפשר לעשות מכאן:
              </p>
              <ul className="text-[12px] text-right space-y-1.5 leading-[1.5] mr-4" style={{ color: "#374151" }}>
                <li>🔎 <strong>חיפוש חופשי</strong> — תכתוב &quot;משכנתא&quot;, &quot;פינוי בינוי&quot;, &quot;ריבית&quot; — והארכיון ימצא הכל</li>
                <li>📅 <strong>סיכום שבועי / חודשי</strong> — Claude יסכם את הכותרות החשובות בטווח</li>
                <li>📰 <strong>בניית כתבה</strong> — חיפוש + לחיצה על &quot;כתבה&quot; → כתבה שלמה (600+ מילים) בקול של בן</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
