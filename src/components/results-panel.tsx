"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StyleSelector } from "./style-selector";

interface ResultItem {
  title: string;
  source: string;
  sourceUrl: string;
  text: string;
  newsItemId: string;
  textId: string;
}

interface ResultsPanelProps {
  results: ResultItem[];
  onBack: () => void;
  onRegenerate: (newsItemId: string, style: "short" | "regular" | "commentary") => Promise<{ text: string; id: string } | null>;
}

function WordHealthMeter({ text }: { text: string }) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const min = 250;
  const max = 400;
  const ideal = 320;

  let color = "#16a34a"; // green
  let label = "אידיאלי";
  let percent = 100;

  if (wordCount < min * 0.6) {
    color = "#dc2626"; // red
    label = "קצר מדי";
    percent = (wordCount / min) * 100;
  } else if (wordCount < min) {
    color = "#ca8a04"; // yellow
    label = "קצר";
    percent = (wordCount / min) * 100;
  } else if (wordCount <= max) {
    color = "#16a34a"; // green
    label = "אידיאלי";
    percent = 100;
  } else if (wordCount <= max * 1.3) {
    color = "#ca8a04"; // yellow
    label = "ארוך";
    percent = 100;
  } else {
    color = "#dc2626"; // red
    label = "ארוך מדי";
    percent = 100;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className="h-1.5 flex-1 rounded-full overflow-hidden"
        style={{ backgroundColor: "#e5e7eb", maxWidth: "80px" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ backgroundColor: color, width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span style={{ color }} className="font-medium tabular-nums">
        {wordCount} מילים
      </span>
      <span className="text-muted-foreground">({label})</span>
    </div>
  );
}

function WhatsAppPreview({ text }: { text: string }) {
  // Convert *bold* to <strong>
  const formatted = text
    .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");

  return (
    <div
      className="rounded-lg p-3 max-w-[85%] mr-auto text-sm leading-relaxed"
      style={{
        backgroundColor: "#dcf8c6",
        borderRadius: "7.5px 7.5px 0 7.5px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
      }}
    >
      <div
        dir="rtl"
        dangerouslySetInnerHTML={{ __html: formatted }}
        style={{ wordBreak: "break-word" }}
      />
      <div className="flex justify-end mt-1 gap-1 items-center">
        <span className="text-[10px] text-gray-500">
          {new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-[10px] text-blue-500">✓✓</span>
      </div>
    </div>
  );
}

export function ResultsPanel({ results, onBack, onRegenerate }: ResultsPanelProps) {
  const [items, setItems] = useState<ResultItem[]>(results);
  const [copyLabels, setCopyLabels] = useState<Record<number, string>>({});
  const [combinedCopyLabel, setCombinedCopyLabel] = useState("העתק הכל");
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [sentItems, setSentItems] = useState<Set<number>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [doneIdx, setDoneIdx] = useState<number | null>(null);
  const [humanityScores, setHumanityScores] = useState<Record<number, { score: number; flags: string[]; suggestion: string } | "loading">>({});

  // Auto-advance after copy & done
  useEffect(() => {
    if (doneIdx !== null) {
      const timer = setTimeout(() => setDoneIdx(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [doneIdx]);

  const copyText = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopyLabels((prev) => ({ ...prev, [index]: "הועתק!" }));
    setDoneIdx(index);
    recordSend(items[index].textId, "whatsapp_copy");

    // Auto-advance: scroll to next card after a beat
    setTimeout(() => {
      setCopyLabels((prev) => ({ ...prev, [index]: "" }));
      if (index < items.length - 1) {
        const nextCard = document.getElementById(`result-card-${index + 1}`);
        nextCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 1500);
  };

  const shareWhatsApp = (text: string, index: number) => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    recordSend(items[index].textId, "whatsapp_share");
    setDoneIdx(index);
  };

  const copyCombined = async () => {
    const combined = items.map((r) => r.text).join("\n\n~~~~~~~~\n\n");
    await navigator.clipboard.writeText(combined);
    setCombinedCopyLabel("הועתק!");
    setTimeout(() => setCombinedCopyLabel("העתק הכל"), 2000);
  };

  const shareCombined = () => {
    const combined = items.map((r) => r.text).join("\n\n~~~~~~~~\n\n");
    const encoded = encodeURIComponent(combined);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const handleRegenerate = async (index: number, style: "short" | "regular" | "commentary") => {
    setRegeneratingIdx(index);
    setEditingIdx(null);
    try {
      const result = await onRegenerate(items[index].newsItemId, style);
      if (result) {
        setItems((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], text: result.text, textId: result.id };
          return next;
        });
      }
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const handleEditText = (index: number, newText: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text: newText };
      return next;
    });
  };

  const markAsSent = async (index: number) => {
    await recordSend(items[index].textId, "whatsapp_copy");
    setSentItems((prev) => new Set(prev).add(index));
  };

  const recordSend = async (textId: string, channel: string) => {
    if (!textId) return;
    const username = localStorage.getItem("news-gen-username") || "";
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generatedTextId: textId,
        sentBy: username,
        channel,
      }),
    });
  };

  return (
    <div className="space-y-4">
      {/* Top summary bar */}
      <div
        className="rounded-lg p-4 border-2"
        style={{ backgroundColor: "#f0f7f0", borderColor: "#2d8a4e" }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <span className="font-bold text-lg" style={{ color: "#1d3557" }}>
                {items.length} נוסחים מוכנים!
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 mr-9">
              אפשר לערוך, לנסח מחדש, להעתיק, או לשתף ישירות
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={copyCombined}
              className="font-medium"
            >
              {combinedCopyLabel === "הועתק!"
                ? "✓ הועתק!"
                : `📋 ${combinedCopyLabel}`}
            </Button>
            <Button
              size="sm"
              onClick={shareCombined}
              className="font-medium text-white"
              style={{ backgroundColor: "#25D366" }}
            >
              📱 שתף הכל
            </Button>
          </div>
        </div>
      </div>

      {/* Individual result cards */}
      {items.map((item, i) => (
        <Card
          key={i}
          id={`result-card-${i}`}
          className={`border-r-4 overflow-hidden transition-all ${
            doneIdx === i ? "ring-2 ring-green-400" : ""
          }`}
          style={{ borderRightColor: "#1d3557" }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base leading-tight">
                  {item.title}
                </CardTitle>
                {/* Source badge */}
                {item.source && (
                  <div className="mt-1.5">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: "#e8edf4", color: "#1d3557" }}
                      >
                        🔗 {item.source}
                      </a>
                    ) : (
                      <span
                        className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "#e8edf4", color: "#1d3557" }}
                      >
                        {item.source}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span
                className="text-xs px-2 py-1 rounded-full font-medium text-white shrink-0"
                style={{ backgroundColor: doneIdx === i ? "#16a34a" : "#1d3557" }}
              >
                {doneIdx === i ? "✓ הועתק" : `נוסח ${i + 1}`}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {regeneratingIdx === i ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-2xl mb-2 animate-spin inline-block">⏳</div>
                <p>מייצר נוסח חדש...</p>
              </div>
            ) : (
              <>
                {/* WhatsApp Preview toggle */}
                <div className="flex items-center justify-between">
                  <WordHealthMeter text={item.text} />
                  <button
                    onClick={() => setPreviewIdx(previewIdx === i ? null : i)}
                    className="text-xs px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                    style={{ color: "#1d3557" }}
                  >
                    {previewIdx === i ? "📝 עורך" : "💬 תצוגת וואטסאפ"}
                  </button>
                </div>

                {/* WhatsApp Preview Mode */}
                {previewIdx === i ? (
                  <div
                    className="rounded-xl p-4"
                    style={{
                      backgroundColor: "#e5ddd5",
                      backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cfc4' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                    }}
                  >
                    <WhatsAppPreview text={item.text} />
                  </div>
                ) : editingIdx === i ? (
                  <div className="space-y-2">
                    <Textarea
                      value={item.text}
                      onChange={(e) => handleEditText(i, e.target.value)}
                      className="min-h-[200px] text-sm leading-relaxed"
                      dir="rtl"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => setEditingIdx(null)}
                        style={{ backgroundColor: "#1d3557" }}
                        className="text-white text-xs"
                      >
                        סיום עריכה
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed rounded-lg p-4 border cursor-pointer group relative"
                    style={{ backgroundColor: "#fafafa", minHeight: "120px" }}
                    dir="rtl"
                    onClick={() => setEditingIdx(i)}
                  >
                    {item.text}
                    <span className="absolute top-2 left-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      לחצו לעריכה
                    </span>
                  </div>
                )}

                {/* Style regeneration */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">נסח מחדש:</span>
                  <StyleSelector
                    value="regular"
                    onChange={(style) => handleRegenerate(i, style)}
                  />
                </div>

                {/* Humanity Score result */}
                {humanityScores[i] && humanityScores[i] !== "loading" && (
                  <div
                    className="rounded-md p-2.5 text-xs space-y-1"
                    style={{
                      backgroundColor: (humanityScores[i] as any).score >= 7 ? "#f0fdf4" : (humanityScores[i] as any).score >= 5 ? "#fefce8" : "#fef2f2",
                      borderRight: `3px solid ${(humanityScores[i] as any).score >= 7 ? "#16a34a" : (humanityScores[i] as any).score >= 5 ? "#ca8a04" : "#dc2626"}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold">ציון אנושיות: {(humanityScores[i] as any).score}/10</span>
                      <span>{(humanityScores[i] as any).score >= 7 ? "👍" : (humanityScores[i] as any).score >= 5 ? "⚠️" : "🚨"}</span>
                    </div>
                    {(humanityScores[i] as any).flags?.length > 0 && (
                      <p className="text-muted-foreground">דגלים: {(humanityScores[i] as any).flags.join(" · ")}</p>
                    )}
                    {(humanityScores[i] as any).suggestion && (
                      <p style={{ color: "#1d3557" }}>💡 {(humanityScores[i] as any).suggestion}</p>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant={doneIdx === i ? "default" : "outline"}
                    onClick={() => copyText(item.text, i)}
                    className={doneIdx === i ? "bg-green-500 hover:bg-green-600 text-white" : ""}
                  >
                    {copyLabels[i] === "הועתק!" ? "✓ הועתק!" : "📋 העתק"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => shareWhatsApp(item.text, i)}
                  >
                    📱 וואטסאפ
                  </Button>
                  <Button
                    size="sm"
                    variant={sentItems.has(i) ? "default" : "outline"}
                    onClick={() => markAsSent(i)}
                    disabled={sentItems.has(i)}
                  >
                    {sentItems.has(i) ? "✅ נשלח" : "✅ סמן כנשלח"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={humanityScores[i] === "loading"}
                    onClick={async () => {
                      setHumanityScores((prev) => ({ ...prev, [i]: "loading" }));
                      try {
                        const res = await fetch("/api/humanity-score", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ text: item.text }),
                        });
                        const data = await res.json();
                        setHumanityScores((prev) => ({ ...prev, [i]: data }));
                      } catch {
                        setHumanityScores((prev) => {
                          const next = { ...prev };
                          delete next[i];
                          return next;
                        });
                      }
                    }}
                  >
                    {humanityScores[i] === "loading" ? "⏳ בודק..." : "🧪 ציון אנושיות"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Back button at bottom */}
      <div className="flex justify-center pt-4 pb-8">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          className="font-medium"
          style={{ borderColor: "#1d3557", color: "#1d3557" }}
        >
          ← חזרה לבחירת ידיעות
        </Button>
      </div>
    </div>
  );
}
