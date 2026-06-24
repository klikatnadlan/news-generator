"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

const ZOOM_KEY = "lf-zoom";
const ZOOM_MIN = 0.9;
const ZOOM_MAX = 1.7;
const ZOOM_STEP = 0.1;

// One shared top bar for every page — minimal SaaS style (Ben: the crowded
// link row was uncomfortable). Everything lives in a clean slide-out menu:
// search, all destinations (active highlighted), and a user/login placeholder.
const LINKS = [
  { href: "/", label: "ראשי", emoji: "🏠" },
  { href: "/headlines", label: "כותרות", emoji: "🗞️" },
  { href: "/alerts", label: "תודעת השוק", emoji: "🧠" },
  { href: "/cities", label: "ערים", emoji: "🏙️" },
  { href: "/galil", label: "פורטל הגליל", emoji: "🌲" },
  { href: "/dashboard", label: "מדד אמון הציבור", emoji: "📊" },
  { href: "/archive", label: "ארכיון וחיפוש", emoji: "🗂️" },
  { href: "/history", label: "המעבדה", emoji: "🧪" },
];

export function SiteNav() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");

  // Text-size control: scale the WHOLE app (incl. fixed-px fonts) via CSS zoom.
  const [zoom, setZoom] = useState(1);
  const applyZoom = useCallback((z: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
    setZoom(clamped);
    document.documentElement.style.setProperty("zoom", String(clamped));
    try { localStorage.setItem(ZOOM_KEY, String(clamped)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const saved = parseFloat(localStorage.getItem(ZOOM_KEY) || "1");
    const z = isNaN(saved) ? 1 : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, saved));
    setZoom(z);
    document.documentElement.style.setProperty("zoom", String(z));
    // Restore the subtitle/content text size globally.
    const cs = parseFloat(localStorage.getItem("lf-content-size") || "");
    if (!isNaN(cs) && cs >= 11 && cs <= 22) {
      document.documentElement.style.setProperty("--lf-content-size", `${cs}px`);
    }
  }, []);

  // Menu niceties: Escape closes, body scroll locks while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  const runMenuSearch = () => {
    const q = menuQuery.trim();
    setOpen(false);
    router.push(q ? `/archive?q=${encodeURIComponent(q)}` : "/archive");
  };

  const current = LINKS.find((l) => (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)));

  return (
    <header className="lf-header">
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-12 gap-2">
        <Link href="/" className="flex items-center gap-2 leading-none shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
          <span className="flex flex-col items-start leading-none">
            <span className="text-[14px] font-extrabold text-white tracking-tight" style={{ fontFamily: "DM Sans, system-ui" }}>לידרפיד</span>
            <span className="text-[8px] md:text-[9px] text-white/45 italic mt-0.5" style={{ fontFamily: "Georgia, serif" }}>by ben solomon</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          {/* current page chip — quiet orientation without a crowded link row */}
          {current && <span className="hidden sm:inline text-[11px] px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{current.label}</span>}

          {/* app zoom */}
          <div className="flex items-center gap-0.5 rounded-full px-0.5 py-0.5" style={{ background: "rgba(255,255,255,0.1)" }} title="גודל תצוגה">
            <button onClick={() => applyZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label="הקטן"
              className="w-6 h-6 flex items-center justify-center rounded-full text-[13px] font-bold text-white/70 hover:bg-white/10 disabled:opacity-30">א−</button>
            <button onClick={() => applyZoom(1)} aria-label="איפוס"
              className="text-[9px] text-white/55 tabular-nums px-0.5 min-w-[26px] text-center hover:text-white/80">{Math.round(zoom * 100)}%</button>
            <button onClick={() => applyZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label="הגדל"
              className="w-6 h-6 flex items-center justify-center rounded-full text-[15px] font-bold text-white/70 hover:bg-white/10 disabled:opacity-30">א+</button>
          </div>

          {/* hamburger */}
          <button onClick={() => setOpen(true)} aria-label="תפריט"
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10" style={{ background: "rgba(255,255,255,0.08)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Slide-out menu ─── */}
      {open && (
        <div className="fixed inset-0 z-[100]" dir="rtl">
          <div className="absolute inset-0" style={{ background: "rgba(8,10,14,0.55)", backdropFilter: "blur(2px)" }} onClick={() => setOpen(false)} />
          <aside className="absolute top-0 bottom-0 right-0 w-[300px] max-w-[85vw] flex flex-col shadow-2xl lf-animate" style={{ background: "#0f1419" }}>
            {/* menu header */}
            <div className="flex items-center justify-between px-4 h-14 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
                <span className="text-[14px] font-extrabold text-white">לידרפיד</span>
              </span>
              <button onClick={() => setOpen(false)} aria-label="סגור תפריט" className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:bg-white/10 text-[16px]">✕</button>
            </div>

            {/* search inside the menu */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-1.5 rounded-xl px-3 h-10" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" />
                </svg>
                <input value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runMenuSearch()}
                  placeholder="חיפוש בכל לידרפיד…" dir="rtl"
                  className="flex-1 bg-transparent text-[13px] text-white placeholder-white/40 focus:outline-none" />
                <button onClick={runMenuSearch} className="text-[11px] font-bold px-2 py-1 rounded-md text-white" style={{ background: "#dc2626" }}>חפש</button>
              </div>
            </div>

            {/* links */}
            <nav className="flex-1 overflow-y-auto px-2 py-2">
              {LINKS.map((l) => {
                const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
                return (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 transition-colors"
                    style={active ? { background: "rgba(220,38,38,0.16)", color: "#fff", fontWeight: 700 } : { color: "rgba(255,255,255,0.65)" }}>
                    <span className="text-[16px] w-6 text-center">{l.emoji}</span>
                    <span className="text-[13.5px]">{l.label}</span>
                    {active && <span className="mr-auto w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </Link>
                );
              })}
            </nav>

            {/* user / login placeholder */}
            <div className="px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/5" style={{ color: "rgba(255,255,255,0.7)" }} title="התחברות אישית — בקרוב">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[14px]" style={{ background: "rgba(255,255,255,0.1)" }}>👤</span>
                <span className="text-[13px] font-semibold">התחברות</span>
                <span className="mr-auto text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(220,38,38,0.2)", color: "#fca5a5" }}>בקרוב</span>
              </button>
              <p className="text-[10px] text-center mt-2" style={{ color: "rgba(255,255,255,0.3)" }}>לידרפיד — כל הבאזז, במקום אחד · by ben solomon</p>
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}
