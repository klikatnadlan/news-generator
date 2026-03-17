"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { NewsCard } from "@/components/news-card";
import { ScanStatus } from "@/components/scan-status";
import { UsernameDialog } from "@/components/username-dialog";
import type { ScoredNews } from "@/lib/types";
import Link from "next/link";

export default function HomePage() {
  const [news, setNews] = useState<ScoredNews[]>([]);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [batchGenerating, setBatchGenerating] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/today");
      const data = await res.json();
      setNews(data.news || []);
      setLastScan(data.lastScan);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const handleSelect = (id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBatchGenerate = async () => {
    if (selected.size === 0) return;
    setBatchGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsItemIds: Array.from(selected),
          style: "regular",
        }),
      });
      const data = await res.json();
      alert(`נוצרו ${data.results?.length || 0} נוסחים בהצלחה`);
    } finally {
      setBatchGenerating(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto p-4" dir="rtl">
      <UsernameDialog />

      <h1 className="text-2xl font-bold mb-1">מחולל כותרות ופרשנות יומי</h1>
      <p className="text-sm text-muted-foreground mb-4">קליקת הנדל״ן</p>

      <ScanStatus lastScan={lastScan} onScanComplete={fetchNews} />

      <div className="mt-4 space-y-4">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">טוען חדשות...</div>
        ) : news.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            אין חדשות מומלצות היום. נסה לסרוק שוב.
          </div>
        ) : (
          news.map((item) => (
            <NewsCard
              key={item.id}
              news={item}
              selected={selected.has(item.id)}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto">
          <Button
            className="w-full"
            size="lg"
            onClick={handleBatchGenerate}
            disabled={batchGenerating}
          >
            {batchGenerating
              ? "מייצר..."
              : `צור נוסח ל-${selected.size} ידיעות שנבחרו`}
          </Button>
        </div>
      )}

      <div className="mt-8 pt-4 border-t flex gap-4 text-sm">
        <Link href="/history" className="text-primary hover:underline">
          📋 היסטוריה
        </Link>
      </div>
    </main>
  );
}
