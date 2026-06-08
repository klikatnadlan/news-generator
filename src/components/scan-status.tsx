"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Demo-mode sample digest — shown in the empty state so first-time
// visitors (and investors) see WHAT the output looks like before they
// trigger a real scan. Voice + structure mirror what generateDailyDigest
// produces, with realistic numbers from past KlikatNadlan publications.
const SAMPLE_DIGEST = `📌 *חדשות נדל"ן מהיום*

חבר'ה, יש דבר אחד שצריך להבין על מה שקורה השבוע.

*הביקוש בהגרלות "דירה בהנחה" הכפיל את עצמו ברבעון*
בכפר סבא 1,847 רוכשים נרשמו על 89 דירות, יחס של 21:1.
בבאר שבע ובאשדוד אותה מגמה. הפער בין מחיר המדינה לשוק החופשי הגיע ל-35-40%, לפני שמדברים על משכנתאות הזכאות.

*פרשנות בן סולומון:*
אני אגיד את זה ישר, מי שמחכה ל"תיקון" בשוק צריך להבין שזה לא קורה.
מה שאני רואה בשטח: גם משפחות עם הון עצמי של 600 אלף קופצות על הגרלות כי השוק החופשי פשוט יקר מדי. אנחנו רואים את זה אצל חברי הקליקה כל יום, זוגות צעירים שבוחרים לחכות 4-5 שנים לזכייה במקום לקנות עכשיו.
הסיפור פה הוא לא המחיר. הסיפור הוא שהממשלה הופכת לשחקנית עיקרית בשוק הראשוני. וזה משנה את כל הכללים.

~~~~~~~~

*פנטהאוז בנתיבות נמכר ב-2.55 מיליון שקל, שיא מקומי חדש*
הביקוש לפנטהאוזים בפריפריה צומח ב-22% השנה.

*40% פחות ממחיר שומה: ברזאני זכתה במכרז בבית שמש*
130 יחידות + מסחר ותעסוקה. סימן ברור שיש קבלנים שמוכנים להתפשר על שולי רווח כדי לזכות בקרקעות זמינות.

~~~~~~~~

נמשיך לעדכן ברמה היומית, החברים מהקליקה 🙏`;

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
        setScanResult(`✓ ${data.scanned} ידיעות סורקו, אבל כולן כבר קיימות מ-RSS. ייתכן שיש באזים ישנים שלא דורגו.`);
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
    setScanResult("מדרג באזים מהארכיון שטרם דורגו…");
    try {
      const res = await fetch("/api/admin/rescore?days=7", {
        headers: { "x-manual-scan": "true" },
      });
      const data = await res.json();
      if (data.error) {
        setScanResult(`Rescore נכשל: ${data.error}`);
      } else if (data.scored === 0) {
        setScanResult(data.message || "אין באזים לדרג מחדש.");
      } else {
        setScanResult(`✓ דורגו ${data.scored}/${data.unscored} באזים מהשבוע. רענן את הדף.`);
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
      <div className="space-y-6">
        <div className="text-center py-8 space-y-4">
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

        {/* Demo preview — what the output looks like */}
        <div className="lf-card p-5 relative" style={{ borderRight: "3px solid #dc2626" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold" style={{ color: "#dc2626" }}>
              🎬 ככה נראה תקציר וואטסאפ יומי שלידרפיד מייצר
            </p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
              דוגמה
            </span>
          </div>
          <div
            className="whitespace-pre-wrap text-[13px] leading-[1.7] p-4 rounded-lg select-text"
            style={{ background: "#fafafa", color: "#0f1419" }}
            dir="rtl"
          >
            {SAMPLE_DIGEST}
          </div>
          <p className="text-[11px] mt-3 text-center" style={{ color: "#9ca3af" }}>
            ↑ זו דוגמה. לחצי <span className="font-bold">&quot;🔍 סרוק חדשות עכשיו&quot;</span> כדי לקבל תקציר אמיתי מהחדשות של היום, מוכן להעתקה לוואטסאפ.
          </p>
        </div>
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
