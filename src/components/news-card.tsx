"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { WhatsAppPanel } from "./whatsapp-panel";
import { CommentaryPanel } from "./commentary-panel";
import type { ScoredNews } from "@/lib/types";

interface NewsCardProps {
  news: ScoredNews;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
}

export function NewsCard({ news, selected, onSelect }: NewsCardProps) {
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const scoreBorderColor =
    news.score >= 80
      ? "border-l-green-500"
      : news.score >= 60
      ? "border-l-yellow-500"
      : "border-l-orange-500";

  const scoreColor =
    news.score >= 80
      ? "text-green-600"
      : news.score >= 60
      ? "text-yellow-600"
      : "text-orange-500";

  return (
    <Card
      className={`border-l-4 ${scoreBorderColor} ${
        selected ? "ring-2 ring-primary bg-primary/5" : ""
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onChange={(e) =>
              onSelect(news.id, (e.target as HTMLInputElement).checked)
            }
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base leading-tight">
              {news.title}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="secondary" className="text-xs">
                {news.source}
              </Badge>
              <span className={`text-sm font-bold ${scoreColor}`}>
                {news.score}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{news.reasoning}</p>

        {news.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {news.summary}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {!showWhatsApp && (
            <button
              onClick={() => setShowWhatsApp(true)}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700"
            >
              צור נוסח לוואטסאפ
            </button>
          )}
          <CommentaryPanel newsItemId={news.id} />
        </div>

        {showWhatsApp && <WhatsAppPanel newsItemId={news.id} />}
      </CardContent>
    </Card>
  );
}
