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
    <main className="max-w-3xl mx-auto p-4" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">היסטוריית שליחות</h1>
        <Link href="/" className="text-primary hover:underline text-sm">
          ← חזרה לראשי
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : (
        <HistoryTable history={history} />
      )}
    </main>
  );
}
