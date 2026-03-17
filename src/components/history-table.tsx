"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface HistoryEntry {
  id: string;
  sent_at: string;
  sent_by: string | null;
  channel: string;
  generated_texts: {
    style: string;
    whatsapp_text: string;
    news_items: {
      title: string;
    };
  };
}

interface HistoryTableProps {
  history: HistoryEntry[];
}

const styleLabels: Record<string, string> = {
  short: "קצר",
  regular: "רגיל",
  commentary: "פרשני",
};

export function HistoryTable({ history }: HistoryTableProps) {
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        אין היסטוריה עדיין
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">תאריך</TableHead>
          <TableHead className="text-right">כותרת</TableHead>
          <TableHead className="text-right">סגנון</TableHead>
          <TableHead className="text-right">נשלח ע״י</TableHead>
          <TableHead className="text-right">ערוץ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="text-xs">{formatDate(entry.sent_at)}</TableCell>
            <TableCell className="font-medium text-sm">
              {entry.generated_texts?.news_items?.title || "—"}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">
                {styleLabels[entry.generated_texts?.style] || entry.generated_texts?.style}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">{entry.sent_by || "—"}</TableCell>
            <TableCell className="text-xs">
              {entry.channel === "whatsapp_copy" ? "📋 העתקה" : "📱 שיתוף"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
