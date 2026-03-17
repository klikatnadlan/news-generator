"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { ScoredNews } from "@/lib/types";

interface NewsCardProps {
  news: ScoredNews;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
}

export function NewsCard({ news, selected, onSelect }: NewsCardProps) {
  const [generating, setGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string | null>(null);
  const [generatedTextId, setGeneratedTextId] = useState<string | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [commentary, setCommentary] = useState<Record<string, unknown> | null>(null);

  const handleGenerate = async (style: "short" | "regular" | "commentary") => {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemIds: [news.id], style }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (result) {
        setGeneratedText(result.text);
        setEditedText(result.text);
        setGeneratedTextId(result.id);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCommentary = async () => {
    setCommentaryLoading(true);
    try {
      const res = await fetch("/api/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemId: news.id }),
      });
      const data = await res.json();
      setCommentary(data.commentary);
    } finally {
      setCommentaryLoading(false);
    }
  };

  const handleCopy = async () => {
    const text = editedText || generatedText;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    if (generatedTextId) {
      const username = localStorage.getItem("news-gen-username");
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generatedTextId,
          sentBy: username || null,
          channel: "whatsapp_copy",
        }),
      });
    }
  };

  const scoreColor =
    news.score >= 80 ? "text-green-600" : news.score >= 60 ? "text-yellow-600" : "text-red-500";

  return (
    <Card className={selected ? "ring-2 ring-primary" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onChange={(e) =>
              onSelect(news.id, (e.target as HTMLInputElement).checked)
            }
            className="mt-1"
          />
          <div className="flex-1">
            <CardTitle className="text-base leading-tight">{news.title}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{news.source}</Badge>
              <span className={`text-sm font-bold ${scoreColor}`}>{news.score}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2">{news.reasoning}</p>

        {news.summary && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{news.summary}</p>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => handleGenerate("short")} disabled={generating}>
            קצר
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleGenerate("regular")} disabled={generating}>
            רגיל
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleGenerate("commentary")} disabled={generating}>
            פרשני
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCommentary} disabled={commentaryLoading}>
            {commentaryLoading ? "טוען..." : "ניתוח"}
          </Button>
        </div>

        {generatedText && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={editedText || ""}
              onChange={(e) => setEditedText(e.target.value)}
              className="min-h-[120px] text-sm"
              dir="rtl"
            />
            <Button size="sm" onClick={handleCopy}>
              📋 העתק לוואטסאפ
            </Button>
          </div>
        )}

        {commentary && (
          <div className="mt-3 p-3 bg-muted rounded-lg text-sm space-y-2">
            <div>
              <strong>מה קרה:</strong> {(commentary as Record<string, string>).what_happened}
            </div>
            <div>
              <strong>למה חשוב:</strong> {(commentary as Record<string, string>).why_important}
            </div>
            <div>
              <strong>שאלות נפוצות:</strong>
              <ul className="list-disc list-inside mr-2">
                {((commentary as Record<string, string[]>).common_questions || []).map(
                  (q: string, i: number) => (
                    <li key={i}>{q}</li>
                  )
                )}
              </ul>
            </div>
            <div>
              <strong>מה חשוב להבין:</strong> {(commentary as Record<string, string>).real_understanding}
            </div>
            <div>
              <strong>הזווית שלנו:</strong> {(commentary as Record<string, string>).our_angle}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
