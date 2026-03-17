"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Commentary } from "@/lib/types";

interface CommentaryPanelProps {
  newsItemId: string;
}

export function CommentaryPanel({ newsItemId }: CommentaryPanelProps) {
  const [commentary, setCommentary] = useState<Commentary | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadCommentary = async () => {
    if (commentary) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setExpanded(true);
    try {
      const res = await fetch("/api/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemId }),
      });
      const data = await res.json();
      setCommentary(data.commentary);
    } finally {
      setLoading(false);
    }
  };

  const formatText = () => {
    if (!commentary) return "";
    return `מה קרה?\n${commentary.what_happened}\n\nלמה זה חשוב?\n${commentary.why_important}\n\nמה אנשים שואלים?\n${commentary.common_questions.map((q) => `• ${q}`).join("\n")}\n\nמה צריך להבין באמת?\n${commentary.real_understanding}\n\nאיפה אנחנו נכנסים?\n${commentary.our_angle}`;
  };

  const copyCommentary = async () => {
    await navigator.clipboard.writeText(formatText());
  };

  const shareCommentary = () => {
    const encoded = encodeURIComponent(formatText());
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={loadCommentary}
        disabled={loading}
      >
        {loading ? "טוען..." : expanded ? "הסתר פרשנות" : "הצג פרשנות"}
      </Button>

      {expanded && commentary && (
        <div className="mt-3 p-4 border rounded-lg bg-blue-50/50 space-y-4 text-sm" dir="rtl">
          <div>
            <h4 className="font-bold mb-1">מה קרה?</h4>
            <p className="text-muted-foreground">{commentary.what_happened}</p>
          </div>
          <div>
            <h4 className="font-bold mb-1">למה זה חשוב?</h4>
            <p className="text-muted-foreground">{commentary.why_important}</p>
          </div>
          <div>
            <h4 className="font-bold mb-1">מה אנשים שואלים?</h4>
            <ul className="list-none space-y-1 text-muted-foreground">
              {commentary.common_questions.map((q, i) => (
                <li key={i}>• {q}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-1">מה צריך להבין באמת?</h4>
            <p className="text-muted-foreground">{commentary.real_understanding}</p>
          </div>
          <div>
            <h4 className="font-bold mb-1">איפה אנחנו נכנסים?</h4>
            <p className="text-muted-foreground">{commentary.our_angle}</p>
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={copyCommentary}>
              📋 העתק פרשנות
            </Button>
            <Button size="sm" variant="outline" onClick={shareCommentary}>
              📱 שתף בוואטסאפ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
