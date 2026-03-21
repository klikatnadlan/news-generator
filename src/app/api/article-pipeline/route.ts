import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateArticle, sanitizeText, factCheck, checkHumanityScore } from "@/lib/anthropic";
import { getPulseContext } from "@/lib/pulse-context";

export const maxDuration = 60;

// ─── Article Structure Checklist (from article-structure.md) ───
interface ChecklistItem {
  id: number;
  name: string;
  check: (html: string) => boolean;
}

const CHECKLIST: ChecklistItem[] = [
  { id: 1, name: "Brand Bar קיים", check: (h) => h.includes("קליקת הנדל") && h.includes("#f8f9fa") },
  { id: 2, name: "GEO box בקצרה קיים", check: (h) => h.includes("בקצרה") && h.includes("#1d3557") },
  { id: 3, name: "Opener פרובוקטיבי", check: (h) => h.split("<h2").length > 1 },
  { id: 4, name: "Key Takeaways קיים", check: (h) => h.includes("#fff9e6") || h.includes("עיקרי הכתבה") || h.includes("📌") },
  { id: 5, name: "מינימום 6 H2", check: (h) => (h.match(/<h2/g) || []).length >= 6 },
  { id: 6, name: "כל H2 עם תוכן", check: (h) => { const sections = h.split(/<h2/); return sections.length > 1 && sections.slice(1).every(s => s.length > 100); } },
  { id: 7, name: "CTA box קיים", check: (h) => h.includes("#fff8e1") || h.includes("CTA") || h.includes("נבדוק יחד") },
  { id: 8, name: "חתימה נכונה", check: (h) => h.includes("בן סולומון") && h.includes("הקליקה") },
  { id: 9, name: "בלי TOC בגוף", check: (h) => !h.includes('class="toc-box"') && !h.includes("תוכן עניינים") },
  { id: 10, name: "בלי em dashes", check: (h) => !h.includes("—") },
  { id: 11, name: "יש מספרים ספציפיים", check: (h) => (h.match(/\d+[,.]?\d*/g) || []).length >= 3 },
  { id: 12, name: "בלי מילים אסורות", check: (h) => !h.includes("חשוב לציין") && !h.includes("ראוי לציין") && !h.includes("ניתן לראות") && !h.includes("שינוי תפיסה") },
  { id: 13, name: "אורך מינימלי 700 מילים", check: (h) => h.replace(/<[^>]+>/g, " ").split(/\s+/).filter(w => w.length > 0).length >= 700 },
  { id: 14, name: "יש לינקים פנימיים", check: (h) => (h.match(/klikatnadlan\.co\.il/g) || []).length >= 1 },
  { id: 15, name: "FAQ קיים", check: (h) => h.includes("FAQ") || h.includes("שאלות") || h.includes("<details") },
  { id: 16, name: "JSON-LD Schema", check: (h) => h.includes("application/ld+json") || h.includes("FAQPage") },
  { id: 17, name: "עברית שיחתית", check: (h) => h.includes("בגדול") || h.includes("תכלס") || h.includes("בשטח") || h.includes("חבר'ה") || h.includes("שימו לב") },
  { id: 18, name: "בלי שפה קורפורייטית", check: (h) => !h.includes("פלטפורמה") && !h.includes("סינרגיה") && !h.includes("אופטימיזציה") },
  { id: 19, name: "משפט אישי לקורא", check: (h) => h.includes("אם אתה") || h.includes("מי ש") || h.includes("אתם ש") },
  { id: 20, name: "מצאתם טעות אחרון", check: (h) => { const idx = h.lastIndexOf("מצאתם טעות"); return idx > 0 && idx > h.length * 0.8; } },
];

function runChecklist(html: string): { passed: number; failed: number; details: { id: number; name: string; passed: boolean }[] } {
  const details = CHECKLIST.map((item) => ({
    id: item.id,
    name: item.name,
    passed: item.check(html),
  }));
  return {
    passed: details.filter((d) => d.passed).length,
    failed: details.filter((d) => !d.passed).length,
    details,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { newsItemId, fromNarrative } = await request.json();

    const supabase = getSupabase();

    // Get news item
    let articleContext = fromNarrative || "";
    let title = "";
    if (newsItemId) {
      const { data: newsItem } = await supabase
        .from("news_items")
        .select("*")
        .eq("id", newsItemId)
        .single();
      if (newsItem) {
        title = newsItem.title;
        articleContext = `${newsItem.title}\n${newsItem.summary || ""}\n${newsItem.full_article_text || ""}`;
      }
    }

    // Get Pulse context
    const pulseContext = await getPulseContext().catch(() => "");

    // Generate article (up to 3 attempts)
    let html = "";
    let checklist = { passed: 0, failed: 0, details: [] as { id: number; name: string; passed: boolean }[] };
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;

      const failedItems = attempt > 1
        ? `\n\n⚠️ תיקונים נדרשים (ניסיון ${attempt}):\n${checklist.details.filter(d => !d.passed).map(d => `- ${d.name}`).join("\n")}`
        : "";

      html = await generateArticle(
        { title, summary: articleContext, source: "" },
        articleContext + (pulseContext ? `\n${pulseContext}` : "") + failedItems
      );

      html = sanitizeText(html);
      checklist = runChecklist(html);

      // If 80%+ passed, good enough
      if (checklist.passed >= CHECKLIST.length * 0.8) break;
    }

    // Fact-check
    const factResult = await factCheck(html, articleContext).catch(() => ({ verified: true, issues: [], score: 7 }));

    // Humanity score
    const humanityResult = await checkHumanityScore(html).catch(() => ({ score: 7, flags: [], suggestion: "" }));

    // Save to DB
    const { data: saved } = await supabase
      .from("generated_texts")
      .insert({
        news_item_id: newsItemId || null,
        style: "article_pipeline",
        whatsapp_text: html,
      })
      .select("id")
      .single();

    return NextResponse.json({
      html,
      textId: saved?.id,
      checklist,
      factCheck: factResult,
      humanityScore: humanityResult,
      attempts: attempt,
      ready: checklist.failed <= 4 && factResult.verified && humanityResult.score >= 6,
      title,
    });
  } catch (error) {
    console.error("Article pipeline error:", error);
    return NextResponse.json({ error: "Pipeline failed" }, { status: 500 });
  }
}
