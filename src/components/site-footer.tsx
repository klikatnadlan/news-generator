"use client";

import Link from "next/link";

function getHebrewDate(): string {
  const months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  const now = new Date();
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

export function SiteFooter() {
  return (
    <footer className="lf-footer">
      <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2.5">
          <span className="lf-footer-dot" />
          <p className="text-[13px] font-bold text-white tracking-tight">
            מקבוצת קליקת הנדל״ן ובן סולומון
          </p>
          <span className="lf-footer-dot" />
        </div>

        <p className="text-[10px] text-white/40 tracking-[0.18em] uppercase" style={{ fontFamily: "DM Sans, system-ui" }}>
          by Ben Solomon · Founder
        </p>

        <div className="flex items-center gap-4 mt-1">
          <Link href="/dashboard" className="text-[11px] text-white/50 hover:text-white transition-colors">
            לוח בקרה
          </Link>
          <span className="text-[10px] text-white/20">·</span>
          <Link href="/archive" className="text-[11px] text-white/50 hover:text-white transition-colors">
            ארכיון
          </Link>
          <span className="text-[10px] text-white/20">·</span>
          <Link href="/headlines" className="text-[11px] text-white/50 hover:text-white transition-colors">
            כותרות
          </Link>
        </div>

        <p className="text-[10px] text-white/25 mt-1">
          נתונים ציבוריים · עדכון אחרון: {getHebrewDate()}
        </p>
      </div>
    </footer>
  );
}
