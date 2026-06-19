"use client";

import { useState, useMemo } from "react";
import { SiteNav } from "@/components/site-nav";
import { NewsCard } from "@/components/news-card";
import { CITIES } from "@/lib/cities";
import type { ScoredNews } from "@/lib/types";

interface Overview {
  city: { name: string; district: string };
  population: number | null;
  populationAsOf: string | null; // למ"ס estimate date, e.g. "אפריל 2026"
  mayor: string | null;
  metric: { avgRent: number; annualChange: number | null } | null;
  nationalRent: number | null;  // national avg rent (latest month, all cities)
  rentDiffPct: number | null;   // city vs national, %
  avgWage: number | null;       // CBS avg employee wage — the city-strength box
  wageDiffPct: number | null;
  nationalWage: number | null;
  wageAsOf: string | null;
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

// "ללמוד אזור" — compose a multi-dimensional study (RE + civic). Each runs a
// search "<city> <term>". Pick what matters, then "בצע מחקר".
const RESEARCH_TOPICS = [
  { emoji: "🆕", label: "פרויקטים חדשים", term: "פרויקט" },
  { emoji: "🏠", label: "דירות חדשות", term: "דירות" },
  { emoji: "🏗️", label: "התחדשות עירונית", term: "התחדשות" },
  { emoji: "📈", label: "מחירים", term: "מחירים" },
  { emoji: "🏘️", label: "מחיר למשתכן", term: "מחיר למשתכן" },
  { emoji: "🪧", label: "מכרזי קרקע", term: "מכרז" },
  { emoji: "🎓", label: "חינוך", term: "חינוך" },
  { emoji: "🚨", label: "אלימות ופשיעה", term: "אלימות" },
  { emoji: "💼", label: "תעסוקה", term: "תעסוקה" },
  { emoji: "🛣️", label: "כבישים ותחבורה", term: "כביש" },
  { emoji: "🚆", label: "רכבת", term: "רכבת" },
  { emoji: "🏥", label: "בריאות", term: "בריאות" },
  { emoji: "🌳", label: "סביבה", term: "סביבה" },
  { emoji: "🏖️", label: "תיירות", term: "תיירות" },
  { emoji: "⚽", label: "ספורט ואירועים", term: "ספורט" },
  { emoji: "🎭", label: "תרבות ופנאי", term: "תרבות" },
  { emoji: "🎪", label: "אירועים עירוניים", term: "אירועים" },
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
  // Feed time range — EXCLUSIVE buckets (Ben: clicking a different chip must
  // show DIFFERENT content, no overlap): רבעון = 0-3 חודשים אחורה, חצי שנה =
  // 3-6, שנה = 6-12. "🎚️ סנן" opens a custom from/to (incl. כל הזמנים) — for
  // e.g. learning a neighborhood since it was built.
  type FeedRange = "quarter" | "half" | "year" | "custom";
  const [feedRange, setFeedRange] = useState<FeedRange>("quarter");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const FEED_RANGES: { key: FeedRange; label: string }[] = [
    { key: "quarter", label: "רבעון אחרון" },
    { key: "half", label: "חצי שנה" },
    { key: "year", label: "שנה" },
  ];
  const monthsAgoIso = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };
  const rangeWindow = (r: FeedRange): { from: string; to: string } => {
    if (r === "quarter") return { from: monthsAgoIso(3), to: "" };
    if (r === "half") return { from: monthsAgoIso(6), to: monthsAgoIso(3) };
    if (r === "year") return { from: monthsAgoIso(12), to: monthsAgoIso(6) };
    return { from: customFrom, to: customTo }; // custom; both empty = כל הזמנים
  };
  const rangeLabel = (r: FeedRange): string => {
    if (r === "custom") return customFrom || customTo ? `${customFrom || "…"} ← ${customTo || "היום"}` : "כל הזמנים";
    return FEED_RANGES.find((x) => x.key === r)?.label || "";
  };

