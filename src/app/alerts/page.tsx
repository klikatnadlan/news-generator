"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { NewsCard } from "@/components/news-card";
import { SiteNav } from "@/components/site-nav";
import type { ScoredNews } from "@/lib/types";

interface Alert {
  id: string;
  name: string;
  emoji: string;
  keywords: string[];
  matchCount: number;
  latestDate: string | null;
  cur7d?: number;
  prev7d?: number;
  trend?: "surge" | "rising" | "cooling" | "";
}

const TREND_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  surge: { label: "🔥 מתפוצץ", color: "#b91c1c", bg: "#fef2f2" },
  rising: { label: "📈 עולה", color: "#047857", bg: "#ecfdf5" },
  cooling: { label: "📉 דועך", color: "#9ca3af", bg: "#f9fafb" },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [articles, setArticles] = useState<Record<string, ScoredNews[]>>({});
  const [loadingArticles, setLoadingArticles] = useState<string | null>(null);
  // How many articles are revealed per alert (reveal in batches so a 100-match
  // alert doesn't flood the screen with full cards at once).
  const PAGE = 8;
  const [visibleCount, setVisibleCount] = useState<Record<string, number>>({});
  // Optional date-range filter per alert (from / to as YYYY-MM-DD)
  const [dateRange, setDateRange] = useState<Record<string, { from: string; to: string }>>({});

  // Add-alert form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [newEmoji, setNewEmoji] = useState("🔔");
  const [adding, setAdding] = useState(false);

  // Weekly AI brief (click only, Sonnet, cached per week)
  const [briefText, setBriefText] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefCached, setBriefCached] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);

  const fetchBrief = async (refresh: boolean) => {
    setBriefLoading(true);
    try {
      const res = await fetch(`/api/weekly-brief${refresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      setBriefText(data.brief || data.error || "שגיאה");
      setBriefCached(!!data.cached);
    } catch {
      setBriefText("לא הצלחנו לייצר את המודיעין כרגע. נסה שוב.");
    } finally {
      setBriefLoading(false);
    }
  };

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Fetch (or re-fetch) an alert's matching articles, optionally bounded by a
  // date range. Resets the reveal count so the newest batch shows first.
  const loadArticles = async (id: string, from?: string, to?: string) => {
    setLoadingArticles(id);
    try {
      const params = new URLSearchParams({ id });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/alerts/articles?${params.toString()}`);
      const data = await res.json();
      setArticles((prev) => ({ ...prev, [id]: data.articles || [] }));
      setVisibleCount((prev) => ({ ...prev, [id]: PAGE }));
    } finally {
      setLoadingArticles(null);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!articles[id]) {
      const r = dateRange[id];
      await loadArticles(id, r?.from, r?.to);
    }
  };

  const applyDateRange = (id: string, from: string, to: string) => {
    setDateRange((prev) => ({ ...prev, [id]: { from, to } }));
    loadArticles(id, from, to);
  };

  const addAlert = async () => {
    const keywords = newKeywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
    if (!newName.trim() || keywords.length === 0) return;
    setAdding(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), keywords, emoji: newEmoji || "🔔" }),
      });
      if (res.ok) {
        setNewName(""); setNewKeywords(""); setNewEmoji("🔔"); setShowForm(false);
        await fetchAlerts();
      }
    } finally {
      setAdding(false);
    }
  };

  const deleteAlert = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("למחוק את המעקב הזה?")) return;
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" }) : "—";

  // Quick-range presets → YYYY-MM-DD
  const todayIso = () => new Date().toISOString().split("T")[0];
  const isoDaysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  };
  // Is a given preset currently the active range for this alert?
  const rangeIs = (id: string, days: number) =>
    dateRange[id]?.to === todayIso() && dateRange[id]?.from === isoDaysAgo(days);

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      <SiteNav />

      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* Intro + add */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-[20px] font-extrabold" style={{ color: "#0f1419" }}>🧠 תודעת השוק</h1>
            <p className="text-[12px] mt-0.5 leading-[1.5]" style={{ color: "#6b7280" }}>
              להבין את דופק ותודעת השוק בלייב ולגזור מזה מהלכים אסטרטגיים הרבה לפני כולם. למה לנחש מהלכים אם אפשר לתכנן?
            </p>
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="lf-btn lf-btn-dark text-[12px] !py-2 !px-3 shrink-0"
          >
            {showForm ? "✕ סגור" : "➕ מעקב חדש"}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="lf-card p-4 mb-4 space-y-2.5">
            <div className="flex gap-2">
              <input
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                className="w-14 text-center text-[18px] border rounded-md h-10"
                style={{ borderColor: "#e5e7eb" }}
                maxLength={2}
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="שם המעקב (למשל: חוק התיווך)"
                className="flex-1 h-10 px-3 text-[13px] border rounded-md focus:outline-none focus:ring-1"
                style={{ borderColor: "#e5e7eb" }}
                dir="rtl"
              />
            </div>
            <textarea
              value={newKeywords}
              onChange={(e) => setNewKeywords(e.target.value)}
              placeholder="מילות מפתח, מופרדות בפסיק (למשל: חוק התיווך, דמי תיווך, תביעת מתווך)"
              className="w-full min-h-[64px] px-3 py-2 text-[13px] border rounded-md focus:outline-none focus:ring-1 resize-none"
              style={{ borderColor: "#e5e7eb" }}
              dir="rtl"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px]" style={{ color: "#9ca3af" }}>
                כל כתבה שמכילה אחת מהמילים תיתפס. אפשר לשנות/למחוק בכל רגע.
              </p>
              <button
                onClick={addAlert}
                disabled={adding || !newName.trim() || !newKeywords.trim()}
                className="lf-btn lf-btn-red text-[13px] !py-2 !px-4 disabled:opacity-40"
              >
                {adding ? "שומר…" : "צור מעקב"}
              </button>
            </div>
          </div>
        )}

        {/* 📊 Weekly AI brief — click only, Sonnet, cached per week (≈1 call/week) */}
        <div className="lf-card p-4 mb-3" style={{ borderRight: "3px solid var(--lf-navy)" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[14px] font-extrabold" style={{ color: "#0f1419" }}>📊 מודיעין שבועי</p>
              <p className="text-[11px] leading-[1.4]" style={{ color: "#9ca3af" }}>בריף אסטרטגי על מה שרץ והשתנה השבוע. נוצר בלחיצה שלך, נשמר לכל השבוע.</p>
            </div>
            <button onClick={() => fetchBrief(!!briefText)} disabled={briefLoading}
              className="lf-btn lf-btn-dark text-[12px] !py-2 !px-3 shrink-0 disabled:opacity-50">
              {briefLoading ? "⏳ מנתח…" : briefText ? "🔄 רענן" : "✨ צור מודיעין"}
            </button>
          </div>
          {briefText && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "#eef0f2" }}>
              <div className="whitespace-pre-wrap text-[13px] leading-[1.7]" style={{ color: "#374151" }} dir="rtl">{briefText}</div>
              <div className="flex items-center gap-2 mt-2.5">
                <button onClick={async () => { await navigator.clipboard.writeText(briefText); setBriefCopied(true); setTimeout(() => setBriefCopied(false), 1500); }}
                  className="lf-btn lf-btn-outline text-[11px] !py-1 !px-2">{briefCopied ? "✓ הועתק" : "📋 העתק"}</button>
                {briefCached && <span className="text-[10px]" style={{ color: "#9ca3af" }}>נשמר מהשבוע · 0 טוקנים</span>}
              </div>
            </div>
          )}
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--lf-navy)", borderTopColor: "transparent" }} />
            <p className="text-[13px]" style={{ color: "#6b7280" }}>טוען מעקבים…</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="text-4xl">🔔</div>
            <p className="text-[15px] font-bold" style={{ color: "#0f1419" }}>עדיין אין מעקבים</p>
            <p className="text-[13px] max-w-sm mx-auto" style={{ color: "#6b7280" }}>
              צור מעקב ראשון (למשל &quot;חוק התיווך&quot;) והמערכת תתפוס לך כל כתבה רלוונטית, אוטומטית.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* 🔥 Trend radar — what's heating up this week vs last (token-free) */}
            {(() => {
              const hot = alerts.filter((a) => a.trend === "surge" || a.trend === "rising");
              if (hot.length === 0) return null;
              return (
                <div className="lf-card p-3.5" style={{ borderRight: "3px solid #dc2626", background: "#fff7f7" }}>
                  <p className="text-[12px] font-extrabold mb-2" style={{ color: "#b91c1c" }}>🔥 מתחמם עכשיו <span className="font-normal" style={{ color: "#9ca3af" }}>· השבוע מול שבוע שעבר</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {hot.map((a) => (
                      <button key={a.id} onClick={() => toggleExpand(a.id)}
                        className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-transform hover:scale-[1.03]"
                        style={{ background: "#fff", border: "1px solid #fecaca", color: "#0f1419" }}
                        title={`${a.cur7d} כתבות השבוע · ${a.prev7d} בשבוע שעבר`}>
                        {a.emoji} {a.name} <span style={{ color: a.trend === "surge" ? "#b91c1c" : "#047857" }}>{a.trend === "surge" ? "🔥" : "📈"} {a.cur7d}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {alerts.map((alert) => {
              const isOpen = expandedId === alert.id;
              return (
                <div key={alert.id}>
                  <div
                    className="lf-card p-4 cursor-pointer transition-all"
                    style={{ borderRight: isOpen ? "3px solid #dc2626" : "3px solid transparent" }}
                    onClick={() => toggleExpand(alert.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[24px] shrink-0">{alert.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-[15px] font-bold leading-tight" style={{ color: "#0f1419" }}>{alert.name}</h3>
                          {alert.trend && TREND_BADGE[alert.trend] && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ color: TREND_BADGE[alert.trend].color, background: TREND_BADGE[alert.trend].bg }}>
                              {TREND_BADGE[alert.trend].label}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] mt-0.5 truncate" style={{ color: "#9ca3af" }}>
                          {alert.keywords.slice(0, 4).join(" · ")}{alert.keywords.length > 4 ? " · …" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-center">
                          <p className="text-[20px] font-extrabold leading-none" style={{ color: "#dc2626", fontFamily: "DM Sans" }}>{alert.matchCount}</p>
                          <p className="text-[9px]" style={{ color: "#9ca3af" }}>כתבות</p>
                        </div>
                        <div className="text-center hidden sm:block">
                          <p className="text-[11px] font-semibold" style={{ color: "#0f1419" }}>{fmtDate(alert.latestDate)}</p>
                          <p className="text-[9px]" style={{ color: "#9ca3af" }}>אחרון</p>
                        </div>
                        <button onClick={(e) => deleteAlert(alert.id, e)} className="text-[12px] px-1.5 py-1 rounded hover:bg-gray-100" style={{ color: "#9ca3af" }} title="מחק מעקב">🗑</button>
                        <span className="text-[12px]" style={{ color: "#9ca3af" }}>{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded: matching articles as full NewsCards */}
                  {isOpen && (
                    <div className="mt-2 mb-3 space-y-2.5">
                      {/* Date-range filter */}
                      <div className="lf-card p-3 flex flex-wrap items-center gap-2 text-[12px]">
                        <span style={{ color: "#6b7280" }}>📅 טווח:</span>
                        {[
                          { label: "שבוע אחרון", days: 7 },
                          { label: "חודש אחרון", days: 30 },
                        ].map((preset) => {
                          const active = rangeIs(alert.id, preset.days);
                          return (
                            <button
                              key={preset.days}
                              onClick={() => applyDateRange(alert.id, isoDaysAgo(preset.days), todayIso())}
                              className="px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors"
                              style={{ background: active ? "#dc2626" : "#fff", color: active ? "#fff" : "#6b7280", border: `1px solid ${active ? "#dc2626" : "#e5e7eb"}` }}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                        <span style={{ color: "#d1d5db" }}>|</span>
                        <input
                          type="date"
                          value={dateRange[alert.id]?.from || ""}
                          onChange={(e) => applyDateRange(alert.id, e.target.value, dateRange[alert.id]?.to || "")}
                          className="h-8 px-2 border rounded-md text-[12px]"
                          style={{ borderColor: "#e5e7eb" }}
                        />
                        <span style={{ color: "#9ca3af" }}>עד</span>
                        <input
                          type="date"
                          value={dateRange[alert.id]?.to || ""}
                          onChange={(e) => applyDateRange(alert.id, dateRange[alert.id]?.from || "", e.target.value)}
                          className="h-8 px-2 border rounded-md text-[12px]"
                          style={{ borderColor: "#e5e7eb" }}
                        />
                        {(dateRange[alert.id]?.from || dateRange[alert.id]?.to) && (
                          <button onClick={() => applyDateRange(alert.id, "", "")} className="text-[11px] underline" style={{ color: "#9ca3af" }}>נקה</button>
                        )}
                        {loadingArticles !== alert.id && (
                          <span className="mr-auto font-bold" style={{ color: "#dc2626" }}>
                            {(articles[alert.id] || []).length} כתבות{(dateRange[alert.id]?.from || dateRange[alert.id]?.to) ? " בטווח" : ""}
                          </span>
                        )}
                      </div>

                      {loadingArticles === alert.id ? (
                        <div className="flex items-center justify-center py-10 gap-2.5 text-[13px]" style={{ color: "#6b7280" }}>
                          <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#dc2626", borderTopColor: "transparent" }} />
                          מחפש כתבות תואמות…
                        </div>
                      ) : (articles[alert.id] || []).length === 0 ? (
                        <p className="text-center py-8 text-[13px]" style={{ color: "#9ca3af" }}>
                          {(dateRange[alert.id]?.from || dateRange[alert.id]?.to) ? "אין כתבות בטווח התאריכים שבחרת." : "לא נמצאו כתבות תואמות עדיין."}
                        </p>
                      ) : (() => {
                        const all = articles[alert.id] || [];
                        const shown = visibleCount[alert.id] ?? PAGE;
                        return (
                          <>
                            {all.slice(0, shown).map((item) => (
                              <NewsCard key={item.id} news={item} selected={false} onSelect={() => {}} showDate />
                            ))}
                            {all.length > shown && (
                              <button
                                onClick={() => setVisibleCount((p) => ({ ...p, [alert.id]: shown + PAGE }))}
                                className="lf-btn lf-btn-outline w-full !py-2.5 text-[13px] font-semibold"
                              >
                                הצג עוד {Math.min(PAGE, all.length - shown)} כתבות · נותרו {all.length - shown} מתוך {all.length}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
