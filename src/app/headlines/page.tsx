"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface HeadlineItem {
  id: string;
  title: string;
  source: string;
  source_url: string;
  score: number;
  scan_date: string;
  summary?: string;
  category?: string;
}

interface Narrative {
  title: string;
  count: number;
  summary: string;
  sources: string[];
}

const SOURCE_COLORS: Record<string, string> = {
  "גלובס": "#0066cc", "כלכליסט": "#c0392b", "דה מרקר": "#16a34a",
  "ynet": "#dc2626", "מעריב": "#1e3a5f", "ביזפורטל": "#d97706",
  "וואלה": "#0284c7", "ישראל היום": "#1d4ed8", "ICE": "#0ea5e9",
  'מרכז הנדל"ן': "#7c3aed", "מגדילים": "#059669", "מדלן": "#7c3aed", "הומלס": "#dc2626",
};

function getColor(source: string) {
  for (const [k, v] of Object.entries(SOURCE_COLORS)) {
    if (source.includes(k)) return v;
  }
  return "#6b7280";
}

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
function getHebrewDay(dateStr: string) { return DAYS[new Date(dateStr + "T12:00:00").getDay()]; }

type MainTab = "נדל\"ן" | "כלכלה" | "הייטק" | "נרטיב";
type NarrativeRange = "week" | "month" | null;

const TAB_CONFIG: { id: MainTab; label: string; emoji: string; color: string }[] = [
  { id: 'נדל"ן', label: "נדל\"ן", emoji: "🏠", color: "#1d3557" },
  { id: "כלכלה", label: "כלכלה", emoji: "📊", color: "#059669" },
  { id: "הייטק", label: "הייטק", emoji: "💻", color: "#7c3aed" },
  { id: "נרטיב", label: "נרטיב", emoji: "🔍", color: "#dc2626" },
];

