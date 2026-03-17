"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { ScoredNews } from "@/lib/types";

interface NewsCardProps {
  news: ScoredNews;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
}

export function NewsCard({ news, selected, onSelect }: NewsCardProps) {
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
            <CardTitle className="text-base leading-tight">{news.title}</CardTitle>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="secondary" className="text-xs">
                {news.source}
              </Badge>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: scoreBg, color: scoreColor }}
              >
                {news.score} נקודות
              </span>
            </div>
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
          <p className="text-sm text-muted-foreground line-clamp-2">
            {news.summary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
