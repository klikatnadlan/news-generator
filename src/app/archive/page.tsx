"use client";

import { useState, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { VoicePlayButton } from "@/components/voice-play-button";
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

  const search = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      params.set("page", page.toString());
      const res = await fetch(`/api/archive?${params}`);
      setResults(await res.json());
    } finally { setLoading(false); }
  }, [query, fromDate, toDate]);

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
      <header className="lf-header">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-12">
          <Link href="/" className="flex items-center gap-2 leading-none">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
            <span className="flex flex-col items-start leading-none">
              <span className="text-[14px] font-extrabold text-white tracking-tight" style={{ fontFamily: "DM Sans, system-ui" }}>לידרפיד</span>
              <span className="text-[8px] md:text-[9px] text-white/45 italic mt-0.5" style={{ fontFamily: "Georgia, serif" }}>by ben solomon</span>
            </span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/" className="text-[12px] text-white/60 hover:text-white transition-colors">ראשי</Link>
            <Link href="/headlines" className="text-[12px] text-white/60 hover:text-white transition-colors">כותרות</Link>
            <Link href="/alerts" className="text-[12px] text-white/60 hover:text-white transition-colors">מעקבים</Link>
            <Link href="/dashboard" className="text-[12px] text-white/60 hover:text-white transition-colors">לוח בקרה</Link>
            <Link href="/history" className="text-[12px] text-white/60 hover:text-white transition-colors">היסטוריה</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
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
          <div className="flex gap-2 items-center text-[12px]">
            <span style={{ color: "#9ca3af" }}>מתאריך:</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="h-8 px-2 text-[12px] border rounded-md w-36" style={{ borderColor: "#e5e7eb" }} />
            <span style={{ color: "#9ca3af" }}>עד:</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
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
        {results && (
          <div className="space-y-2">
            <p className="text-[12px] mb-2" style={{ color: "#9ca3af" }}>
              {results.total} תוצאות · עמוד {results.page}/{results.totalPages}
            </p>
            {results.items.map((item) => {
              const srcName = getSourceName(item.source);
              const srcColor = getSourceColor(item.source);
              return (
                <div key={item.id} className="lf-card p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded" style={{ color: srcColor, background: srcColor + "12" }}>
                      {srcName}
                    </span>
                    <span className="text-[10px]" style={{ color: "#9ca3af" }}>
                      {item.created_at ? new Date(item.created_at).toLocaleDateString("he-IL") : ""}
                    </span>
                    {item.score && (
                      <span className="text-[11px] font-bold" style={{ color: item.score >= 70 ? "#059669" : item.score >= 40 ? "#d97706" : "#9ca3af", fontFamily: "DM Sans" }}>
                        {item.score}
                      </span>
                    )}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] mr-auto hover:underline" style={{ color: "#9ca3af" }}>
                        מקור ←
                      </a>
                    )}
                  </div>
                  <h3 className="text-[14px] font-bold leading-[1.4] mb-1" style={{ color: "#0f1419" }}>{item.title}</h3>
                  {item.summary && (
                    <p className="text-[12px] leading-[1.5] line-clamp-2" style={{ color: "#6b7280" }}>{item.summary}</p>
                  )}
                </div>
              );
            })}

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
