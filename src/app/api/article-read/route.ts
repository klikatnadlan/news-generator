import { NextRequest, NextResponse } from "next/server";
import { fetchArticleText } from "@/lib/fetch-article";

export const maxDuration = 20;

// In-app reader: fetch the full article body so it can be read inside LeaderFeed
// (no leaving the site). Token-free. Paywalled sites return only their teaser.
export async function GET(request: NextRequest) {
  const url = new URL(request.url).searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "bad url" }, { status: 400 });
  const text = await fetchArticleText(url, 8000);
  return NextResponse.json({
    text,
    full: text.length >= 400, // enough body to count as "the full article"
    chars: text.length,
  });
}
