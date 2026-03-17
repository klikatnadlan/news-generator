"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StyleSelector } from "./style-selector";

interface WhatsAppPanelProps {
  newsItemId: string;
  initialText?: string;
  initialTextId?: string;
}

export function WhatsAppPanel({
  newsItemId,
  initialText,
  initialTextId,
}: WhatsAppPanelProps) {
  const [style, setStyle] = useState<"short" | "regular" | "commentary">("regular");
  const [text, setText] = useState(initialText || "");
  const [textId, setTextId] = useState(initialTextId || "");
  const [generating, setGenerating] = useState(false);
  const [sent, setSent] = useState(false);

  const generate = async (selectedStyle?: "short" | "regular" | "commentary") => {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsItemIds: [newsItemId],
          style: selectedStyle || style,
        }),
      });
      const data = await res.json();
      if (data.results?.[0]) {
        setText(data.results[0].text);
        setTextId(data.results[0].id);
        setSent(false);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleStyleChange = (newStyle: "short" | "regular" | "commentary") => {
    setStyle(newStyle);
    generate(newStyle);
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(text);
    recordSend("whatsapp_copy");
  };

  const shareWhatsApp = () => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    recordSend("whatsapp_share");
  };

  const recordSend = async (channel: string) => {
    if (!textId) return;
    const username = localStorage.getItem("username") || "";
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

  const markAsSent = async () => {
    await recordSend("whatsapp_copy");
    setSent(true);
  };

  if (!text && !generating) {
    return (
      <Button onClick={() => generate()} variant="default" size="sm">
        צור נוסח
      </Button>
    );
  }

  return (
    <div className="mt-4 p-4 border rounded-lg bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">נוסח מוכן לוואטסאפ</span>
        <StyleSelector value={style} onChange={handleStyleChange} />
      </div>

      {generating ? (
        <div className="text-center py-8 text-muted-foreground">מייצר נוסח...</div>
      ) : (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[150px] text-right leading-relaxed"
            dir="rtl"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copyToClipboard}>
              📋 העתק
            </Button>
            <Button size="sm" variant="outline" onClick={shareWhatsApp}>
              📱 שתף בוואטסאפ
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => generate()}
              disabled={generating}
            >
              🔄 נסח מחדש
            </Button>
            <Button
              size="sm"
              variant={sent ? "default" : "outline"}
              onClick={markAsSent}
              disabled={sent}
            >
              {sent ? "✅ סומן כנשלח" : "✅ סמן כנשלח"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
