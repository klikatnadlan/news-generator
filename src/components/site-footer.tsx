"use client";

import Link from "next/link";

function getHebrewDate(): string {
  const months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  const now = new Date();
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[#e8eaed] mt-12 bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-semibold text-[#0f1419]">
          מקבוצת קליקת הנדל״ן ובן סולומון
        </p>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-xs text-[#86868b] hover:text-[#0f1419] transition-colors">
            לוח בקרה
          </Link>
          <Link href="/archive" className="text-xs text-[#86868b] hover:text-[#0f1419] transition-colors">
            ארכיון
          </Link>
          <Link href="/headlines" className="text-xs text-[#86868b] hover:text-[#0f1419] transition-colors">
            כותרות
          </Link>
        </div>
        <p className="text-[11px] text-[#c7c7cc]">
          {`נתונים ציבוריים | עדכון אחרון: ${getHebrewDate()}`}
        </p>
      </div>
    </footer>
  );
}