  // Subtitle text size for the feed cards (shared --lf-content-size, persisted).
  const bumpFeedTextSize = (delta: number) => {
    const root = document.documentElement;
    const cur = parseFloat(getComputedStyle(root).getPropertyValue("--lf-content-size")) || 13;
    const next = Math.min(22, Math.max(11, Math.round((cur + delta) * 10) / 10));
    root.style.setProperty("--lf-content-size", `${next}px`);
    try { localStorage.setItem("lf-content-size", String(next)); } catch { /* ignore */ }
  };

  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);

  // "ללמוד אזור / בצע מחקר" — compose research dimensions, run them all at once.
  const [researchTopics, setResearchTopics] = useState<Set<string>>(new Set());
  const [customCubes, setCustomCubes] = useState<string[]>([]);
  const [researchFrom, setResearchFrom] = useState<string>(""); // "" = all time
  const [research, setResearch] = useState<{ topic: string; count: number; webCount?: number; items: { id: string; title: string; summary?: string; source: string; url: string; date: string | null; web?: boolean }[] }[] | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [openResearchTopic, setOpenResearchTopic] = useState<string | null>(null);
  // "קרא באז" inside research results — opens the full content cube (NewsCard)
  // INSIDE LeaderFeed instead of throwing the user to the external site.
  const [openBuzzIds, setOpenBuzzIds] = useState<Set<string>>(new Set());
  const toggleBuzz = (id: string) => setOpenBuzzIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // "📈 תהליך הבשלה" — maturation timeline of a city / project / developer.
  type MatItem = { id: string; title: string; summary?: string; source: string; url: string; date: string | null; web: boolean; year: number; conf: "exact" | "parsed" | "approx" };
  const [maturationEntity, setMaturationEntity] = useState<string>("");
  const [maturation, setMaturation] = useState<{ city: string; entity: string; firstYear: number | null; lastYear: number | null; yearsMaturing: number | null; timeline: { year: number; items: MatItem[] }[]; totalItems: number } | null>(null);
  const [maturationLoading, setMaturationLoading] = useState(false);
  const [maturationCopied, setMaturationCopied] = useState(false);
  const runMaturation = async () => {
    if (!selected) return;
    setMaturationLoading(true);
    setOpenBuzzIds(new Set());
    try {
      const entQ = maturationEntity.trim() ? `&entity=${encodeURIComponent(maturationEntity.trim())}` : "";
      const res = await fetch(`/api/cities/maturation?city=${encodeURIComponent(selected)}${entQ}`);
      const data = await res.json();
      setMaturation(data && data.timeline ? data : { city: selected, entity: maturationEntity, firstYear: null, lastYear: null, yearsMaturing: null, timeline: [], totalItems: 0 });
    } catch {
      setMaturation({ city: selected, entity: maturationEntity, firstYear: null, lastYear: null, yearsMaturing: null, timeline: [], totalItems: 0 });
    } finally {
      setMaturationLoading(false);
    }
  };

  // "תדריך אזור" — structured AI report (click only, sources are real articles).
  type Dossier = { report: string; sources: { title: string; source: string; url: string; date: string | null }[]; wikipediaUrl?: string };
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierCopied, setDossierCopied] = useState(false);

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

  const loadFeed = async (cityName: string, chipTerm: string | null, pageN: number, range?: FeedRange, winOverride?: { from: string; to: string }) => {
    setLoadingFeed(true);
    try {
      const chipQ = chipTerm ? `&chip=${encodeURIComponent(chipTerm)}` : "";
      const win = winOverride ?? rangeWindow(range ?? feedRange);
      const fromQ = win.from ? `&from=${win.from}` : "";
      const toQ = win.to ? `&to=${win.to}` : "";
      const res = await fetch(`/api/cities/feed?city=${encodeURIComponent(cityName)}${chipQ}${fromQ}${toQ}&page=${pageN}`);
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
    setResearch(null);
    setResearchTopics(new Set());
    setCustomCubes([]);
    setResearchFrom("");
    setOpenResearchTopic(null);
    setOpenBuzzIds(new Set());
    setDossier(null);
    setFeedRange("quarter"); // default: last quarter = most relevant
    setLoadingCity(true);
    // Feed first (fast), overview in parallel
    loadFeed(cityName, null, 1, "quarter");
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

  const applyRange = (r: FeedRange) => {
    if (!selected) return;
    setFeedRange(r);
    if (r !== "custom") setFilterOpen(false);
    loadFeed(selected, CITY_CHIPS.find((c) => c.label === activeChip)?.term || null, 1, r);
  };
  const applyAllTime = () => {
    setCustomFrom(""); setCustomTo("");
    setFeedRange("custom"); setFilterOpen(false);
    if (selected) loadFeed(selected, CITY_CHIPS.find((c) => c.label === activeChip)?.term || null, 1, "custom", { from: "", to: "" });
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

  const fetchDossier = async (refresh: boolean) => {
    if (!selected) return;
    setDossierLoading(true);
    try {
      const topicsQ = researchTopics.size ? `&topics=${encodeURIComponent(Array.from(researchTopics).join("|"))}` : "";
      const fromQ = researchFrom ? `&from=${researchFrom}` : "";
      const res = await fetch(`/api/cities/dossier?city=${encodeURIComponent(selected)}${topicsQ}${fromQ}${refresh ? "&refresh=1" : ""}`);
      const data = await res.json();
      if (data.error) { setDossier({ report: data.error, sources: [] }); }
      else setDossier(data);
    } catch {
      setDossier({ report: "לא הצלחנו לבנות את התדריך כרגע. נסה שוב.", sources: [] });
    } finally {
      setDossierLoading(false);
    }
  };

  const toggleResearchTopic = (term: string) => {
    setResearchTopics((prev) => { const n = new Set(prev); n.has(term) ? n.delete(term) : n.add(term); return n; });
  };
  const runResearch = async () => {
    if (!selected || researchTopics.size === 0) return;
    setResearchLoading(true);
    setOpenResearchTopic(null);
    setOpenBuzzIds(new Set());
    try {
      const fromQ = researchFrom ? `&from=${researchFrom}` : "";
      const res = await fetch(`/api/cities/research?city=${encodeURIComponent(selected)}&topics=${encodeURIComponent(Array.from(researchTopics).join("|"))}${fromQ}`);
      const data = await res.json();
      setResearch(data.results || []);
    } catch {
      setResearch([]);
    } finally {
      setResearchLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      <SiteNav />
      <div className="max-w-3xl mx-auto px-4 py-5">
        <div className="mb-3">
          <h1 className="text-[20px] font-extrabold" style={{ color: "#0f1419" }}>🏙️ ערים</h1>
          <p className="text-[12px] mt-0.5 leading-[1.5]" style={{ color: "#6b7280" }}>
            בוחרים עיר ומקבלים עליה הכול במקום אחד: כל הבאזים, נתוני העיר, וחיפושים ממוקדים — בלי לצאת לגוגל.
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
            <p className="text-[12px]" style={{ color: "#9ca3af" }}>באזים · אוכלוסייה · ראש העיר · מחירים · קישור לפרויקטור · תדריך AI</p>
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
                  <p className="text-[10px] mt-1" style={{ color: "#9ca3af" }}>באזים בלידרפיד</p>
                </div>
                <div className="text-center rounded-lg py-2" style={{ background: "#f8f9fb" }}>
                  <p className="text-[18px] font-extrabold leading-none" style={{ color: "#0f1419" }}>{loadingCity && !overview ? "…" : fmtNum(overview?.population ?? null)}</p>
                  <p className="text-[10px] mt-1" style={{ color: "#9ca3af" }}>תושבים{overview?.populationAsOf ? ` · נכון ל${overview.populationAsOf}` : ""}</p>
                </div>
                <div className="text-center rounded-lg py-2" style={{ background: "#f8f9fb" }}>
                  <p className="text-[13px] font-bold leading-tight pt-1" style={{ color: "#0f1419" }}>{loadingCity && !overview ? "…" : (overview?.mayor || "—")}</p>
                  <p className="text-[10px] mt-1" style={{ color: "#9ca3af" }}>ראש העיר</p>
                </div>
                <div className="text-center rounded-lg py-2" style={{ background: "#f8f9fb" }}>
                  <p className="text-[15px] font-extrabold leading-none pt-1" style={{ color: "#0f1419" }}>
                    {overview?.avgWage ? `₪${fmtNum(overview.avgWage)}` : "—"}
                    {overview?.avgWage && overview?.wageDiffPct != null && (
                      <span className="text-[11px] font-bold mr-1" style={{ color: overview.wageDiffPct >= 0 ? "#059669" : "#dc2626" }}>
                        <bdi dir="ltr">{overview.wageDiffPct > 0 ? "+" : ""}{overview.wageDiffPct}%</bdi>
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: "#9ca3af" }}>שכר ממוצע{overview?.wageAsOf ? ` · ${overview.wageAsOf}` : ""}</p>
                  {overview?.nationalWage && (
                    <p className="text-[9px] mt-0.5" style={{ color: "#b8bec7" }}>* ארצי: ₪{fmtNum(overview.nationalWage)} · ההפרש מול ארצי</p>
                  )}
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

            {/* 🔬 ללמוד אזור / בצע מחקר — compose research dimensions, run all */}
            <div className="lf-card p-4 mb-3" style={{ borderRight: "3px solid #0ea5e9" }}>
              <p className="text-[14px] font-extrabold" style={{ color: "#0369a1" }}>🔬 ללמוד את {selected}</p>
              <p className="text-[11px] mb-2.5" style={{ color: "#9ca3af" }}>סמנו מה חשוב לכם וגלו את הנרטיבים המובילים, גלו את הבאזז.</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {RESEARCH_TOPICS.map((t) => {
                  const on = researchTopics.has(t.term);
                  return (
                    <button key={t.label} onClick={() => toggleResearchTopic(t.term)}
                      className="px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors whitespace-nowrap"
                      style={{ background: on ? "#0ea5e9" : "#fff", color: on ? "#fff" : "#6b7280", border: `1px solid ${on ? "#0ea5e9" : "#e5e7eb"}` }}>
                      {t.emoji} {t.label}{on ? "  ✕" : ""}
                    </button>
                  );
                })}
                {/* Custom research cubes */}
                {customCubes.map((cb) => {
                  const on = researchTopics.has(cb);
                  return (
                    <span key={cb} className="inline-flex items-center rounded-full whitespace-nowrap font-medium overflow-hidden"
                      style={{ background: on ? "#0ea5e9" : "#fff", color: on ? "#fff" : "#6b7280", border: `1px solid ${on ? "#0ea5e9" : "#e5e7eb"}` }}>
                      <button onClick={() => toggleResearchTopic(cb)} className="px-2.5 py-1 text-[11px]">🔎 {cb}{on ? "  ✕" : ""}</button>
                      <button onClick={() => { setCustomCubes((p) => p.filter((x) => x !== cb)); setResearchTopics((p) => { const n = new Set(p); n.delete(cb); return n; }); }}
                        title="הסר קובייה" className="px-1.5 py-1 text-[10px] hover:bg-black/10" style={{ opacity: 0.65 }}>🗑</button>
                    </span>
                  );
                })}
                {/* + add a custom cube */}
                <button onClick={() => { const v = window.prompt("הוסף קוביית מחקר (למשל: שמאות, רכבת קלה, אינווידיה, עירייה):"); const term = (v || "").trim(); if (term) { setCustomCubes((p) => (p.includes(term) ? p : [...p, term])); setResearchTopics((p) => new Set(p).add(term)); } }}
                  className="px-2.5 py-1 text-[12px] rounded-full whitespace-nowrap font-bold"
                  style={{ background: "#fff", color: "#0369a1", border: "1px dashed #0ea5e9" }}>＋ קובייה</button>
              </div>
              {/* Date range for the research */}
              <div className="flex items-center flex-wrap gap-1.5 mb-3">
                <span className="text-[10px] shrink-0" style={{ color: "#9ca3af" }}>טווח:</span>
                {[
                  { label: "שנה", days: 365 },
                  { label: "שנתיים", days: 730 },
                  { label: "הכל", days: 0 },
                ].map((rng) => {
                  const fromVal = rng.days ? new Date(Date.now() - rng.days * 86400000).toISOString().split("T")[0] : "";
                  const on = researchFrom === fromVal;
                  return (
                    <button key={rng.label} onClick={() => setResearchFrom(fromVal)}
                      className="px-2.5 py-1 text-[11px] rounded-full font-medium"
                      style={{ background: on ? "#0369a1" : "#fff", color: on ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>{rng.label}</button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={runResearch} disabled={researchTopics.size === 0 || researchLoading}
                  className="lf-btn text-[12px] !py-2 !px-4 text-white disabled:opacity-40" style={{ background: "#0369a1" }}>
                  {researchLoading ? "⏳ חוקר…" : `🔬 בצע מחקר${researchTopics.size ? ` (${researchTopics.size})` : ""}`}
                </button>
                <button onClick={() => fetchDossier(!!dossier)} disabled={dossierLoading}
                  className="lf-btn text-[12px] !py-2 !px-4 text-white disabled:opacity-50" style={{ background: "#7c3aed" }}
                  title="דוח מובנה: איך האזור מתוקשר החוצה, עם מקורות מקושרים">
                  {dossierLoading ? "⏳ מנתח…" : dossier ? "🔄 רענן תדריך" : "🧠 תדריך אזור"}
                </button>
              </div>

              {/* 📈 תהליך הבשלה — maturation timeline of a project / developer / the city */}
              <div className="flex items-center flex-wrap gap-2 mt-2.5 pt-2.5 border-t" style={{ borderColor: "#f1f5f9" }}>
                <input value={maturationEntity} onChange={(e) => setMaturationEntity(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runMaturation(); }}
                  placeholder="פרויקט / יזם / שכונה (אופציונלי) — למשל רני צים, נופי בן שמן"
                  className="text-[12px] px-2.5 py-1.5 rounded-lg border flex-1 min-w-[170px]" style={{ borderColor: "#fde68a" }} dir="rtl" />
                <button onClick={runMaturation} disabled={maturationLoading}
                  className="lf-btn text-[12px] !py-2 !px-4 text-white disabled:opacity-50 whitespace-nowrap" style={{ background: "#f59e0b" }}
                  title="ציר זמן: איך העיר / הפרויקט / היזם הבשילו לאורך השנים — מאז ועד היום">
                  {maturationLoading ? "⏳ בונה ציר זמן…" : "📈 תהליך הבשלה"}
                </button>
              </div>

              {/* 🧠 Structured area dossier — report + real linked sources */}
              {dossier && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: "#ede9fe" }}>
                  <div className="whitespace-pre-wrap text-[13px] leading-[1.7]" style={{ color: "#374151" }} dir="rtl">{dossier.report}</div>
                  <button onClick={async () => { await navigator.clipboard.writeText(dossier.report); setDossierCopied(true); setTimeout(() => setDossierCopied(false), 1500); }}
                    className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2 mt-2.5">{dossierCopied ? "✓ הועתק" : "📋 העתק תדריך"}</button>
                  {dossier.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t" style={{ borderColor: "#f1f3f5" }}>
                      <p className="text-[11px] font-bold mb-1" style={{ color: "#6b7280" }}>מקורות ({dossier.sources.length}):</p>
                      <div className="space-y-1">
                        {dossier.sources.map((s, i) => (
                          <div key={i} className="text-[11px] leading-[1.5]" style={{ color: "#4b5563" }} dir="rtl">
                            <span style={{ color: "#9ca3af" }}>{i + 1}.</span> {s.title}
                            <span className="text-[10px] mr-1" style={{ color: "#9ca3af" }}> ({s.source}{s.date ? ` · ${s.date}` : ""})</span>
                            {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold mr-1" style={{ color: "#0071e3" }}>קישור ←</a>}
                          </div>
                        ))}
                      </div>
                      {dossier.wikipediaUrl && (
                        <a href={dossier.wikipediaUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold inline-block mt-1.5" style={{ color: "#0071e3" }}>📖 ויקיפדיה — {selected} ←</a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {research && (
                <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: "#e0f2fe" }}>
                  {research.map((r) => {
                    const topicMeta = RESEARCH_TOPICS.find((t) => t.term === r.topic);
                    const open = openResearchTopic === r.topic;
                    return (
                      <div key={r.topic}>
                        <button onClick={() => r.count > 0 && setOpenResearchTopic(open ? null : r.topic)}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg" style={{ background: r.count > 0 ? "#f0f9ff" : "transparent", cursor: r.count > 0 ? "pointer" : "default" }}>
                          <span className="text-[12px] font-semibold" style={{ color: r.count > 0 ? "#0f1419" : "#cbd5e1" }}>
                            {topicMeta?.emoji} {topicMeta?.label || r.topic}
                          </span>
                          <span className="text-[12px] font-extrabold" style={{ color: r.count > 0 ? "#0369a1" : "#cbd5e1" }}>
                            {(r.webCount ?? 0) > 0 && <span title="כולל תוצאות מהרשת">🌐 </span>}
                            {r.count > 0 ? `${r.count} באזים ${open ? "▲" : "▼"}` : "אין עדיין"}
                          </span>
                        </button>
                        {open && (
                          <div className="px-2 pt-1 pb-2 space-y-1.5">
                            {r.items.map((it, i) => {
                              const buzzOpen = openBuzzIds.has(it.id);
                              return (
                                <div key={it.id}>
                                  <div className="text-[12px] leading-[1.5]" style={{ color: "#374151" }} dir="rtl">
                                    <span className="font-bold" style={{ color: "#0369a1" }}>{i + 1}.</span> {it.title}
                                    {it.web && <span className="text-[9px] font-bold mr-1 px-1 py-0.5 rounded align-middle" style={{ background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc" }}>🌐 מהרשת</span>}
                                    <span className="text-[10px] mr-1" style={{ color: "#9ca3af" }}> ({it.source}{it.date ? ` · ${it.date}` : ""})</span>
                                    <button onClick={() => toggleBuzz(it.id)}
                                      className="text-[10px] font-bold mr-1.5 px-1.5 py-0.5 rounded border align-middle"
                                      style={{ borderColor: "#0ea5e9", color: "#0369a1", background: buzzOpen ? "#e0f2fe" : "#fff" }}>
                                      {buzzOpen ? "▲ סגור" : "📖 קרא באז"}
                                    </button>
                                  </div>
                                  {buzzOpen && (
                                    <div className="mt-1.5 mb-2">
                                      <NewsCard news={{ ...it, source_url: it.url || "", published_at: it.date || null, score: null, reasoning: "" } as unknown as ScoredNews} selected={false} onSelect={() => {}} showDate readOnly={it.web} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {r.count > r.items.length && (
                              <p className="text-[10px] pt-0.5" style={{ color: "#9ca3af" }}>מציג את {r.items.length} העדכניים מתוך {r.count}.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[10px] pt-1" style={{ color: "#9ca3af" }}>🌐 = כשאין מספיק במאגר שלנו, המחקר יוצא לרשת ומביא תוצאות חיות. "אין עדיין" = גם במאגר וגם ברשת לא נמצא דבר רלוונטי.</p>
                </div>
              )}

              {/* 📈 תהליך הבשלה — chronological maturation arc (oldest → newest) */}
              {maturation && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: "#fef3c7" }}>
                  {maturation.timeline.length > 0 ? (
                    <>
                      <p className="text-[13px] font-extrabold" style={{ color: "#b45309" }}>
                        📈 {maturation.entity ? `${maturation.entity} · ` : ""}{maturation.city}
                        {maturation.yearsMaturing ? ` — מבשיל כבר ${maturation.yearsMaturing} שנים` : ""}
                      </p>
                      {maturation.firstYear && maturation.lastYear && (
                        <p className="text-[11px] mb-2.5" style={{ color: "#92400e" }}>מ-{maturation.firstYear} ועד היום · {maturation.totalItems} אזכורים על ציר הזמן</p>
                      )}
                      <div className="space-y-2.5">
                        {maturation.timeline.map((yr) => (
                          <div key={yr.year} className="pr-3" style={{ borderRight: "2px solid #fcd34d" }}>
                            <span className="text-[12px] font-extrabold inline-block mb-1" style={{ color: "#b45309" }}>● {yr.year}</span>
                            <div className="space-y-1.5">
                              {yr.items.map((it) => {
                                const buzzOpen = openBuzzIds.has(it.id);
                                return (
                                  <div key={it.id}>
                                    <div className="text-[12px] leading-[1.5]" style={{ color: "#374151" }} dir="rtl">
                                      {it.title}
                                      {it.web && <span className="text-[9px] font-bold mr-1 px-1 py-0.5 rounded align-middle" style={{ background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc" }}>🌐</span>}
                                      {it.conf === "approx" && <span className="text-[9px] mr-1" title="שנה משוערת" style={{ color: "#d97706" }}>≈</span>}
                                      <span className="text-[10px] mr-1" style={{ color: "#9ca3af" }}> ({it.source}{it.date ? ` · ${it.date}` : ""})</span>
                                      <button onClick={() => toggleBuzz(it.id)}
                                        className="text-[10px] font-bold mr-1.5 px-1.5 py-0.5 rounded border align-middle"
                                        style={{ borderColor: "#f59e0b", color: "#b45309", background: buzzOpen ? "#fef3c7" : "#fff" }}>
                                        {buzzOpen ? "▲ סגור" : "📖 קרא"}
                                      </button>
                                    </div>
                                    {buzzOpen && (
                                      <div className="mt-1.5 mb-2">
                                        <NewsCard news={{ ...it, source_url: it.url || "", published_at: it.date || null, score: null, reasoning: "" } as unknown as ScoredNews} selected={false} onSelect={() => {}} showDate readOnly={it.web} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button onClick={async () => {
                        const txt = `תהליך הבשלה — ${maturation.entity ? maturation.entity + " · " : ""}${maturation.city}${maturation.yearsMaturing ? ` (מבשיל ${maturation.yearsMaturing} שנים)` : ""}\n\n` +
                          maturation.timeline.map((yr) => `${yr.year}:\n` + yr.items.map((it) => `• ${it.title} (${it.source})${it.url ? ` — ${it.url}` : ""}`).join("\n")).join("\n\n");
                        await navigator.clipboard.writeText(txt); setMaturationCopied(true); setTimeout(() => setMaturationCopied(false), 1500);
                      }} className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2 mt-2.5">{maturationCopied ? "✓ הועתק" : "📋 העתק ציר זמן"}</button>
                      <p className="text-[10px] pt-1.5" style={{ color: "#9ca3af" }}>🌐 = מהרשת · ≈ = שנה משוערת. הציר מורכב ממקורות חיים + מהמאגר שלנו, מהישן לחדש.</p>
                    </>
                  ) : (
                    <p className="text-[12px]" style={{ color: "#9ca3af" }}>לא נמצאו אזכורים מתוארכים. נסו שם פרויקט / יזם / שכונה ספציפי (למשל "רני צים").</p>
                  )}
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

            {/* Feed time range — exclusive buckets + custom filter */}
            <div className="flex items-center flex-wrap gap-1.5 mb-3">
              <span className="text-[10px] shrink-0 ml-1" style={{ color: "#9ca3af" }}>🗓️ טווח:</span>
              {FEED_RANGES.map((r) => (
                <button key={r.key} onClick={() => applyRange(r.key)}
                  className="px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors whitespace-nowrap"
                  style={{ background: feedRange === r.key ? "#dc2626" : "#fff", color: feedRange === r.key ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>
                  {r.label}
                </button>
              ))}
              <button onClick={() => setFilterOpen((o) => !o)}
                className="px-2.5 py-1 text-[11px] rounded-full font-semibold transition-colors whitespace-nowrap"
                style={{ background: feedRange === "custom" ? "#dc2626" : "#fff", color: feedRange === "custom" ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}
                title="טווח מותאם אישית — כולל כל הזמנים">
                🎚️ סנן{feedRange === "custom" ? ` · ${rangeLabel("custom")}` : ""}
              </button>
            </div>
            {filterOpen && (
              <div className="lf-card p-3 mb-3 flex flex-wrap items-center gap-2 text-[12px]">
                <span style={{ color: "#6b7280" }}>מתאריך:</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 px-2 text-[12px] border rounded-md" style={{ borderColor: "#e5e7eb" }} />
                <span style={{ color: "#6b7280" }}>עד:</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 px-2 text-[12px] border rounded-md" style={{ borderColor: "#e5e7eb" }} />
                <button onClick={() => applyRange("custom")} className="lf-btn lf-btn-dark text-[11px] !py-1.5 !px-3">החל טווח</button>
                <button onClick={applyAllTime} className="lf-btn lf-btn-outline text-[11px] !py-1.5 !px-3">∞ כל הזמנים</button>
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px]" style={{ color: "#9ca3af" }}>
                {total} באזים{activeChip ? ` · ${activeChip}` : ""} על {selected} · {rangeLabel(feedRange)}
              </p>
              <div className="flex items-center gap-1 shrink-0" title="גודל טקסט תתי-הכותרות בפיד">
                <span className="text-[9px]" style={{ color: "#b8bec7" }}>גודל טקסט</span>
                <button onClick={() => bumpFeedTextSize(-1)} className="h-5 px-1.5 rounded border text-[11px] leading-none font-bold" style={{ borderColor: "#e5e7eb", color: "#6b7280", background: "#fff" }}>א−</button>
                <button onClick={() => bumpFeedTextSize(1)} className="h-5 px-1.5 rounded border text-[11px] leading-none font-bold" style={{ borderColor: "#e5e7eb", color: "#6b7280", background: "#fff" }}>א+</button>
              </div>
            </div>

            {/* Feed */}
            {loadingFeed && articles.length === 0 ? (
              <div className="flex items-center justify-center py-12 gap-2.5 text-[13px]" style={{ color: "#6b7280" }}>
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#dc2626", borderTopColor: "transparent" }} />
                טוען באזים…
              </div>
            ) : articles.length === 0 ? (
              <div className="text-center py-10 text-[13px]" style={{ color: "#9ca3af" }}>
                לא נמצאו באזים{activeChip ? ` בנושא "${activeChip}"` : ""} על {selected} ({rangeLabel(feedRange)}).
                <br />
                <button onClick={applyAllTime} className="font-semibold underline mt-1" style={{ color: "#dc2626" }}>הרחב לכל הזמנים ←</button>
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
