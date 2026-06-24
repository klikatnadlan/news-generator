"use client";

import { useState, useEffect, useMemo } from "react";
import { SiteNav } from "@/components/site-nav";
import {
  GALILEE_BIG_NUMBERS, GALILEE_STORIES, GALILEE_ITEMS, GALILEE_NARRATIVE,
  GALILEE_STATS, IMPACT_LABEL, IMPACT_COLOR, galileeCategories, type Impact, type GalileeItem,
} from "@/lib/galilee-report";

const WA = "https://klikatnadlan.co.il/klikatwhatsappgov/";

type LiveItem = { id: string; title: string; source: string; url: string; date: string };

function ImpactBadge({ impact }: { impact: Impact }) {
  const c = IMPACT_COLOR[impact];
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>{IMPACT_LABEL[impact]}</span>;
}

// One source card with the investor-lens "חשוב לדעת" + in-app reader (better
// than the original portal, which only links out).
function ItemCard({ it }: { it: GalileeItem }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); // true only after a successful non-empty load
  const [loading, setLoading] = useState(false);
  const read = async () => {
    const next = !open;
    setOpen(next);
    // Fetch when opening; cache only a SUCCESSFUL non-empty read so a transient
    // failure/block can be retried by closing and re-opening (not stuck forever).
    if (!next || loaded || loading) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/article-read?url=${encodeURIComponent(it.url)}`);
      const d = await r.json();
      const t = d.text || "";
      setText(t);
      if (t) setLoaded(true);
    } catch { setText(""); } finally { setLoading(false); }
  };
  return (
    <div className="lf-card p-4" dir="rtl">
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#f1f5f9", color: "#475569" }}>{it.category}</span>
        <ImpactBadge impact={it.impact} />
      </div>
      <h3 className="text-[14px] font-extrabold leading-[1.4]" style={{ color: "#0f1419" }}>{it.title}</h3>
      <p className="text-[10px] mt-0.5 mb-2" style={{ color: "#9ca3af" }}>{it.source}{it.date ? ` · ${it.date}` : ""}</p>
      <div className="rounded-lg px-2.5 py-2 mb-2" style={{ background: "#fffbeb", border: "1px solid #fef3c7" }}>
        <p className="text-[10px] font-bold mb-0.5" style={{ color: "#b45309" }}>💡 חשוב לדעת</p>
        <p className="text-[12px] leading-[1.6]" style={{ color: "#57534e" }}>{it.whyItMatters}</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={read} className="text-[11px] font-semibold px-2.5 py-1 rounded-md border" style={{ borderColor: "#0ea5e9", color: "#0369a1", background: open ? "#e0f2fe" : "#fff" }}>{open ? "▲ סגור" : "📖 קרא כאן"}</button>
        <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold" style={{ color: "#9ca3af" }}>קריאה במקור ←</a>
      </div>
      {open && (
        <div className="mt-2 rounded-lg p-2.5 text-[12px] leading-[1.7] max-h-[260px] overflow-y-auto" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#374151" }} dir="rtl">
          {loading ? "טוען…" : text ? text : "לא ניתן לטעון את הטקסט — קראו במקור."}
        </div>
      )}
    </div>
  );
}

export default function GalilPage() {
  const [impactFilter, setImpactFilter] = useState<Impact | "all">("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [live, setLive] = useState<LiveItem[]>([]);

  useEffect(() => {
    fetch("/api/galil/live").then((r) => r.json()).then((d) => setLive(d.items || [])).catch(() => {});
  }, []);

  const cats = useMemo(() => galileeCategories(), []);
  const items = useMemo(
    () => GALILEE_ITEMS.filter((it) => (impactFilter === "all" || it.impact === impactFilter) && (catFilter === "all" || it.category === catFilter)),
    [impactFilter, catFilter]
  );

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      <SiteNav />

      {/* ───── Hero (navy, premium) ───── */}
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(160deg,#0b0f14 0%,#0f1419 55%,#13202e 100%)" }}>
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative max-w-3xl mx-auto px-4 pt-10 pb-12 text-center">
          <span className="inline-block text-[11px] font-bold tracking-wide px-3 py-1 rounded-full mb-5" style={{ background: "rgba(220,38,38,0.16)", color: "#fca5a5" }}>דוח שטח · 2024–2026</span>
          <h1 className="text-[34px] md:text-[44px] font-black leading-[1.1] tracking-tight" style={{ color: "#fff", fontFamily: "DM Sans, system-ui" }}>
            פורטל הצמיחה של הגליל<span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 align-middle mr-2 shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
          </h1>
          <p className="text-[14px] md:text-[15px] mt-4 leading-[1.7] max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.7)" }}>
            מרכז המידע למשקיעים על הצפון — מעלות תרשיחא, נהריה ותפן. כל הכתבות, ההשקעות והתוכניות ששינו את פני הגליל, במקום אחד. עובדות מהתקשורת הכלכלית ומגופים רשמיים בלבד.
          </p>
          <p className="text-[15px] md:text-[17px] mt-5 font-bold leading-[1.6] max-w-xl mx-auto" style={{ color: "#fff" }}>
            „אלו אינן תחזיות. אלו החלטות שכבר התקבלו — של המדינה, של הצבא, של היזמים הגדולים בישראל."
          </p>
          <div className="flex items-center justify-center gap-2.5 mt-6 flex-wrap">
            <a href={WA} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold px-5 py-2.5 rounded-full text-white" style={{ background: "#37b718" }}>הצטרפו לקבוצת הרכישה →</a>
            <a href="#stories" className="text-[13px] font-bold px-5 py-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>לצפייה בסיפורים המתפתחים</a>
          </div>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* ───── Big numbers ───── */}
        <p className="text-[12px] font-bold mb-1" style={{ color: "#dc2626" }}>המספרים</p>
        <h2 className="text-[20px] font-extrabold mb-3" style={{ color: "#0f1419" }}>לא תחזיות. החלטות שכבר התקבלו.</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-8">
          {GALILEE_BIG_NUMBERS.map((n, i) => (
            <div key={i} className="lf-card p-3.5 text-center">
              <div className="text-[26px] font-black leading-none" style={{ color: "#0f1419" }}>{n.value}</div>
              <div className="text-[11px] font-bold mt-0.5" style={{ color: "#dc2626" }}>{n.unit}</div>
              <div className="text-[11px] mt-1.5 leading-[1.4]" style={{ color: "#6b7280" }}>{n.label}</div>
            </div>
          ))}
        </div>

        {/* ───── Developing stories ───── */}
        <div id="stories" className="mb-9">
          <p className="text-[12px] font-bold mb-1" style={{ color: "#dc2626" }}>סיפורים מתפתחים</p>
          <h2 className="text-[20px] font-extrabold mb-1" style={{ color: "#0f1419" }}>דבר מוביל לדבר — לאורך שנים</h2>
          <p className="text-[12px] mb-4" style={{ color: "#9ca3af" }}>כל שרשרת מראה איך החלטה אחת מבשילה לבאות — וכמה זמן זה לקח.</p>
          <div className="space-y-5">
            {GALILEE_STORIES.map((story) => (
              <div key={story.title} className="lf-card p-4" style={{ borderRight: "3px solid #dc2626" }}>
                <h3 className="text-[15px] font-extrabold mb-3" style={{ color: "#0f1419" }}>🔗 {story.title}</h3>
                <div className="space-y-3 pr-3" style={{ borderRight: "2px solid #fca5a5" }}>
                  {story.steps.map((s, si) => (
                    <div key={s.url || si} className="relative">
                      <span className="absolute -right-[19px] top-1 w-3 h-3 rounded-full" style={{ background: "#dc2626", boxShadow: "0 0 0 3px #fff" }} />
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={{ background: "#0f1419", color: "#fff" }}>{s.stepLabel}</span>
                        <span className="text-[10px] font-semibold" style={{ color: "#9ca3af" }}>{s.source} · {s.date}</span>
                        <ImpactBadge impact={s.impact} />
                      </div>
                      <p className="text-[13.5px] font-bold leading-[1.4]" style={{ color: "#0f1419" }}>{s.title}</p>
                      <p className="text-[12px] leading-[1.6] mt-1" style={{ color: "#57534e" }}>{s.whyItMatters}</p>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold" style={{ color: "#0369a1" }}>קריאה במקור ←</a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ───── All moves (filterable) ───── */}
        <p className="text-[12px] font-bold mb-1" style={{ color: "#dc2626" }}>כל המהלכים</p>
        <h2 className="text-[20px] font-extrabold mb-3" style={{ color: "#0f1419" }}>כל מה שכתוב, מתוקצב ומאושר — במקום אחד</h2>

        {/* filters */}
        <div className="flex items-center flex-wrap gap-1.5 mb-2">
          <span className="text-[10px] shrink-0" style={{ color: "#9ca3af" }}>השפעה:</span>
          {(["all", "high", "medium", "low"] as const).map((imp) => {
            const on = impactFilter === imp;
            return <button key={imp} onClick={() => setImpactFilter(imp)} className="px-2.5 py-1 text-[11px] rounded-full font-medium" style={{ background: on ? "#0f1419" : "#fff", color: on ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>{imp === "all" ? "הכל" : IMPACT_LABEL[imp]}</button>;
          })}
        </div>
        <div className="flex items-center flex-wrap gap-1.5 mb-4">
          <span className="text-[10px] shrink-0" style={{ color: "#9ca3af" }}>תחום:</span>
          <button onClick={() => setCatFilter("all")} className="px-2.5 py-1 text-[11px] rounded-full font-medium" style={{ background: catFilter === "all" ? "#0369a1" : "#fff", color: catFilter === "all" ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>הכל</button>
          {cats.map((c) => {
            const on = catFilter === c;
            return <button key={c} onClick={() => setCatFilter(c)} className="px-2.5 py-1 text-[11px] rounded-full font-medium whitespace-nowrap" style={{ background: on ? "#0369a1" : "#fff", color: on ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}>{c}</button>;
          })}
        </div>

        <p className="text-[11px] mb-3" style={{ color: "#9ca3af" }}>מציג {items.length} מתוך {GALILEE_ITEMS.length} מהלכים</p>
        {items.length === 0 ? (
          <p className="text-[12px] py-6 text-center mb-9" style={{ color: "#9ca3af" }}>אין מהלכים תואמים לסינון — נסו תחום או רמת השפעה אחרת.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 mb-9">
            {items.map((it, i) => <ItemCard key={i} it={it} />)}
          </div>
        )}

        {/* ───── Live strip (fresh from our corpus) ───── */}
        {live.length > 0 && (
          <div className="mb-9">
            <p className="text-[12px] font-bold mb-1 flex items-center gap-1.5" style={{ color: "#dc2626" }}>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> טרי מהשטח
            </p>
            <h2 className="text-[18px] font-extrabold mb-1" style={{ color: "#0f1419" }}>מתעדכן אוטומטית — אזכורי הגליל האחרונים</h2>
            <p className="text-[11px] mb-3" style={{ color: "#9ca3af" }}>נמשך חי מהמאגר של לידרפיד (לא סטטי) — {live.length} פריטים אחרונים.</p>
            <div className="lf-card divide-y" style={{ borderColor: "#f1f5f9" }}>
              {live.map((it, i) => (
                <a key={it.id} href={it.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 px-3.5 py-2.5 hover:bg-slate-50 transition-colors" dir="rtl">
                  <span className="text-[11px] font-bold shrink-0" style={{ color: "#cbd5e1" }}>{i + 1}</span>
                  <span className="flex-1">
                    <span className="text-[12.5px] font-semibold leading-[1.5] block" style={{ color: "#0f1419" }}>{it.title}</span>
                    <span className="text-[10px]" style={{ color: "#9ca3af" }}>{it.source}{it.date ? ` · ${it.date}` : ""}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ───── Why Galilee — stats + narrative ───── */}
        <div className="lf-card p-5 mb-8" style={{ background: "linear-gradient(160deg,#0f1419,#13202e)" }}>
          <p className="text-[12px] font-bold mb-1" style={{ color: "#fca5a5" }}>למה הגליל</p>
          <h2 className="text-[20px] font-extrabold mb-3" style={{ color: "#fff" }}>לא תחזית. החלטות שכבר קורות בשטח.</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {GALILEE_STATS.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-[24px] font-black" style={{ color: "#fff" }}>{s.value}</div>
                <div className="text-[10.5px] leading-[1.4] mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[13px] leading-[1.7]" style={{ color: "rgba(255,255,255,0.8)" }}>{GALILEE_NARRATIVE}</p>
        </div>

        {/* ───── CTA ───── */}
        <div className="lf-card p-5 text-center" style={{ border: "2px solid #37b718" }}>
          <h2 className="text-[19px] font-extrabold mb-1.5" style={{ color: "#0f1419" }}>רוצים להבין אם העסקה הצפונית מתאימה לכם?</h2>
          <p className="text-[12.5px] mb-4 leading-[1.6]" style={{ color: "#6b7280" }}>הצטרפו לעשרות אלפי ישראלים בקבוצות הוואטסאפ שלנו — ניתוח פוטנציאל ההשקעה, תנאי הקבוצה ולוחות הזמנים, ללא התחייבות.</p>
          <a href={WA} target="_blank" rel="noopener noreferrer" className="inline-block text-[14px] font-bold px-7 py-3 rounded-full text-white" style={{ background: "#37b718" }}>להצטרפות לווטסאפ לחצו ←</a>
          <p className="text-[10px] mt-4" style={{ color: "#c7c7cc" }}>כל המקורות זמינים לציבור. הפורטל אינו מהווה ייעוץ השקעות ואינו מתחייב לתשואה.</p>
        </div>
      </div>
    </div>
  );
}
