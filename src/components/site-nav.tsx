"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// One shared top bar for every page. Every destination is always present and
// the current page is highlighted (pill), so you always know where you are.
const LINKS = [
  { href: "/", label: "ראשי" },
  { href: "/headlines", label: "כותרות" },
  { href: "/alerts", label: "תודעת השוק" },
  { href: "/dashboard", label: "לוח בקרה" },
  { href: "/archive", label: "ארכיון" },
  { href: "/history", label: "היסטוריה" },
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
        </nav>
      </div>
    </header>
  );
}
