"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ScanStatusProps {
  lastScan: string | null;
  onScanComplete: () => void;
  hasNews?: boolean;
}

export function ScanStatus({
  lastScan,
  onScanComplete,
  hasNews = true,
}: ScanStatusProps) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [needsRescore, setNeedsRescore] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    setNeedsRescore(false);
    try {
      const res = await fetch("/api/cron/scan", {
        headers: { "x-manual-scan": "true" },
      });
      const data = await res.json();
      if (data.error) {
        setScanResult(`הסריקה נכשלה: ${data.error}. תוכל לנסות שוב בעוד דקה.`);
      } else if ((data.scanned ?? 0) === 0) {
        setScanResult("הסריקה רצה — לא הופיעו ידיעות חדשות. בדוק שוב בעוד שעה.");
      } else if ((data.scored ?? 0) === 0) {
        // All articles were duplicates (already in DB) — but maybe never scored
        setScanResult(`✓ ${data.scanned} ידיעות סורקו, אבל כולן כבר קיימות מ-RSS. ייתכן שיש כתבות ישנות שלא דורגו.`);
        setNeedsRescore(true);
      } else {
        setScanResult(`✓ ${data.scanned} ידיעות סורקו, ${data.scored} דורגו על ידי Claude.`);
      }
      onScanComplete();
    } catch {
      setScanResult("לא הצלחנו להתחבר לשרת. בדוק חיבור אינטרנט ונסה שוב.");
    } finally {
      setScanning(false);
    }
  };

  const handleRescore = async () => {
    setRescoring(true);
    setScanResult("מדרג כתבות מהארכיון שטרם דורגו…");
    try {
      const res = await fetch("/api/admin/rescore?days=7", {
        headers: { "x-manual-scan": "true" },
      });
      const data = await res.json();
      if (data.error) {
        setScanResult(`Rescore נכשל: ${data.error}`);
      } else if (data.scored === 0) {
        setScanResult(data.message || "אין כתבות לדרג מחדש.");
      } else {
        setScanResult(`✓ דורגו ${data.scored}/${data.unscored} כתבות מהשבוע. רענן את הדף.`);
        setNeedsRescore(false);
      }
      onScanComplete();
    } catch (e) {
      setScanResult("לא הצלחנו להתחבר לשרת. נסה שוב.");
    } finally {
      setRescoring(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  // Large prominent button when no news
  if (!hasNews) {
    return (
      <div className="text-center py-10 space-y-4">
        <div className="text-5xl">📡</div>
        <p className="text-[16px] font-bold" style={{ color: "#0f1419" }}>
          השרת ער. רק חדשות עוד לא הגיעו.
        </p>
        <p className="text-[13px] max-w-sm mx-auto leading-[1.5]" style={{ color: "#6b7280" }}>
          הסריקה האוטומטית רצה כל יום ב-06:00 ומביאה את כל ה-RSS feeds. אפשר גם להריץ עכשיו ידנית — לוקח ~15 שניות.
        </p>
        <Button
          size="lg"
          onClick={handleScan}
          disabled={scanning || rescoring}
          className="text-white font-bold px-8 py-3 text-base shadow-md hover:shadow-lg transition-shadow disabled:opacity-50"
          style={{ backgroundColor: "#dc2626" }}
        >
          {scanning ? "סורק חדשות… (~15 שניות)" : "🔍 סרוק חדשות עכשיו"}
        </Button>
        {scanResult && (
          <p className="text-[13px] font-medium max-w-sm mx-auto" style={{ color: scanResult.startsWith("✓") ? "#059669" : "#dc2626" }}>{scanResult}</p>
        )}
        {needsRescore && (
          <button
            onClick={handleRescore}
            disabled={rescoring}
            className="text-[12px] font-semibold underline disabled:opacity-50"
            style={{ color: "#0f1419" }}
          >
            {rescoring ? "מדרג… (~30 שניות)" : "🔄 דרג מחדש את כל הארכיון השבועי"}
          </button>
        )}
      </div>
    );
  }

  // Compact bar when news exists
  return (
    <div className="flex items-center gap-3 flex-wrap p-2.5 rounded-lg border bg-muted/30">
      <Button
        size="sm"
        variant="outline"
        onClick={handleScan}
        disabled={scanning}
        className="text-xs"
      >
        {scanning ? "סורק..." : "🔍 סרוק שוב"}
      </Button>
      {lastScan && (
        <span className="text-muted-foreground text-xs">
          סריקה אחרונה: {formatDate(lastScan)}
        </span>
      )}
      {scanResult && (
        <span className="text-green-600 text-xs font-medium">{scanResult}</span>
      )}
      <span className="text-xs text-muted-foreground mr-auto">
        סריקה אוטומטית כל יום ב-06:00
      </span>
    </div>
  );
}
