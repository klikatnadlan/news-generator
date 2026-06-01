"use client";

import { useState, useEffect } from "react";
import { HistoryTable } from "@/components/history-table";
import Link from "next/link";

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((data) => setHistory(data.history || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: "var(--lf-bg, #f8f9fb)" }}>
      <header className="lf-header">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-12">
          <Link href="/" className="flex items-center gap-2 leading-none">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
            <span className="flex flex-col items-start leading-none">
              <span className="text-[14px] font-extrabold text-white tracking-tight" style={{ fontFamily: "DM Sans, system-ui" }}>לידרפיד</span>
              <span className="text-[8px] md:text-[9px] text-white/45 italic mt-0.5" style={{ fontFamily: "Georgia, serif" }}>by ben solomon</span>
            </span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/" className="text-[12px] text-white/60 hover:text-white transition-colors">ראשי</Link>
            <Link href="/headlines" className="text-[12px] text-white/60 hover:text-white transition-colors">כותרות</Link>
            <Link href="/dashboard" className="text-[12px] text-white/60 hover:text-white transition-colors">לוח בקרה</Link>
            <Link href="/archive" className="text-[12px] text-white/60 hover:text-white transition-colors">ארכיון</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold" style={{ color: "#0f1419" }}>היסטוריית שליחות</h1>
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: "#9ca3af" }}>טוען...</div>
        ) : (
          <HistoryTable history={history} />
        )}
      </main>
    </div>
  );
}
