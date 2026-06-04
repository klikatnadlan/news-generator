"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SiteNav } from "@/components/site-nav";
import Link from "next/link";

interface HeadlineItem {
  id: string;
  title: string;
  source: string;
  source_url: string;
  score: number;
  scan_date: string;
  published_at?: string;
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

const TAB_TOOLTIPS: Record<string, string> = {
  'נדל"ן': 'כל הכותרות שעוסקות בנדל״ן — מחירים, משכנתאות, פינוי-בינוי, רגולציה.',
  "כלכלה": "כותרות מקרו: דולר, אינפלציה, בנק ישראל, בורסה, אבטלה.",
  "הייטק": "סטארטאפים, גיוסים, אקזיטים, AI, חברות ישראליות במכירה.",
  "נרטיב": "AI מזהה סיפורים שחוזרים על עצמם בשבוע/חודש האחרון. דוגמה: '12 כתבות על פינוי-בינוי בגוש דן'. בוחרים קטגוריה + טווח זמן ומקבלים סיכום של נרטיבים מובילים + chips של נושאים חמים (פיטורים/גיוסים/אקזיט וכו').",
};

// Preset topics per category — clicking a chip narrows narrative analysis
// to headlines matching those keywords (backed by TOPIC_KEYWORDS in /api/narratives)
const PRESET_TOPICS: Record<string, { emoji: string; label: string }[]> = {
  "הייטק": [
    { emoji: "💼", label: "פיטורים" },
    { emoji: "🚀", label: "גיוסים" },
    { emoji: "💰", label: "אקזיט" },
    { emoji: "🤖", label: "AI" },
    { emoji: "📈", label: "הנפקה" },
  ],
  'נדל"ן': [
    { emoji: "🏗️", label: "פינוי בינוי" },
    { emoji: "💸", label: "משכנתאות" },
    { emoji: "🏘️", label: "מחיר למשתכן" },
    { emoji: "📊", label: "מחירי דירות" },
    { emoji: "🧱", label: "בנייה" },
  ],
  "כלכלה": [
    { emoji: "💵", label: 'דולר/מט"ח' },
    { emoji: "📊", label: "אינפלציה" },
    { emoji: "🏦", label: "בנקים" },
    { emoji: "📉", label: "בורסה" },
  ],
};

// Keyword bank for the headline-list topic filter (client-side). Mirrors the
// TOPIC_KEYWORDS in /api/narratives so a chip behaves the same in both places.
// Broad stems on purpose — Hebrew prefixes (ב/ה/ל/ו) and verb conjugations
// mean exact words miss a lot (e.g. "ברכישה" wouldn't match "רכשה").
const TOPIC_KEYWORDS: Record<string, string[]> = {
  "פיטורים": ["פיטור", "פיטר", "מפטר", "פוטר", "מפוטר", "צמצומ", "קיצוצ", "פרישה", "התייעלות"],
  "גיוסים": ["גיוס", "גייס", "מגייס", "סבב", "השקע", "ישקיע", "מימון", "Series", "הון סיכון", "מיליון דולר", "מיליארד"],
  "אקזיט": ["אקזיט", "exit", "נמכר", "מכר", "רכיש", "נרכש", "רכש", "מיזוג", "עסקת ענק", "שווי של"],
  "AI": ["AI", "בינה מלאכותית", "GPT", "OpenAI", "Anthropic", "צ'אטבוט", "מודל שפה", "LLM", "אינטל", "אנבידיה", "nvidia", "שבב", "צ'יפ"],
  "הנפקה": ["הנפק", "IPO", "תשקיף", "הנפיק"],
  "פינוי בינוי": ["פינוי בינוי", "פינוי-בינוי", "התחדשות עירונית", "תמ\"א", "פינוי-בינוי"],
  "משכנתאות": ["משכנתא", "ריבית", "זכאות", "תמהיל", "מחזור משכנתא", "הלוואת"],
  "מחיר למשתכן": ["מחיר למשתכן", "מחיר מטרה", "דירה בהנחה", "הגרל", "זכאי", "סבסוד"],
  "מחירי דירות": ["מחירי דירות", "מדד מחירי", "מחיר דירה", "המחירים", "עסקת", "נמכר", "התייקר", "ירידת מחיר", "עליית מחיר"],
  "בנייה": ["התחלות בנייה", "היתרי בנייה", "סיומי בנייה", "מכרז", "קבלן", "יזם", "פרויקט", "בנייה"],
  'דולר/מט"ח': ["דולר", "מט\"ח", "שקל", "אירו", "מטבע", "פיחות", "תיסוף"],
  "אינפלציה": ["אינפלציה", "מדד המחירים", "יוקר המחיה", "מדד מחירים", "התייקרות"],
  "בנקים": ["בנק", "אשראי", "פיקדון", "בנק ישראל", "ריבית"],
  "בורסה": ["בורסה", "מניות", "מניה", "מדד ת\"א", "ת\"א 35", "ת\"א 125", "מסחר", "ני\"ע"],
};

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
  // Selected preset topic (filters narratives by keyword)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  // Topic filter for the HEADLINE LIST (separate from the narrative one above)
  const [headlineTopic, setHeadlineTopic] = useState<string | null>(null);

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

