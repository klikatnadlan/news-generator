"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface HeadlineItem {
  id: string;
  title: string;
  source: string;
  source_url: string;
  score: number;
  scan_date: string;
  category?: string;
}

interface Narrative {
  title: string;
  count: number;
  summary: string;
  sources: string[];
}

const SOURCE_COLORS: Record<string, string> = {
  "גלובס": "#0066cc",
  "כלכליסט": "#c0392b",
  "דה מרקר": "#16a34a",
  "ynet": "#dc2626",
  "מעריב": "#1e3a5f",
  "ביזפורטל": "#d97706",
  "וואלה": "#0284c7",
  "ישראל היום": "#1d4ed8",
  "ICE": "#0ea5e9",
  'מרכז הנדל"ן': "#7c3aed",
  "מגדילים": "#059669",
  "מדלן": "#7c3aed",
  "הומלס": "#dc2626",
};

function getColor(source: string) {
  for (const [k, v] of Object.entries(SOURCE_COLORS)) {
    if (source.includes(k)) return v;
  }
  return "#6b7280";
}

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function getHebrewDay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return DAYS[d.getDay()];
}

type MainTab = "נדל\"ן" | "כלכלה" | "הייטק" | "נרטיב";

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
  const [triggerText, setTriggerText] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState("היום");
  const [tab, setTab] = useState<MainTab>('נדל"ן');
  const [lastCategory, setLastCategory] = useState<string>('נדל"ן');
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [narrativesLoading, setNarrativesLoading] = useState(false);
  const [narrativesCopyLabel, setNarrativesCopyLabel] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/week-all");
      const data = await res.json();
      setAllNews(data.news || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const fetchNarratives = async (category?: string) => {
    setNarrativesLoading(true);
    try {
      const cat = category || lastCategory;
      const res = await fetch(`/api/narratives?category=${encodeURIComponent(cat)}`);
      const data = await res.json();
      setNarratives(data.narratives || []);
    } finally {
      setNarrativesLoading(false);
    }
  };

  // When switching to נרטיב, auto-fetch for last active category
  useEffect(() => {
    if (tab === "נרטיב") {
      fetchNarratives(lastCategory);
    }
  }, [tab, lastCategory]);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayDay = DAYS[new Date().getDay()];
  const dayOrder = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"];

  // Filter by category
  const categoryNews = allNews.filter((item) => {
    if (tab === "נרטיב") return false;
    return item.category === tab;
  });

  // Filter by day
  const filteredNews = categoryNews.filter((item) => {
    if (selectedDay === "הכל") return true;
    if (selectedDay === "היום") return item.scan_date === todayStr;
    const itemDay = getHebrewDay(item.scan_date);
    return itemDay === selectedDay;
  });

  // Category counts for badges
  const categoryCounts = {
    'נדל"ן': allNews.filter(n => n.category === 'נדל"ן').length,
    "כלכלה": allNews.filter(n => n.category === "כלכלה").length,
    "הייטק": allNews.filter(n => n.category === "הייטק").length,
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredNews.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredNews.map((n) => n.id)));
    }
  };

  const copySelected = async () => {
    const selectedItems = filteredNews.filter((n) => selected.has(n.id));
    const text = selectedItems.map((n) => `• ${n.title} (${n.source})`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopyLabel("✓ הועתק");
    setTimeout(() => setCopyLabel(null), 1500);
  };

  const copySingle = async (item: HeadlineItem, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(`${item.title} (${item.source})`);
  };

  const triggerAI = async () => {
    const selectedItems = filteredNews.filter((n) => selected.has(n.id));
    if (selectedItems.length === 0) return;
    setTriggerLoading(true);
    setTriggerText(null);
    try {
      const res = await fetch("/api/headlines-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headlines: selectedItems.map((h) => ({ title: h.title, source: h.source })) }),
      });
      const data = await res.json();
      setTriggerText(data.text || data.error || "שגיאה");
    } finally {
      setTriggerLoading(false);
    }
  };

  const copyNarratives = async () => {
    const text = narratives.map((n) => `📌 ${n.title} (${n.count} כתבות)\n${n.summary}\nמקורות: ${n.sources.join(", ")}`).join("\n\n");
    await navigator.clipboard.writeText(text);
    setNarrativesCopyLabel("✓ הועתק");
    setTimeout(() => setNarrativesCopyLabel(null), 1500);
  };

  // Group by day
  const groupedByDay = filteredNews.reduce<Record<string, HeadlineItem[]>>((acc, item) => {
    const day = getHebrewDay(item.scan_date);
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});

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
              <button
                key={t.id}
                onClick={() => { if (t.id !== "נרטיב") setLastCategory(t.id); setTab(t.id); setSelected(new Set()); }}
                className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold rounded-lg transition-all whitespace-nowrap shrink-0"
                style={{
                  background: isActive ? t.color : "#fff",
                  color: isActive ? "#fff" : "#6b7280",
                  border: `1.5px solid ${isActive ? t.color : "#e5e7eb"}`,
                }}
              >
                <span>{t.emoji}</span>
                <span>{t.label}</span>
                {count !== null && count > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{
                    background: isActive ? "rgba(255,255,255,0.2)" : "#f3f4f6",
                    color: isActive ? "#fff" : "#9ca3af",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ═══ HEADLINES TABS (נדל"ן / כלכלה / הייטק) ═══ */}
        {isHeadlinesTab && (
          <>
            {/* Day filter */}
            <div className="flex items-center gap-1 mb-3 overflow-x-auto no-scrollbar">
              {["היום", ...dayOrder, "הכל"].map((day) => (
                <button
                  key={day}
                  onClick={() => { setSelectedDay(day); setSelected(new Set()); }}
                  className="px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap shrink-0 font-medium"
                  style={{
                    background: selectedDay === day ? tabConfig.color : "transparent",
                    color: selectedDay === day ? "#fff" : "var(--lf-text-tertiary, #9ca3af)",
                    border: `1px solid ${selectedDay === day ? tabConfig.color : "var(--lf-border, #e5e7eb)"}`,
                  }}
                >
                  {day === "היום" ? `היום (${todayDay})` : day}
                </button>
              ))}
              <button
                onClick={selectAll}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg hover:bg-gray-100 whitespace-nowrap shrink-0 mr-auto"
                style={{ color: "var(--lf-text-secondary, #6b7280)" }}
              >
                {selected.size === filteredNews.length && filteredNews.length > 0 ? "בטל הכל" : "בחר הכל"}
              </button>
            </div>

            <p className="text-[11px] mb-3" style={{ color: "#9ca3af" }}>
              {filteredNews.length} כותרות {tab}
              {selectedDay !== "הכל" && selectedDay !== "היום" ? ` ליום ${selectedDay}` : selectedDay === "היום" ? " להיום" : " השבוע"}
              {selected.size > 0 && <span className="font-semibold" style={{ color: tabConfig.color }}> · {selected.size} נבחרו</span>}
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: tabConfig.color, borderTopColor: "transparent" }} />
              </div>
            ) : selectedDay === "הכל" ? (
              <div className="space-y-4">
                {dayOrder.filter((d) => groupedByDay[d]?.length).map((day) => (
                  <div key={day}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: tabConfig.color }}>יום {day}</span>
                      <span className="text-[10px]" style={{ color: "#9ca3af" }}>{groupedByDay[day].length} כותרות</span>
                      <div className="flex-1 h-px" style={{ background: "#e5e7eb" }} />
                    </div>
                    <div className="space-y-1">
                      {groupedByDay[day].map((item) => (
                        <HeadlineRow key={item.id} item={item} selected={selected.has(item.id)} onToggle={toggleSelect} onCopy={copySingle} getColor={getColor} accentColor={tabConfig.color} />
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(groupedByDay).length === 0 && (
                  <div className="text-center py-12" style={{ color: "#9ca3af" }}>
                    <p className="text-[13px]">אין כותרות {tab} השבוע</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredNews.map((item) => (
                  <HeadlineRow key={item.id} item={item} selected={selected.has(item.id)} onToggle={toggleSelect} onCopy={copySingle} getColor={getColor} accentColor={tabConfig.color} />
                ))}
                {filteredNews.length === 0 && (
                  <div className="text-center py-12" style={{ color: "#9ca3af" }}>
                    <p className="text-[13px]">אין כותרות {tab} ליום {selectedDay === "היום" ? "הזה" : selectedDay}</p>
                    <button className="text-[12px] mt-2 underline" style={{ color: tabConfig.color }} onClick={() => setSelectedDay("הכל")}>הצג את כל השבוע</button>
                  </div>
                )}
              </div>
            )}

            {/* Floating bar */}
            {selected.size > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-50 lf-glass">
                <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
                  <button className="lf-btn lf-btn-dark flex-1 !py-2.5 text-[12px] font-bold" onClick={copySelected}>
                    {copyLabel || `📋 העתק ${selected.size} כותרות`}
                  </button>
                  <button
                    className="lf-btn flex-1 !py-2.5 text-[12px] font-bold text-white"
                    style={{ background: tabConfig.color }}
                    onClick={triggerAI}
                    disabled={triggerLoading}
                  >
                    {triggerLoading ? "⏳ מייצר..." : `🎯 טריגר — מסגרת`}
                  </button>
                </div>
              </div>
            )}

            {/* Trigger result */}
            {triggerText && (
              <div className="lf-card p-4 mt-4 mb-20" style={{ borderRight: `3px solid ${tabConfig.color}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-bold" style={{ color: "#0f1419" }}>מסגרת להודעה — {tab}</span>
                  <div className="flex gap-1.5">
                    <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2" onClick={async () => { await navigator.clipboard.writeText(triggerText); }}>העתק</button>
                    <button className="text-[11px] w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-200" style={{ color: "#9ca3af" }} onClick={() => setTriggerText(null)}>✕</button>
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-[13px] leading-[1.7] p-3 rounded-lg" style={{ background: "#f9fafb" }} dir="rtl">
                  {triggerText}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ NARRATIVE TAB ═══ */}
        {tab === "נרטיב" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-bold" style={{ color: "#0f1419" }}>
                נרטיבים שרצו השבוע — {lastCategory}
              </p>
              <div className="flex gap-1.5">
                {narratives.length > 0 && (
                  <button className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2" onClick={copyNarratives}>
                    {narrativesCopyLabel || "📋 העתק הכל"}
                  </button>
                )}
                <button className="lf-btn lf-btn-dark text-[11px] !py-1 !px-2" onClick={() => fetchNarratives(lastCategory)} disabled={narrativesLoading}>
                  {narrativesLoading ? "⏳ מנתח..." : "🔄 עדכן"}
                </button>
              </div>
            </div>

            {narrativesLoading && narratives.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#dc2626", borderTopColor: "transparent" }} />
                <p className="text-[12px]" style={{ color: "#9ca3af" }}>מנתח נרטיבים מ-{allNews.length} כותרות...</p>
              </div>
            ) : narratives.length === 0 ? (
              <div className="text-center py-12" style={{ color: "#9ca3af" }}>
                <p className="text-[13px]">אין מספיק כותרות לזיהוי נרטיבים</p>
              </div>
            ) : (
              narratives.map((n, i) => (
                <div key={i} className="lf-card p-4" style={{ borderRight: "3px solid #dc2626" }}>
                  <div className="flex items-start justify-between mb-1.5">
                    <h3 className="text-[15px] font-bold leading-[1.3]" style={{ color: "#0f1419" }}>
                      {n.title}
                    </h3>
                    <span className="text-[20px] font-extrabold shrink-0 mr-3" style={{ color: "#dc2626", fontFamily: "DM Sans" }}>
                      {n.count}
                    </span>
                  </div>
                  <p className="text-[12px] leading-[1.5] mb-2" style={{ color: "#6b7280" }}>
                    {n.summary}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {n.sources.map((s, si) => {
                      const c = getColor(s);
                      return (
                        <span key={si} className="text-[9px] font-semibold px-1.5 py-[1px] rounded" style={{ color: c, background: c + "12" }}>
                          {s}
                        </span>
                      );
                    })}
                    <span className="text-[10px] mr-auto" style={{ color: "#9ca3af" }}>
                      {n.count} כתבות
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HeadlineRow({ item, selected, onToggle, onCopy, getColor, accentColor }: {
  item: HeadlineItem;
  selected: boolean;
  onToggle: (id: string) => void;
  onCopy: (item: HeadlineItem, e: React.MouseEvent) => void;
  getColor: (s: string) => string;
  accentColor: string;
}) {
  const srcColor = getColor(item.source);
  return (
    <div
      className="lf-card flex items-start gap-2.5 p-3 cursor-pointer transition-all"
      style={{ borderRight: selected ? `3px solid ${accentColor}` : "3px solid transparent" }}
      onClick={() => onToggle(item.id)}
    >
      <button
        className="w-[20px] h-[20px] rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
        style={{ borderColor: selected ? accentColor : "#d1d5db", background: selected ? accentColor : "#fff" }}
        onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
      >
        {selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>

      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-bold leading-[1.4]" style={{ color: "#0f1419" }}>
          {item.title}
        </h3>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded" style={{ color: srcColor, background: srcColor + "12" }}>
          {item.source}
        </span>
        <button
          className="text-[10px] hover:bg-gray-100 rounded px-1 py-0.5"
          style={{ color: "#9ca3af" }}
          onClick={(e) => onCopy(item, e)}
          title="העתק כותרת"
        >📋</button>
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] hover:underline"
            style={{ color: "#9ca3af" }}
            onClick={(e) => e.stopPropagation()}
          >←</a>
        )}
      </div>
    </div>
  );
}
