import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { fetchArticleText } from "@/lib/fetch-article";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// "סכם כתבה" — reads the FULL article (not just headline+subtitle) and returns
// a concise neutral summary. CLICK-ONLY, cached per URL so repeat = free.
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const url = sp.get("url") || "";
  const title = (sp.get("title") || "").slice(0, 300);
  const fallback = (sp.get("summary") || "").slice(0, 600);
  const refresh = sp.get("refresh") === "1";
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "bad url" }, { status: 400 });

  const cacheKey = `article_summary|${url}`;
  if (!refresh) {
    try {
      const { data: cached } = await supabase.from("narrative_cache").select("narratives").eq("cache_key", cacheKey).maybeSingle();
      if (cached?.narratives?.summary) return NextResponse.json({ ...cached.narratives, cached: true });
    } catch { /* fall through */ }
  }

  // Read the full article (token-free). Paywall → "" → fall back to teaser.
  const body = await fetchArticleText(url, 6000);
  const basedOnFull = body.length >= 400;
  const sourceText = body || fallback || title;
  if (!sourceText) return NextResponse.json({ error: "אין תוכן לסיכום" }, { status: 400 });

  const prompt = `סכם את הכתבה הבאה ב-3-5 משפטים תמציתיים בעברית עסקית. שמור על העובדות, המספרים והשמות. בלי הקדמות, בלי דעה, בלי מקפים ארוכים.

כותרת: ${title}

תוכן:
${sourceText}`;

  let summary = "";
  try {
    const resp = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 500, messages: [{ role: "user", content: prompt }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary = ((resp.content[0] as any)?.text || "").trim().replace(/\s*—\s*/g, ", ");
  } catch (e) {
    console.error("article-summary failed", e);
    return NextResponse.json({ error: "לא הצלחנו לסכם כרגע. נסה שוב." }, { status: 500 });
  }

  const payload = { summary, basedOnFull };
  if (summary) {
    try {
      await supabase.from("narrative_cache").upsert({ cache_key: cacheKey, narratives: payload, count: body.length, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
    } catch { /* ignore */ }
  }
  return NextResponse.json({ ...payload, cached: false });
}

export const maxDuration = 45;