  // Smart default: if today has no headlines yet but the week does, show the
  // whole week so the page never looks empty on landing. Runs once after load.
  const [autoSwitchedDay, setAutoSwitchedDay] = useState(false);
  useEffect(() => {
    if (autoSwitchedDay || loading || allNews.length === 0) return;
    const today = new Date().toISOString().split("T")[0];
    const todayCount = allNews.filter((n) => n.scan_date === today).length;
    if (selectedDay === "היום" && todayCount === 0) setSelectedDay("הכל");
    setAutoSwitchedDay(true);
  }, [autoSwitchedDay, loading, allNews, selectedDay]);

  const fetchNarratives = async (category?: string, range?: NarrativeRange, topic?: string | null) => {
    setNarrativesLoading(true);
    try {
      const cat = category || lastCategory;
      const r = range || narrativeRange || "week";
      const t = topic !== undefined ? topic : selectedTopic;
      const params = new URLSearchParams({ category: cat, range: r as string });
      if (t) params.set("topic", t);
      const res = await fetch(`/api/narratives?${params.toString()}`);
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
    // Day filter
    if (selectedDay === "היום") { if (item.scan_date !== todayStr) return false; }
    else if (selectedDay !== "הכל") { if (item.scan_date !== selectedDay) return false; }
    // Topic filter (keyword match on title) — only when a chip is selected
    if (headlineTopic && TOPIC_KEYWORDS[headlineTopic]) {
      const t = (item.title || "").toLowerCase();
      const hit = TOPIC_KEYWORDS[headlineTopic].some((k) => t.includes(k.toLowerCase()));
      if (!hit) return false;
    }
    return true;
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
      <SiteNav />

      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* ═══ Category Tabs ═══ */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
          {TAB_CONFIG.map((t) => {
            const isActive = tab === t.id;
            const count = t.id !== "נרטיב" ? categoryCounts[t.id as keyof typeof categoryCounts] : null;
            return (
              <button key={t.id}
                onClick={() => { if (t.id !== "נרטיב") setLastCategory(t.id); setTab(t.id); setSelected(new Set()); setTriggerForId(null); setTriggerText(null); setNarrativeRange(null); setExpandedNarrative(null); setHeadlineTopic(null); }}
                title={TAB_TOOLTIPS[t.id]}
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

          {/* ═══ Topic quick-filter chips (per category) ═══ */}
          {PRESET_TOPICS[tab] && (
            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar">
              <span className="text-[10px] shrink-0 ml-1" style={{ color: "#9ca3af" }}>נושאים:</span>
              {PRESET_TOPICS[tab].map((t) => {
                const active = headlineTopic === t.label;
                return (
                  <button
                    key={t.label}
                    onClick={() => { setHeadlineTopic(active ? null : t.label); setSelected(new Set()); }}
                    className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                    style={{ background: active ? tabConfig.color : "#fff", color: active ? "#fff" : "#6b7280", border: `1px solid ${active ? tabConfig.color : "#e5e7eb"}` }}>
                    {t.emoji} {t.label}
                  </button>
                );
              })}
              {headlineTopic && (
                <button
                  onClick={() => { setHeadlineTopic(null); setSelected(new Set()); }}
                  className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 whitespace-nowrap shrink-0"
                  style={{ color: "#9ca3af" }}>
                  ✕ נקה
                </button>
              )}
            </div>
          )}

          <p className="text-[11px] mb-3" style={{ color: "#9ca3af" }}>
            {filteredNews.length} כותרות {tab}
            {headlineTopic && <span className="font-semibold" style={{ color: tabConfig.color }}> · {headlineTopic}</span>}
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
            <div className="space-y-4">
              <div className="text-center max-w-md mx-auto">
                <p className="text-[18px] font-bold mb-2" style={{ color: "#0f1419" }}>
                  מה רץ ב{lastCategory} השבוע?
                </p>
                <p className="text-[13px] leading-[1.5]" style={{ color: "#6b7280" }}>
                  Claude סורק את כל הכתבות בטווח שבחרת ומחזיר את הסיפורים שחזרו ביותר ממקור אחד — מה הנושאים החמים, כמה כתבות, ומי כיסה.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button className="lf-card p-5 text-center hover:border-red-300 hover:shadow-md transition-all" onClick={() => { setNarrativeRange("week"); fetchNarratives(lastCategory, "week"); }}>
                  <p className="text-[28px] mb-1">📅</p>
                  <p className="text-[14px] font-bold" style={{ color: "#0f1419" }}>שבוע אחרון</p>
                  <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>7 ימים · ~10 שניות</p>
                </button>
                <button className="lf-card p-5 text-center hover:border-red-300 hover:shadow-md transition-all" onClick={() => { setNarrativeRange("month"); fetchNarratives(lastCategory, "month"); }}>
                  <p className="text-[28px] mb-1">📊</p>
                  <p className="text-[14px] font-bold" style={{ color: "#0f1419" }}>חודש אחרון</p>
                  <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>30 ימים · ~20 שניות</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Show narratives */}
          {narrativeRange && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <button className="text-[11px] px-2 py-0.5 rounded hover:bg-gray-100" style={{ color: "#9ca3af" }} onClick={() => { setNarrativeRange(null); setNarratives([]); setExpandedNarrative(null); setSelectedTopic(null); }}>
                    ← חזרה
                  </button>
                  <p className="text-[13px] font-bold" style={{ color: "#0f1419" }}>
                    נרטיבים — {lastCategory} ({narrativeRange === "week" ? "שבוע" : "חודש"})
                    {selectedTopic && <span style={{ color: "#dc2626" }}> · {selectedTopic}</span>}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {narratives.length > 0 && (
                    <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2" onClick={copyNarratives}>
                      {narrativesCopyLabel || "📋 העתק"}
                    </button>
                  )}
                  <button className="lf-btn lf-btn-dark text-[11px] !py-1 !px-2" onClick={() => fetchNarratives(lastCategory, narrativeRange, selectedTopic)} disabled={narrativesLoading}>
                    {narrativesLoading ? "⏳" : "🔄"}
                  </button>
                </div>
              </div>

              {/* Preset topic chips — quick narrative focus per category */}
              {PRESET_TOPICS[lastCategory] && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  <button
                    onClick={() => { setSelectedTopic(null); fetchNarratives(lastCategory, narrativeRange, null); }}
                    className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                    style={{ background: !selectedTopic ? "#dc2626" : "transparent", color: !selectedTopic ? "#fff" : "#6b7280", border: `1px solid ${!selectedTopic ? "#dc2626" : "#e5e7eb"}` }}>
                    הכל
                  </button>
                  {PRESET_TOPICS[lastCategory].map((t) => (
                    <button
                      key={t.label}
                      onClick={() => { setSelectedTopic(t.label); fetchNarratives(lastCategory, narrativeRange, t.label); }}
                      className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                      style={{ background: selectedTopic === t.label ? "#dc2626" : "transparent", color: selectedTopic === t.label ? "#fff" : "#6b7280", border: `1px solid ${selectedTopic === t.label ? "#dc2626" : "#e5e7eb"}` }}>
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              )}

              {narrativesLoading && narratives.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#dc2626", borderTopColor: "transparent" }} />
                  <div className="text-center max-w-xs">
                    <p className="text-[13px] font-bold" style={{ color: "#0f1419" }}>Claude סורק כותרות ומחפש דפוסים…</p>
                    <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>סיפורים שחוזרים ב-2+ מקורות עולים. ~{narrativeRange === "month" ? "20" : "10"} שניות.</p>
                  </div>
                </div>
              ) : narratives.length === 0 ? (
                <div className="text-center py-12" style={{ color: "#9ca3af" }}>
                  <p className="text-[13px]">
                    {selectedTopic
                      ? `אין מספיק כותרות בנושא "${selectedTopic}" ב${narrativeRange === "month" ? "חודש האחרון" : "שבוע האחרון"}`
                      : `אין מספיק כותרות לזיהוי נרטיבים ב${narrativeRange === "month" ? "חודש האחרון" : "שבוע האחרון"}`}
                  </p>
                  {selectedTopic && (
                    <button className="text-[12px] mt-2 underline" style={{ color: "#dc2626" }} onClick={() => { setSelectedTopic(null); fetchNarratives(lastCategory, narrativeRange, null); }}>
                      נסה ללא סינון נושא
                    </button>
                  )}
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
                              onTrigger={() => triggerSingleAI(article)} triggerLoading={triggerLoading && triggerForId === article.id} showDate />
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

function formatItemDate(item: HeadlineItem): string {
  const raw = item.published_at || item.scan_date;
  if (!raw) return "";
  const d = new Date(raw.length <= 10 ? raw + "T12:00:00" : raw);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

function HeadlineRow({ item, selected, onToggle, onCopy, getColor, accentColor, onTrigger, triggerLoading, showDate }: {
  item: HeadlineItem;
  selected: boolean;
  onToggle: (id: string) => void;
  onCopy: (item: HeadlineItem, e: React.MouseEvent) => void;
  getColor: (s: string) => string;
  accentColor: string;
  onTrigger?: () => void;
  triggerLoading?: boolean;
  showDate?: boolean;
}) {
  const srcColor = getColor(item.source);
  const dateLabel = showDate ? formatItemDate(item) : "";
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
        {dateLabel && (
          <span className="text-[10px] inline-flex items-center gap-1 mt-1" style={{ color: "#9ca3af" }}>
            🗓️ פורסם {dateLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded" style={{ color: srcColor, background: srcColor + "12" }}>{item.source}</span>
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] font-semibold hover:underline px-1 py-0.5 rounded"
            style={{ color: "#0071e3" }} onClick={(e) => e.stopPropagation()} title="פתח את הכתבה המקורית">
            מקור ←
          </a>
        )}
        {onTrigger && (
          <button className="text-[10px] hover:bg-red-50 rounded px-1 py-0.5 font-semibold" style={{ color: "#dc2626" }}
            onClick={(e) => { e.stopPropagation(); onTrigger(); }} disabled={triggerLoading} title="צור מסגרת מהכותרת">
            {triggerLoading ? "⏳" : "⚡"}
          </button>
        )}
        <button className="text-[10px] hover:bg-gray-100 rounded px-1 py-0.5" style={{ color: "#9ca3af" }}
          onClick={(e) => onCopy(item, e)} title="העתק כותרת">📋</button>
      </div>
    </div>
  );
}