export default function HeadlinesPage() {
  const [allNews, setAllNews] = useState<HeadlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copyLabel, setCopyLabel] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState("היום");
  const [tab, setTab] = useState<MainTab>('נדל"ן');
  const [lastCategory, setLastCategory] = useState<string>('נדל"ן');
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [narrativesLoading, setNarrativesLoading] = useState(false);
  const [narrativesCopyLabel, setNarrativesCopyLabel] = useState<string | null>(null);
  const [narrativeRange, setNarrativeRange] = useState<NarrativeRange>(null);
  // Per-headline trigger state
  const [triggerForId, setTriggerForId] = useState<string | null>(null);
  const [triggerText, setTriggerText] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);
  // Narrative expanded view
  const [expandedNarrative, setExpandedNarrative] = useState<string | null>(null);

  const triggerRef = useRef<HTMLDivElement>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/week-all");
      const data = await res.json();
      setAllNews(data.news || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const fetchNarratives = async (category?: string, range?: NarrativeRange) => {
    setNarrativesLoading(true);
    try {
      const cat = category || lastCategory;
      const r = range || narrativeRange || "week";
      const res = await fetch(`/api/narratives?category=${encodeURIComponent(cat)}&range=${r}`);
      const data = await res.json();
      setNarratives(data.narratives || []);
    } finally { setNarrativesLoading(false); }
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const todayDay = DAYS[new Date().getDay()];

  // Rolling 7-day window going BACKWARD from today (today + 6 past days).
  // Each past day stores the real ISO date, so picking ב' on a Sunday
  // means "last Monday", not "this coming Monday".
  const pastDays = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i - 1);
    return { iso: d.toISOString().split("T")[0], label: DAYS[d.getDay()] };
  });

  const categoryNews = allNews.filter((item) => {
    if (tab === "נרטיב") return false;
    return item.category === tab;
  });

  const filteredNews = categoryNews.filter((item) => {
    if (selectedDay === "הכל") return true;
    if (selectedDay === "היום") return item.scan_date === todayStr;
    return item.scan_date === selectedDay; // ISO date string
  });

  const categoryCounts = {
    'נדל"ן': allNews.filter(n => n.category === 'נדל"ן').length,
    "כלכלה": allNews.filter(n => n.category === "כלכלה").length,
    "הייטק": allNews.filter(n => n.category === "הייטק").length,
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const selectAll = () => {
    selected.size === filteredNews.length ? setSelected(new Set()) : setSelected(new Set(filteredNews.map(n => n.id)));
  };

  const copySelected = async () => {
    const items = filteredNews.filter(n => selected.has(n.id));
    await navigator.clipboard.writeText(items.map(n => `• ${n.title} (${n.source})`).join("\n"));
    setCopyLabel("✓ הועתק");
    setTimeout(() => setCopyLabel(null), 1500);
  };

  const copySingle = async (item: HeadlineItem, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(`${item.title} (${item.source})`);
  };

  // Trigger AI on a SINGLE headline — result shows on that headline
  const triggerSingleAI = async (item: HeadlineItem) => {
    setTriggerForId(item.id);
    setTriggerLoading(true);
    setTriggerText(null);
    try {
      const res = await fetch("/api/headlines-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headlines: [{ title: item.title, source: item.source }] }),
      });
      const data = await res.json();
      setTriggerText(data.text || data.error || "שגיאה");
      // Scroll to result
      setTimeout(() => triggerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    } finally { setTriggerLoading(false); }
  };

  // Trigger AI on selected headlines
  const triggerMultiAI = async () => {
    const items = filteredNews.filter(n => selected.has(n.id));
    if (items.length === 0) return;
    setTriggerForId("multi");
    setTriggerLoading(true);
    setTriggerText(null);
    try {
      const res = await fetch("/api/headlines-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headlines: items.map(h => ({ title: h.title, source: h.source })) }),
      });
      const data = await res.json();
      setTriggerText(data.text || data.error || "שגיאה");
    } finally { setTriggerLoading(false); }
  };

  const copyNarratives = async () => {
    await navigator.clipboard.writeText(narratives.map(n => `📌 ${n.title} (${n.count} כתבות)\n${n.summary}\nמקורות: ${n.sources.join(", ")}`).join("\n\n"));
    setNarrativesCopyLabel("✓ הועתק");
    setTimeout(() => setNarrativesCopyLabel(null), 1500);
  };

  const groupedByDate = filteredNews.reduce<Record<string, HeadlineItem[]>>((acc, item) => {
    if (!item.scan_date) return acc;
    if (!acc[item.scan_date]) acc[item.scan_date] = [];
    acc[item.scan_date].push(item);
    return acc;
  }, {});

  // Get articles matching a narrative title (fuzzy match by keywords)
  const getArticlesForNarrative = (narrativeTitle: string): HeadlineItem[] => {
    const words = narrativeTitle.split(/\s+/).filter(w => w.length > 2);
    return allNews.filter(item => {
      const title = item.title.toLowerCase();
      return words.some(w => title.includes(w.toLowerCase()));
    }).slice(0, 20);
  };

  const isHeadlinesTab = tab !== "נרטיב";
  const tabConfig = TAB_CONFIG.find(t => t.id === tab)!;

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      <header className="lf-header">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-12">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-[14px] font-extrabold text-white tracking-tight" style={{ fontFamily: "DM Sans, system-ui" }}>לידרפיד</Link>
            <span className="text-[10px] text-white/30">|</span>
            <span className="text-[10px] text-white/40">כותרות</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/" className="text-[12px] text-white/60 hover:text-white transition-colors">ראשי</Link>
            <Link href="/dashboard" className="text-[12px] text-white/60 hover:text-white transition-colors">לוח בקרה</Link>
            <Link href="/archive" className="text-[12px] text-white/60 hover:text-white transition-colors">ארכיון</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* ═══ Category Tabs ═══ */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
          {TAB_CONFIG.map((t) => {
            const isActive = tab === t.id;
            const count = t.id !== "נרטיב" ? categoryCounts[t.id as keyof typeof categoryCounts] : null;
            return (
              <button key={t.id}
                onClick={() => { if (t.id !== "נרטיב") setLastCategory(t.id); setTab(t.id); setSelected(new Set()); setTriggerForId(null); setTriggerText(null); setNarrativeRange(null); setExpandedNarrative(null); }}
                className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold rounded-lg transition-all whitespace-nowrap shrink-0"
                style={{ background: isActive ? t.color : "#fff", color: isActive ? "#fff" : "#6b7280", border: `1.5px solid ${isActive ? t.color : "#e5e7eb"}` }}>
                <span>{t.emoji}</span><span>{t.label}</span>
                {count !== null && count > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: isActive ? "rgba(255,255,255,0.2)" : "#f3f4f6", color: isActive ? "#fff" : "#9ca3af" }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ═══ HEADLINES TABS ═══ */}
        {isHeadlinesTab && (<>
          <div className="flex items-center gap-1 mb-3 overflow-x-auto no-scrollbar">
            <button
              key="היום"
              onClick={() => { setSelectedDay("היום"); setSelected(new Set()); }}
              className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
              style={{ background: selectedDay === "היום" ? tabConfig.color : "transparent", color: selectedDay === "היום" ? "#fff" : "#9ca3af", border: `1px solid ${selectedDay === "היום" ? tabConfig.color : "#e5e7eb"}` }}>
              היום ({todayDay})
            </button>
            {pastDays.map((d) => (
              <button
                key={d.iso}
                onClick={() => { setSelectedDay(d.iso); setSelected(new Set()); }}
                className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                style={{ background: selectedDay === d.iso ? tabConfig.color : "transparent", color: selectedDay === d.iso ? "#fff" : "#9ca3af", border: `1px solid ${selectedDay === d.iso ? tabConfig.color : "#e5e7eb"}` }}>
                {d.label}
              </button>
            ))}
            <button
              key="הכל"
              onClick={() => { setSelectedDay("הכל"); setSelected(new Set()); }}
              className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
              style={{ background: selectedDay === "הכל" ? tabConfig.color : "transparent", color: selectedDay === "הכל" ? "#fff" : "#9ca3af", border: `1px solid ${selectedDay === "הכל" ? tabConfig.color : "#e5e7eb"}` }}>
              הכל
            </button>
            <button onClick={selectAll} className="text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-gray-100 whitespace-nowrap shrink-0 mr-auto" style={{ color: "#6b7280" }}>
              {selected.size === filteredNews.length && filteredNews.length > 0 ? "בטל הכל" : "בחר הכל"}
            </button>
          </div>

          <p className="text-[11px] mb-3" style={{ color: "#9ca3af" }}>
            {filteredNews.length} כותרות {tab}
            {selectedDay === "היום"
              ? " להיום"
              : selectedDay === "הכל"
                ? " ב-7 ימים אחרונים"
                : ` ליום ${getHebrewDay(selectedDay)} (${new Date(selectedDay + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })})`}
            {selected.size > 0 && <span className="font-semibold" style={{ color: tabConfig.color }}> · {selected.size} נבחרו</span>}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: tabConfig.color, borderTopColor: "transparent" }} />
            </div>
          ) : (
            <div className="space-y-1">
              {(selectedDay === "הכל"
                ? Object.keys(groupedByDate).sort().reverse().flatMap(iso => [
                    { type: "header" as const, iso, day: DAYS[new Date(iso + "T12:00:00").getDay()], count: groupedByDate[iso].length },
                    ...groupedByDate[iso].map(item => ({ type: "item" as const, item })),
                  ])
                : filteredNews.map(item => ({ type: "item" as const, item }))
              ).map((entry, idx) => {
                if (entry.type === "header") {
                  return (
                    <div key={`h-${entry.iso}`} className="flex items-center gap-2 mb-2 mt-3 first:mt-0">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: tabConfig.color }}>יום {entry.day} · {new Date(entry.iso + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}</span>
                      <span className="text-[10px]" style={{ color: "#9ca3af" }}>{entry.count} כותרות</span>
                      <div className="flex-1 h-px" style={{ background: "#e5e7eb" }} />
                    </div>
                  );
                }
                const item = entry.item!;
                const isThisTrigger = triggerForId === item.id;
                return (
                  <div key={item.id}>
                    <HeadlineRow item={item} selected={selected.has(item.id)} onToggle={toggleSelect} onCopy={copySingle} getColor={getColor} accentColor={tabConfig.color}
                      onTrigger={() => triggerSingleAI(item)} triggerLoading={triggerLoading && isThisTrigger} />
                    {/* Trigger result appears RIGHT BELOW this headline */}
                    {isThisTrigger && triggerText && (
                      <div ref={triggerRef} className="lf-card p-3 mb-1 lf-animate" style={{ borderRight: `3px solid ${tabConfig.color}`, marginTop: "-1px" }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12px] font-bold" style={{ color: "#0f1419" }}>מסגרת</span>
                          <div className="flex gap-1">
                            <button className="lf-btn lf-btn-outline text-[10px] !py-0.5 !px-2" onClick={async () => { await navigator.clipboard.writeText(triggerText); }}>העתק</button>
                            <button className="text-[10px] w-5 h-5 rounded-full flex items-center justify-center hover:bg-gray-200" style={{ color: "#9ca3af" }} onClick={() => { setTriggerForId(null); setTriggerText(null); }}>✕</button>
                          </div>
                        </div>
                        <div className="whitespace-pre-wrap text-[12px] leading-[1.6] p-2 rounded" style={{ background: "#f9fafb" }} dir="rtl">{triggerText}</div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredNews.length === 0 && (
                <div className="text-center py-12" style={{ color: "#9ca3af" }}>
                  <p className="text-[13px]">
                    אין כותרות {tab} {selectedDay === "היום"
                      ? "להיום"
                      : `ליום ${getHebrewDay(selectedDay)} (${new Date(selectedDay + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })})`}
                  </p>
                  <button className="text-[12px] mt-2 underline" style={{ color: tabConfig.color }} onClick={() => setSelectedDay("הכל")}>הצג את הכל</button>
                </div>
              )}
            </div>
          )}

          {/* Floating bar for multi-select */}
          {selected.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-50 lf-glass">
              <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
                <button className="lf-btn lf-btn-dark flex-1 !py-2.5 text-[12px] font-bold" onClick={copySelected}>
                  {copyLabel || `📋 העתק ${selected.size} כותרות`}
                </button>
                <button className="lf-btn flex-1 !py-2.5 text-[12px] font-bold text-white" style={{ background: tabConfig.color }}
                  onClick={triggerMultiAI} disabled={triggerLoading}>
                  {triggerLoading && triggerForId === "multi" ? "⏳ מייצר..." : `🎯 טריגר — מסגרת`}
                </button>
              </div>
            </div>
          )}

          {/* Multi-trigger result */}
          {triggerForId === "multi" && triggerText && (
            <div className="lf-card p-4 mt-4 mb-20" style={{ borderRight: `3px solid ${tabConfig.color}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-bold" style={{ color: "#0f1419" }}>מסגרת להודעה — {tab}</span>
                <div className="flex gap-1.5">
                  <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2" onClick={async () => { await navigator.clipboard.writeText(triggerText); }}>העתק</button>
                  <button className="text-[11px] w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-200" style={{ color: "#9ca3af" }} onClick={() => { setTriggerForId(null); setTriggerText(null); }}>✕</button>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-[13px] leading-[1.7] p-3 rounded-lg" style={{ background: "#f9fafb" }} dir="rtl">{triggerText}</div>
            </div>
          )}
        </>)}

        {/* ═══ NARRATIVE TAB ═══ */}
        {tab === "נרטיב" && (<>
          {/* Step 1: Choose time range */}
          {!narrativeRange && (
            <div className="space-y-3">
              <p className="text-[14px] font-bold text-center mb-4" style={{ color: "#0f1419" }}>
                נרטיב {lastCategory} — בחר טווח זמן
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button className="lf-card p-5 text-center hover:border-red-300 transition-all" onClick={() => { setNarrativeRange("week"); fetchNarratives(lastCategory, "week"); }}>
                  <p className="text-[24px] mb-1">📅</p>
                  <p className="text-[14px] font-bold" style={{ color: "#0f1419" }}>שבוע אחרון</p>
                  <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>7 ימים אחרונים</p>
                </button>
                <button className="lf-card p-5 text-center hover:border-red-300 transition-all" onClick={() => { setNarrativeRange("month"); fetchNarratives(lastCategory, "month"); }}>
                  <p className="text-[24px] mb-1">📊</p>
                  <p className="text-[14px] font-bold" style={{ color: "#0f1419" }}>חודש אחרון</p>
                  <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>30 ימים אחרונים</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Show narratives */}
          {narrativeRange && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <button className="text-[11px] px-2 py-0.5 rounded hover:bg-gray-100" style={{ color: "#9ca3af" }} onClick={() => { setNarrativeRange(null); setNarratives([]); setExpandedNarrative(null); }}>
                    ← חזרה
                  </button>
                  <p className="text-[13px] font-bold" style={{ color: "#0f1419" }}>
                    נרטיבים — {lastCategory} ({narrativeRange === "week" ? "שבוע" : "חודש"})
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {narratives.length > 0 && (
                    <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2" onClick={copyNarratives}>
                      {narrativesCopyLabel || "📋 העתק"}
                    </button>
                  )}
                  <button className="lf-btn lf-btn-dark text-[11px] !py-1 !px-2" onClick={() => fetchNarratives(lastCategory, narrativeRange)} disabled={narrativesLoading}>
                    {narrativesLoading ? "⏳" : "🔄"}
                  </button>
                </div>
              </div>

              {narrativesLoading && narratives.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#dc2626", borderTopColor: "transparent" }} />
                  <p className="text-[12px]" style={{ color: "#9ca3af" }}>מנתח נרטיבים...</p>
                </div>
              ) : narratives.length === 0 ? (
                <div className="text-center py-12" style={{ color: "#9ca3af" }}>
                  <p className="text-[13px]">אין מספיק כותרות לזיהוי נרטיבים</p>
                </div>
              ) : (
                narratives.map((n, i) => {
                  const isExpanded = expandedNarrative === n.title;
                  const matchingArticles = isExpanded ? getArticlesForNarrative(n.title) : [];
                  return (
                    <div key={i}>
                      <div className="lf-card p-4 cursor-pointer transition-all" style={{ borderRight: isExpanded ? "3px solid #dc2626" : "3px solid transparent" }}
                        onClick={() => setExpandedNarrative(isExpanded ? null : n.title)}>
                        <div className="flex items-start justify-between mb-1.5">
                          <h3 className="text-[15px] font-bold leading-[1.3]" style={{ color: "#0f1419" }}>{n.title}</h3>
                          <div className="flex items-center gap-2 shrink-0 mr-3">
                            <span className="text-[20px] font-extrabold" style={{ color: "#dc2626", fontFamily: "DM Sans" }}>{n.count}</span>
                            <span className="text-[10px]" style={{ color: "#9ca3af" }}>{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </div>
                        <p className="text-[12px] leading-[1.5] mb-2" style={{ color: "#6b7280" }}>{n.summary}</p>
                        <div className="flex flex-wrap gap-1">
                          {n.sources.map((s, si) => {
                            const c = getColor(s);
                            return <span key={si} className="text-[9px] font-semibold px-1.5 py-[1px] rounded" style={{ color: c, background: c + "12" }}>{s}</span>;
                          })}
                        </div>
                      </div>

                      {/* Expanded: show matching articles as regular feed */}
                      {isExpanded && (
                        <div className="mr-3 border-r-2 pr-3 mt-1 mb-3 space-y-1" style={{ borderColor: "#fecaca" }}>
                          <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#dc2626" }}>{matchingArticles.length} כתבות קשורות</p>
                          {matchingArticles.map(article => (
                            <HeadlineRow key={article.id} item={article} selected={selected.has(article.id)} onToggle={toggleSelect} onCopy={copySingle} getColor={getColor} accentColor="#dc2626"
                              onTrigger={() => triggerSingleAI(article)} triggerLoading={triggerLoading && triggerForId === article.id} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

function HeadlineRow({ item, selected, onToggle, onCopy, getColor, accentColor, onTrigger, triggerLoading }: {
  item: HeadlineItem;
  selected: boolean;
  onToggle: (id: string) => void;
  onCopy: (item: HeadlineItem, e: React.MouseEvent) => void;
  getColor: (s: string) => string;
  accentColor: string;
  onTrigger?: () => void;
  triggerLoading?: boolean;
}) {
  const srcColor = getColor(item.source);
  return (
    <div className="lf-card flex items-start gap-2.5 p-3 cursor-pointer transition-all"
      style={{ borderRight: selected ? `3px solid ${accentColor}` : "3px solid transparent" }}
      onClick={() => onToggle(item.id)}>
      <button className="w-[20px] h-[20px] rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
        style={{ borderColor: selected ? accentColor : "#d1d5db", background: selected ? accentColor : "#fff" }}
        onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}>
        {selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-bold leading-[1.4]" style={{ color: "#0f1419" }}>{item.title}</h3>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded" style={{ color: srcColor, background: srcColor + "12" }}>{item.source}</span>
        {onTrigger && (
          <button className="text-[10px] hover:bg-red-50 rounded px-1 py-0.5 font-semibold" style={{ color: "#dc2626" }}
            onClick={(e) => { e.stopPropagation(); onTrigger(); }} disabled={triggerLoading}>
            {triggerLoading ? "⏳" : "⚡"}
          </button>
        )}
        <button className="text-[10px] hover:bg-gray-100 rounded px-1 py-0.5" style={{ color: "#9ca3af" }}
          onClick={(e) => onCopy(item, e)} title="העתק">📋</button>
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] hover:underline" style={{ color: "#9ca3af" }} onClick={(e) => e.stopPropagation()}>←</a>
        )}
      </div>
    </div>
  );
}
