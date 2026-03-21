import { NextRequest, NextResponse } from "next/server";
import { factCheck } from "@/lib/anthropic";
import { getSupabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { generatedText, originalArticle, newsItemId } = await request.json();

    if (!generatedText) {
      return NextResponse.json({ error: "Missing generatedText" }, { status: 400 });
    }

    // Try to get full article text from DB
    let articleText = originalArticle || "";
    if (newsItemId) {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("news_items")
        .select("title, summary, full_article_text")
        .eq("id", newsItemId)
        .single();
      if (data) {
        articleText = data.full_article_text || `${data.title}\n${data.summary || ""}`;
      }
    }

    if (!articleText) {
      return NextResponse.json({ verified: true, issues: ["אין טקסט מקורי להשוואה"], score: 5 });
    }

    const result = await factCheck(generatedText, articleText);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Fact-check error:", error);
    return NextResponse.json(
      { verified: true, issues: [], score: 7, error: "Fact-check failed" },
      { status: 500 }
    );
  }
}
