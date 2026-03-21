import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Analyze star ratings and generate prompt adjustments
export async function POST() {
  const supabase = getSupabase();

  // Get rated texts from last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: rated } = await supabase
    .from("send_history")
    .select("whatsapp_text, quality_rating")
    .not("quality_rating", "is", null)
    .gte("sent_at", thirtyDaysAgo);

  if (!rated || rated.length < 3) {
    return NextResponse.json({ status: "not_enough_data", count: rated?.length || 0 });
  }

  const good = rated.filter((r: { quality_rating: number }) => r.quality_rating >= 4);
  const bad = rated.filter((r: { quality_rating: number }) => r.quality_rating <= 2);

  // Analyze patterns
  const analyzeGroup = (items: { whatsapp_text: string }[]) => {
    const texts = items.map(i => i.whatsapp_text || "");
    const avgLength = texts.reduce((sum, t) => sum + t.length, 0) / (texts.length || 1);
    const avgWords = texts.reduce((sum, t) => sum + t.split(/\s+/).length, 0) / (texts.length || 1);
    const hasNumbers = texts.filter(t => /\d/.test(t)).length / (texts.length || 1);
    const hasQuestion = texts.filter(t => t.includes("?")).length / (texts.length || 1);
    const hasPersonal = texts.filter(t => /אם אתה|מי ש|אתם ש/.test(t)).length / (texts.length || 1);
    return { avgLength: Math.round(avgLength), avgWords: Math.round(avgWords), hasNumbers: Math.round(hasNumbers * 100), hasQuestion: Math.round(hasQuestion * 100), hasPersonal: Math.round(hasPersonal * 100), count: items.length };
  };

  const goodPatterns = analyzeGroup(good);
  const badPatterns = analyzeGroup(bad);

  // Generate rules from patterns
  const rules: string[] = [];

  if (goodPatterns.count >= 2) {
    if (goodPatterns.hasNumbers > badPatterns.hasNumbers + 20) {
      rules.push(`הקהל מעדיף טקסטים עם מספרים ספציפיים (${goodPatterns.hasNumbers}% מהטובים vs ${badPatterns.hasNumbers}% מהגרועים). תמיד תכלול מספרים.`);
    }
    if (goodPatterns.avgWords < badPatterns.avgWords - 30) {
      rules.push(`הקהל מעדיף טקסטים קצרים יותר (ממוצע ${goodPatterns.avgWords} מילים בטובים vs ${badPatterns.avgWords} בגרועים). קצר עדיף.`);
    }
    if (goodPatterns.hasPersonal > badPatterns.hasPersonal + 20) {
      rules.push(`הקהל מעדיף טקסטים עם פנייה אישית (${goodPatterns.hasPersonal}% vs ${badPatterns.hasPersonal}%). תמיד תוסיף "אם אתה..." או "מי ש...".`);
    }
    if (goodPatterns.hasQuestion > badPatterns.hasQuestion + 20) {
      rules.push(`הקהל אוהב שאלות רטוריות (${goodPatterns.hasQuestion}% vs ${badPatterns.hasQuestion}%). תשלב שאלה בפתיחה.`);
    }
  }

  // Save top 3 good examples as few-shot
  const topExamples = good.slice(0, 3).map((g: { whatsapp_text: string }) => g.whatsapp_text?.slice(0, 300));
  if (topExamples.length > 0) {
    rules.push(`דוגמאות שקיבלו ציון גבוה מהקהל:\n${topExamples.map((e: string, i: number) => `(${i + 1}) ${e}...`).join("\n")}`);
  }

  // Deactivate old rules from feedback
  await supabase
    .from("prompt_adjustments")
    .update({ active: false })
    .eq("source", "feedback");

  // Insert new rules
  for (const rule of rules) {
    await supabase.from("prompt_adjustments").insert({
      rule_text: rule,
      source: "feedback",
      active: true,
    });
  }

  return NextResponse.json({
    status: "updated",
    rulesGenerated: rules.length,
    goodCount: goodPatterns.count,
    badCount: badPatterns.count,
    patterns: { good: goodPatterns, bad: badPatterns },
  });
}

// GET: fetch current active adjustments
export async function GET() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("prompt_adjustments")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  return NextResponse.json({ adjustments: data || [] });
}
