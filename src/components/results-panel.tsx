"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StyleSelector } from "./style-selector";

interface ResultItem {
  title: string;
  text: string;
  newsItemId: string;
  textId: string;
}

interface ResultsPanelProps {
  results: ResultItem[];
  onBack: () => void;
  onRegenerate: (newsItemId: string, style: "short" | "regular" | "commentary") => Promise<{ text: string; id: string } | null>;
}

export function ResultsPanel({ results, onBack, onRegenerate }: ResultsPanelProps) {
  const [items, setItems] = useState<ResultItem[]>(results);
  const [copyLabels, setCopyLabels] = useState<Record<number, string>>({});
  const [combinedCopyLabel, setCombinedCopyLabel] = useState("העתק הכל");
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [sentItems, setSentItems] = useState<Set<number>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const copyText = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopyLabels((prev) => ({ ...prev, [index]: "הועתק!" }));
    setTimeout(() => {
      setCopyLabels((prev) => ({ ...prev, [index]: "" }));
    }, 2000);
    recordSend(items[index].textId, "whatsapp_copy");
  };

  const shareWhatsApp = (text: string, index: number) => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    recordSend(items[index].textId, "whatsapp_share");
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
          className="border-r-4 overflow-hidden"
          style={{ borderRightColor: "#1d3557" }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base leading-tight flex-1">
                {item.title}
              </CardTitle>
              <span
                className="text-xs px-2 py-1 rounded-full font-medium text-white shrink-0"
                style={{ backgroundColor: "#1d3557" }}
              >
                נוסח {i + 1}
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
                {/* The generated text - toggle between view and edit */}
                {editingIdx === i ? (
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

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(item.text, i)}
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
