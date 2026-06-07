"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

const ZOOM_KEY = "lf-zoom";
const ZOOM_MIN = 0.9;
const ZOOM_MAX = 1.7;
const ZOOM_STEP = 0.1;

// One shared top bar for every page. Every destination is always present and
// the current page is highlighted (pill), so you always know where you are.
const LINKS = [
  { href: "/", label: "ראשי" },
  { href: "/headlines", label: "כותרות" },
  { href: "/alerts", label: "תודעת השוק" },
  { href: "/cities", label: "ערים" },
  { href: "/dashboard", label: "מדד אמון הציבור" },
  { href: "/archive", label: "ארכיון" },
  { href: "/history", label: "המעבדה" },
];

export function SiteNav() {
  const pathname = usePathname() || "/";

  // Text-size control: scale the WHOLE app (incl. fixed-px fonts) via CSS zoom.
  // Persisted in localStorage and re-applied on every page so the choice sticks.
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
    // Restore the subtitle/content text size globally (the control lives on the
    // headlines page; this makes the choice apply to subtitles on every page).
    const cs = parseFloat(localStorage.getItem("lf-content-size") || "");
    if (!isNaN(cs) && cs >= 11 && cs <= 22) {
      document.documentElement.style.setProperty("--lf-content-size", `${cs}px`);
    }
  }, []);

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
        <div className="flex items-center gap-1.5 min-w-0">
        {/* Text-size control (א− / % / א+) — pinned, never scrolls away */}
        <div className="flex items-center gap-0.5 shrink-0 rounded-full px-0.5 py-0.5" style={{ background: "rgba(255,255,255,0.1)" }} title="גודל טקסט">
          <button onClick={() => applyZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label="הקטן טקסט"
            className="w-6 h-6 flex items-center justify-center rounded-full text-[13px] font-bold text-white/70 hover:bg-white/10 disabled:opacity-30">א−</button>
          <button onClick={() => applyZoom(1)} aria-label="איפוס גודל טקסט"
            className="text-[9px] text-white/55 tabular-nums px-0.5 min-w-[26px] text-center hover:text-white/80">{Math.round(zoom * 100)}%</button>
          <button onClick={() => applyZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label="הגדל טקסט"
            className="w-6 h-6 flex items-center justify-center rounded-full text-[15px] font-bold text-white/70 hover:bg-white/10 disabled:opacity-30">א+</button>
        </div>
        <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="text-[12px] px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-colors"
                style={
                  active
                    ? { background: "rgba(255,255,255,0.14)", color: "#fff", fontWeight: 700 }
                    : { color: "rgba(255,255,255,0.6)" }
                }
              >
                {l.label}
              </Link>
            );
          })}
          {/* Search — jump to the full archive search from any page */}
          <Link
            href="/archive"
            aria-label="חיפוש"
            title="חיפוש בכל הארכיון"
            className="shrink-0 p-1.5 rounded-full transition-colors hover:bg-white/10"
            style={{ color: pathname.startsWith("/archive") ? "#fff" : "rgba(255,255,255,0.6)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Link>
        </nav>
        </div>
      </div>
    </header>
  );
}
