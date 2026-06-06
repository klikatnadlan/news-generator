"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// One shared top bar for every page. Every destination is always present and
// the current page is highlighted (pill), so you always know where you are.
const LINKS = [
  { href: "/", label: "ראשי" },
  { href: "/headlines", label: "כותרות" },
  { href: "/alerts", label: "תודעת השוק" },
  { href: "/dashboard", label: "מדד אמון הציבור" },
  { href: "/archive", label: "ארכיון" },
  { href: "/history", label: "המעבדה" },
];

export function SiteNav() {
  const pathname = usePathname() || "/";
  return (
    <header className="lf-header">
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-12 gap-3">
        <Link href="/" className="flex items-center gap-2 leading-none shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
          <span className="flex flex-col items-start leading-none">
            <span className="text-[14px] font-extrabold text-white tracking-tight" style={{ fontFamily: "DM Sans, system-ui" }}>לידרפיד</span>
            <span className="text-[8px] md:text-[9px] text-white/45 italic mt-0.5" style={{ fontFamily: "Georgia, serif" }}>by ben solomon</span>
          </span>
        </Link>
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
    </header>
  );
}
