"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { ScoredNews } from "@/lib/types";

interface NewsCardProps {
  news: ScoredNews;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
}

// Map known sources to display names for trust signal
const SOURCE_DISPLAY: Record<string, { label: string; color: string }> = {
  "גלובס": { label: "גלובס", color: "#0066cc" },
  "globes": { label: "גלובס", color: "#0066cc" },
  "כלכליסט": { label: "כלכליסט", color: "#e63946" },
  "calcalist": { label: "כלכליסט", color: "#e63946" },
  "דה מרקר": { label: "דה מרקר", color: "#1a8c1a" },
  "themarker": { label: "דה מרקר", color: "#1a8c1a" },
  "ביזפורטל": { label: "ביזפורטל", color: "#ff8c00" },
  "bizportal": { label: "ביזפורטל", color: "#ff8c00" },
  "ynet": { label: "ynet", color: "#ed1c24" },
  "וואלה": { label: "וואלה", color: "#00a0e3" },
  "walla": { label: "וואלה", color: "#00a0e3" },
  "מעריב": { label: "מעריב", color: "#003366" },
  "ישראל היום": { label: "ישראל היום", color: "#0055a5" },
  'מרכז הנדל"ן': { label: 'מרכז הנדל"ן', color: "#8b5cf6" },
  "nadlancenter": { label: 'מרכז הנדל"ן', color: "#8b5cf6" },
  "מגדילים": { label: "מגדילים", color: "#059669" },
  "magdilim": { label: "מגדילים", color: "#059669" },
  "מדלן": { label: "מדלן", color: "#7c3aed" },
  "madlan": { label: "מדלן", color: "#7c3aed" },
  "הומלס": { label: "הומלס", color: "#dc2626" },
  "homeless": { label: "הומלס", color: "#dc2626" },
  "ice": { label: "ICE", color: "#0ea5e9" },
};

function getSourceInfo(source: string) {
  const lower = source.toLowerCase();
  for (const [key, val] of Object.entries(SOURCE_DISPLAY)) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return { label: source, color: "#6b7280" };
}

export function NewsCard({ news, selected, onSelect }: NewsCardProps) {
  const [copyLabel, setCopyLabel] = useState<string | null>(null);
  const [inlineText, setInlineText] = useState<string | null>(null);
  const [inlineLoading, setInlineLoading] = useState(false);
  const [inlineCopyLabel, setInlineCopyLabel] = useState<string | null>(null);
  const inlineRef = useRef<HTMLDivElement>(null);

  const scoreBg =
    news.score >= 80
      ? "#dcfce7"
      : news.score >= 60
      ? "#fef9c3"
      : "#ffedd5";

  const scoreColor =
    news.score >= 80
      ? "#16a34a"
      : news.score >= 60
      ? "#ca8a04"
      : "#ea580c";

  const scoreBorder =
    news.score >= 80
      ? "border-r-green-500"
      : news.score >= 60
      ? "border-r-yellow-500"
      : "border-r-orange-500";

  const sourceInfo = getSourceInfo(news.source);

  const handleCopyTachles = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const tachlesText = `${news.title}${news.summary ? `\n${news.summary}` : ""}`;
    await navigator.clipboard.writeText(tachlesText);
    setCopyLabel("✓ הועתק!");
    setTimeout(() => setCopyLabel(null), 2000);
  };

  const handleQuickGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Toggle: if text is already shown, hide it
    if (inlineText) {
      setInlineText(null);
      return;
    }
    setInlineLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemIds: [news.id], style: "regular" }),
      });
      const data = await res.json();
      if (data.results?.[0]) {
        setInlineText(data.results[0].text);
        // Scroll into view after render
        setTimeout(() => {
          inlineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    } finally {
      setInlineLoading(false);
    }
  };

  const handleInlineCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inlineText) return;
    await navigator.clipboard.writeText(inlineText);
    setInlineCopyLabel("✓ הועתק!");
    setTimeout(() => setInlineCopyLabel(null), 2000);
  };

  const handleInlineWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inlineText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(inlineText)}`, "_blank");
  };

  return (
    <Card
      className={`border-r-4 ${scoreBorder} cursor-pointer transition-all hover:shadow-md ${
        selected ? "ring-2 shadow-md" : ""
      }`}
      style={
        selected
          ? { borderColor: "#1d3557", backgroundColor: "#f8faff", boxShadow: "0 0 0 2px #1d3557" }
          : undefined
      }
      onClick={() => onSelect(news.id, !selected)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect(news.id, !!checked)}
            className="mt-1 h-5 w-5"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex-1 min-w-0">
            {/* Source badge - prominent at top */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className="inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: sourceInfo.color }}
              >
                {sourceInfo.label}
              </span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: scoreBg, color: scoreColor }}
              >
                {news.score} נקודות
              </span>
            </div>

            <CardTitle className="text-base leading-tight">{news.title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {/* Reasoning in subtle amber box */}
        <div
          className="text-xs rounded-md p-2"
          style={{ backgroundColor: "#fffbeb", color: "#92400e" }}
        >
          {news.reasoning}
        </div>

        {news.summary && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {news.summary}
          </p>
        )}

        {/* Action row: Read more + Copy tachles + Quick generate */}
        <div className="flex items-center gap-2 pt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {news.source_url && (
            <a
              href={news.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity border"
              style={{ color: sourceInfo.color, borderColor: sourceInfo.color }}
            >
              קרא עוד →
            </a>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyTachles}
            className="text-xs h-7 px-3"
            style={
              copyLabel
                ? { backgroundColor: "#dcfce7", borderColor: "#16a34a", color: "#16a34a" }
                : { borderColor: "#1d3557", color: "#1d3557" }
            }
          >
            {copyLabel || "📋 העתק תכלס"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleQuickGenerate}
            disabled={inlineLoading}
            className="text-xs h-7 px-3"
            style={
              inlineText
                ? { backgroundColor: "#f0f4ff", borderColor: "#1d3557", color: "#1d3557" }
                : { borderColor: "#e63946", color: "#e63946" }
            }
          >
            {inlineLoading ? "⏳ מייצר..." : inlineText ? "✕ הסתר נוסח" : "⚡ נוסח מהיר"}
          </Button>
        </div>

        {/* Inline generated text — appears right here in the card */}
        {inlineText && (
          <div
            ref={inlineRef}
            className="mt-2 rounded-lg border-2 overflow-hidden"
            style={{ borderColor: "#e63946" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-3 py-2 text-xs font-bold flex items-center gap-1.5"
              style={{ backgroundColor: "#e63946", color: "white" }}
            >
              ⚡ נוסח מוכן לשיתוף
            </div>
            <div
              className="p-3 whitespace-pre-wrap text-sm leading-relaxed"
              style={{ backgroundColor: "#fff8f8", direction: "rtl" }}
              dir="rtl"
            >
              {inlineText}
            </div>
            <div
              className="px-3 py-2 flex gap-2 border-t"
              style={{ backgroundColor: "#fafafa" }}
            >
              <Button
                size="sm"
                variant="outline"
                onClick={handleInlineCopy}
                className="text-xs h-7 px-3"
                style={
                  inlineCopyLabel
                    ? { backgroundColor: "#dcfce7", borderColor: "#16a34a", color: "#16a34a" }
                    : { borderColor: "#1d3557", color: "#1d3557" }
                }
              >
                {inlineCopyLabel || "📋 העתק"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleInlineWhatsApp}
                className="text-xs h-7 px-3"
                style={{ borderColor: "#25D366", color: "#25D366" }}
              >
                📱 וואטסאפ
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
