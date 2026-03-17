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

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/cron/scan", {
        headers: { "x-manual-scan": "true" },
      });
      const data = await res.json();
      if (data.error) {
        setScanResult(`שגיאה: ${data.error}`);
      } else {
        setScanResult(
          `נסרקו ${data.scanned ?? 0} ידיעות, דורגו ${data.scored ?? 0}`
        );
      }
      onScanComplete();
    } catch {
      setScanResult("שגיאה בסריקה");
    } finally {
      setScanning(false);
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
      <div className="text-center py-8 space-y-4">
        <div className="text-5xl">📡</div>
        <p className="text-lg font-medium" style={{ color: "#1d3557" }}>
          אין חדשות עדיין. בואו נסרוק!
        </p>
        <Button
          size="lg"
          onClick={handleScan}
          disabled={scanning}
          className="text-white font-bold px-8 py-3 text-base"
          style={{ backgroundColor: "#1d3557" }}
        >
          {scanning ? "סורק חדשות..." : "🔍 סרוק חדשות עכשיו"}
        </Button>
        {scanResult && (
          <p className="text-green-600 text-sm font-medium">{scanResult}</p>
        )}
        <p className="text-xs text-muted-foreground">
          הסריקה האוטומטית רצה כל יום ב-06:00
        </p>
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
