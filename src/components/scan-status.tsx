"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ScanStatusProps {
  lastScan: string | null;
  onScanComplete: () => void;
  hasNews?: boolean;
}

export function ScanStatus({ lastScan, onScanComplete, hasNews = true }: ScanStatusProps) {
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
        setScanResult(`נסרקו ${data.scanned ?? 0} ידיעות, דורגו ${data.scored ?? 0}`);
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

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          size={!hasNews ? "default" : "sm"}
          variant={!hasNews ? "default" : "outline"}
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? "סורק..." : "סרוק עכשיו"}
        </Button>
        {lastScan && (
          <span className="text-muted-foreground text-sm">
            סריקה אחרונה: {formatDate(lastScan)}
          </span>
        )}
        {scanResult && (
          <span className="text-green-600 text-sm font-medium">{scanResult}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        הסריקה האוטומטית רצה כל יום ב-06:00. אפשר גם לסרוק ידנית.
      </p>
    </div>
  );
}
