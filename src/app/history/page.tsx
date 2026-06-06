"use client";

import { useState, useEffect } from "react";
import { HistoryTable } from "@/components/history-table";
import { SiteNav } from "@/components/site-nav";
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
      <SiteNav />

      <main className="max-w-3xl mx-auto p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold" style={{ color: "#0f1419" }}>🧪 המעבדה</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "#6b7280" }}>כל נוסח, תקציר וכתבה שייצרת — שמורים כאן עם תאריך וסגנון, לחזרה ולמדידה.</p>
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
