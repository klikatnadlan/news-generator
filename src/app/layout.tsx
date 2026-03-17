import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מחולל חדשות - קליקת הנדל״ן",
  description: "מחולל כותרות ופרשנות יומי לקליקת הנדל״ן",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
