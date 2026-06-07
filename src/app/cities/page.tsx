"use client";

import { useState, useMemo } from "react";
import { SiteNav } from "@/components/site-nav";
import { NewsCard } from "@/components/news-card";
import { CITIES } from "@/lib/cities";
import type { ScoredNews } from "@/lib/types";

interface Overview {
  city: { name: string; district: string };
  population: number | null;
  mayor: string | null;
  metric: { avgRent: number; annualChange: number | null } | null;
  articleCount: number;
  projectorUrl: string;
}

// City-scoped quick searches (city name is AND-ed with these).
const CITY_CHIPS = [
  { emoji: "🆕", label: "פרויקט חדש", term: "פרויקט חדש" },
  { emoji: "🏗️", label: "התחדשות עירונית", term: "התחדשות עירונית" },
  { emoji: "🏠", label: "דירות חדשות", term: "דירות חדשות" },
  { emoji: "📈", label: "עליית מחירים", term: "מחירים" },
  { emoji: "🏘️", label: "מחיר למשתכן", term: "מחיר למשתכן" },
  { emoji: "🏚️", label: "פינוי בינוי", term: "פינוי בינוי" },
];

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("he-IL");
}

export default function CitiesPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingCity, setLoadingCity] = useState(false);

  const [articles, setArticles] = useState<ScoredNews[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q || q === selected) return [];
    return CITIES.filter((c) => c.name.includes(q) || (c.aliases || []).some((a) => a.includes(q))).slice(0, 8);
  }, [query, selected]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapItem = (it: any): ScoredNews => ({
    ...it,
    source_url: it.url || it.source_url || "",
    published_at: it.scan_date || it.created_at || null,
    score: it.score ?? null,
    reasoning: it.reasoning || "",
  });

  const loadFeed = async (cityName: string, chipTerm: string | null, pageN: number) => {
    setLoadingFeed(true);
    try {
      const q = chipTerm ? `${cityName} ${chipTerm}` : cityName;
      const res = await fetch(`/api/archive?q=${encodeURIComponent(q)}&page=${pageN}`);
      const data = await res.json();
      const items = (data.items || []).map(mapItem);
      if (pageN === 1) setArticles(items);
      else setArticles((prev) => [...prev, ...items]);
      setTotal(data.total || 0);
      setPage(pageN);
    } finally {
      setLoadingFeed(false);
    }
  };

  const selectCity = async (cityName: string) => {
    setSelected(cityName);
    setQuery(cityName);
    setActiveChip(null);
    setSummary("");
    setOverview(null);
    setArticles([]);
    setLoadingCity(true);
    // Feed first (fast), overview in parallel
    loadFeed(cityName, null, 1);
    try {
      const res = await fetch(`/api/cities/overview?city=${encodeURIComponent(cityName)}`);
      const data = await res.json();
      if (!data.error) setOverview(data);
    } finally {
      setLoadingCity(false);
    }
  };

  const applyChip = (term: string | null, label: string | null) => {
    if (!selected) return;
    setActiveChip(label);
    loadFeed(selected, term, 1);
  };

  const fetchSummary = async (refresh: boolean) => {
    if (!selected) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/cities/summary?city=${encodeURIComponent(selected)}${refresh ? "&refresh=1" : ""}`);
      const data = await res.json();
      setSummary(data.summary || data.error || "שגיאה");
    } catch {
      setSummary("לא הצלחנו לייצר את התדריך כרגע. נסה שוב.");
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      <SiteNav />
      <div className="max-w-3xl mx-auto px-4 py-5">
        <div className="mb-3">
          <h1 className="text-[20px] font-extrabold" style={{ color: "#0f1419" }}>🏙️ ערים</h1>
          <p className="text-[12px] mt-0.5 leading-[1.5]" style={{ color: "#6b7280" }}>
            בוחרים עיר ומקבלים עליה הכול במקום אחד: כל הכתבות, נתוני העיר, וחיפושים ממוקדים — בלי לצאת לגוגל.
          </p>
        </div>

        {/* City picker */}
        <div className="lf-card p-3 mb-4 relative">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (selected) setSelected(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) selectCity(suggestions[0].name); }}
              placeholder="חפש עיר — מעלות תרשיחא, פתח תקווה, חיפה…"
              className="flex-1 h-10 px-3 text-[14px] border rounded-lg outline-none"
              style={{ borderColor: "#e5e7eb" }}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="absolute z-20 left-3 right-3 mt-1 bg-white rounded-lg shadow-lg border overflow-hidden" style={{ borderColor: "#e5e7eb" }}>
              {suggestions.map((c) => (
                <button key={c.name} onClick={() => selectCity(c.name)}
                  className="w-full text-right px-3 py-2 text-[13px] hover:bg-gray-50 flex items-center justify-between">
                  <span style={{ color: "#0f1419" }}>{c.name}</span>
                  <span className="text-[11px]" style={{ color: "#9ca3af" }}>{c.district}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!selected && (
          <div className="text-center py-12 space-y-2">
            <div className="text-4xl">🏙️</div>
            <p className="text-[14px] font-bold" style={{ color: "#0f1419" }}>בחר עיר כדי לראות את "אווטאר העיר"</p>
            <p className="text-[12px]" style={{ color: "#9ca3af" }}>כתבות · אוכלוסייה · ראש העיר · מחירים · קישור לפרויקטור · תדריך AI</p>
          </div>
        )}

        {selected && (
          <>
            {/* City avatar header */}
            <div className="lf-card p-4 mb-3" style={{ borderRight: "3px solid var(--lf-navy)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[20px] font-extrabold" style={{ color: "#0f1419" }}>{selected}</h2>
                  <p className="text-[12px]" style={{ color: "#9ca3af" }}>{overview?.city.district ? `מחוז ${overview.city.district}` : ""}</p>
                </div>
                {overview?.projectorUrl && (
                  <a href={overview.projectorUrl} target="_blank" rel="noopener noreferrer"
                    className="lf-btn lf-btn-outline text-[11px] !py-1.5 !px-2.5 shrink-0">🔗 בפרויקטור</a>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                <div className="text-center rounded-lg py-2" style={{ background: "#f8f9fb" }}>
                  <p className="text-[18px] font-extrabold leading-none" style={{ color: "#dc2626" }}>{loadingCity && !overview ? "…" : fmtNum(overview?.articleCount ?? 0)}</p>
                  <p className="text-[10px] mt-1" style={{ color: "#9ca3af" }}>כתבות בלידרפיד</p>
                </div>
                <div className="text-center rounded-lg py-2" style={{ background: "#f8f9fb" }}>
                  <p className="text-[18px] font-extrabold leading-none" style={{ color: "#0f1419" }}>{loadingCity && !overview ? "…" : fmtNum(overview?.population ?? null)}</p>
                  <p className="text-[10px] mt-1" style={{ color: "#9ca3af" }}>תושבים</p>
                </div>
                <div className="text-center rounded-lg py-2" style={{ background: "#f8f9fb" }}>
                  <p className="text-[13px] font-bold leading-tight pt-1" style={{ color: "#0f1419" }}>{loadingCity && !overview ? "…" : (overview?.mayor || "—")}</p>
                  <p className="text-[10px] mt-1" style={{ color: "#9ca3af" }}>ראש העיר</p>
                </div>
                <div className="text-center rounded-lg py-2" style={{ background: "#f8f9fb" }}>
                  <p className="text-[15px] font-extrabold leading-none pt-1" style={{ color: "#0f1419" }}>{overview?.metric ? `₪${fmtNum(overview.metric.avgRent)}` : "—"}</p>
                  <p className="text-[10px] mt-1" style={{ color: "#9ca3af" }}>שכ"ד ממוצע{overview?.metric?.annualChange != null ? ` (${overview.metric.annualChange > 0 ? "+" : ""}${overview.metric.annualChange}%)` : ""}</p>
                </div>
              </div>
            </div>

            {/* AI city brief */}
            <div className="lf-card p-4 mb-3" style={{ borderRight: "3px solid #7c3aed" }}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-extrabold" style={{ color: "#5b21b6" }}>🧠 תדריך עיר</p>
                  <p className="text-[11px]" style={{ color: "#9ca3af" }}>נקודות מרכזיות, קבלנים פעילים וזווית שיווקית — בלחיצה שלך, נשמר.</p>
                </div>
                <button onClick={() => fetchSummary(!!summary)} disabled={summaryLoading}
                  className="lf-btn text-[12px] !py-2 !px-3 shrink-0 text-white disabled:opacity-50" style={{ background: "#7c3aed" }}>
                  {summaryLoading ? "⏳ מנתח…" : summary ? "🔄 רענן" : "✨ צור תדריך"}
                </button>
              </div>
              {summary && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: "#eef0f2" }}>
                  <div className="whitespace-pre-wrap text-[13px] leading-[1.7]" style={{ color: "#374151" }} dir="rtl">{summary}</div>
                  <button onClick={async () => { await navigator.clipboard.writeText(summary); setSummaryCopied(true); setTimeout(() => setSummaryCopied(false), 1500); }}
                    className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2 mt-2.5">{summaryCopied ? "✓ הועתק" : "📋 העתק"}</button>
                </div>
              )}
            </div>

            {/* City-scoped quick searches */}
            <div className="flex items-center flex-wrap gap-1.5 mb-3">
              <span className="text-[10px] shrink-0 ml-1" style={{ color: "#9ca3af" }}>חיפוש מהיר:</span>
              <button onClick={() => applyChip(null, null)}
                className="px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors"
                style={{ background: !activeChip ? "var(--lf-navy)" : "#fff", color: !activeChip ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>הכל</button>
              {CITY_CHIPS.map((c) => (
                <button key={c.label} onClick={() => applyChip(c.term, c.label)}
                  className="px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors whitespace-nowrap"
                  style={{ background: activeChip === c.label ? "var(--lf-navy)" : "#fff", color: activeChip === c.label ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>

            <p className="text-[11px] mb-2" style={{ color: "#9ca3af" }}>
              {total} כתבות{activeChip ? ` · ${activeChip}` : ""} על {selected}
            </p>

            {/* Feed */}
            {loadingFeed && articles.length === 0 ? (
              <div className="flex items-center justify-center py-12 gap-2.5 text-[13px]" style={{ color: "#6b7280" }}>
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#dc2626", borderTopColor: "transparent" }} />
                טוען כתבות…
              </div>
            ) : articles.length === 0 ? (
              <div className="text-center py-10 text-[13px]" style={{ color: "#9ca3af" }}>
                לא נמצאו כתבות{activeChip ? ` בנושא "${activeChip}"` : ""} על {selected} עדיין.
                <br />ערים קטנות מקבלות מעט סיקור ארצי — נוסיף מקורות מקומיים כדי להעשיר.
              </div>
            ) : (
              <div className="space-y-2.5">
                {articles.map((a) => (
                  <NewsCard key={a.id} news={a} selected={false} onSelect={() => {}} showDate />
                ))}
                {articles.length < total && (
                  <button onClick={() => loadFeed(selected, CITY_CHIPS.find((c) => c.label === activeChip)?.term || null, page + 1)}
                    disabled={loadingFeed}
                    className="lf-btn lf-btn-outline w-full !py-2.5 text-[13px] font-semibold">
                    {loadingFeed ? "טוען…" : `הצג עוד · נותרו ${total - articles.length}`}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
