import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("globes.co.il")) return "גלובס";
  if (lower.includes("calcalist.co.il")) return "כלכליסט";
  if (lower.includes("themarker.com")) return "דה מרקר";
  if (lower.includes("ynet.co.il")) return "ynet";
  if (lower.includes("maariv.co.il")) return "מעריב";
  if (lower.includes("bizportal.co.il")) return "ביזפורטל";
  if (lower.includes("walla.co.il")) return "וואלה";
  if (lower.includes("israelhayom.co.il")) return "ישראל היום";
  if (lower.includes("ice.co.il")) return "ICE";
  return null;
}

// ─── Category classification (mirrors week-all logic) ───
const RE_KW = ["נדל\"ן","דירה","דירות","משכנתא","בנייה","קבלן","מחיר למשתכן","פינוי בינוי","התחדשות עירונית","מס רכישה","שכירות","מגורים","ריבית","תב\"ע","יזם","עסקאות נדל","התחלות בנייה"];
const HI_KW = ["הייטק","סטארטאפ","טכנולוגיה","בינה מלאכותית","AI","סייבר","ענן","גיוס הון","הנפקה","IPO","nvidia","אינווידיה","גוגל","אפל","מיקרוסופט","צ'יפ","שבב","יוניקורן","אקזיט","פינטק","ביוטק"];
const EC_KW = ["כלכלה","בורסה","מניות","דלק","אנרגיה","חשמל","אינפלציה","מדד","תוצר","מיסים","בנק","אשראי","ביטוח","קמעונאות","רכישה","מיזוג","שכר","אבטלה","שקל","דולר","מט\"ח"];

function classifyTitle(title: string): string {
  const t = title.toLowerCase();
  for (const k of RE_KW) if (t.includes(k.toLowerCase())) return 'נדל"ן';
  for (const k of HI_KW) if (t.includes(k.toLowerCase())) return "הייטק";
  for (const k of EC_KW) if (t.includes(k.toLowerCase())) return "כלכלה";
  return "אחר";
}

// ─── Topic keyword maps (used when ?topic=X is provided) ───
const TOPIC_KEYWORDS: Record<string, string[]> = {
  // הייטק
  "פיטורים": ["פיטורים", "פיטר", "מפטר", "פוטרו", "פיטרה", "פיטרו", "צמצומים", "קיצוצים"],
  "גיוסים": ["גיוס", "גייסה", "גייסו", "סבב", "השקעה", "השקעת", "מימון", "Series"],
  "אקזיט": ["אקזיט", "נמכרה", "נרכשה", "נמכר", "רכשה", "מיזוג", "M&A", "מימוש"],
  "AI": ["AI", "בינה מלאכותית", "GPT", "Anthropic", "OpenAI", "צ'אטבוט", "מודל שפה", "LLM"],
  "הנפקה": ["הנפקה", "IPO", "הנפיקה", "פלאסמנט", "בורסה"],
  // נדל"ן
  "פינוי בינוי": ["פינוי בינוי", "פינוי-בינוי", "התחדשות עירונית", "תמ\"א 38"],
  "משכנתאות": ["משכנתא", "ריבית", "הלוואת זכאות", "תמהיל", "מחזור משכנתא"],
  "מחיר למשתכן": ["מחיר למשתכן", "מחיר מטרה", "דירה בהנחה", "זכאי משרד"],
  "מחירי דירות": ["מחירי דירות", "מדד מחירי", "מחיר דירה", "ירדו המחירים", "עלו המחירים"],
  "בנייה": ["התחלות בנייה", "סיומי בנייה", "היתרי בנייה", "התחיל לבנות"],
  // נדל"ן — project-level
  "פרויקט חדש": ["פרויקט חדש", "מתחם חדש", "שכונה חדשה", "מגדל חדש", "מגדלים חדשים", "מתחם מגורים", "תוכנית חדשה", "יוקם", "ייבנה", "ייבנו", "יקים", "תקים"],
  "השקה": ["השק", "השיק", "השיקה", "משיק", "משיקה", "יצא לשיווק", "יצאה לשיווק", "ייצא לשיווק", "נפתח לשיווק", "נפתחו המכירות", "נפתחה ההרשמה", "חשפ", "נחשף"],
  "פריסייל": ["פריסייל", "פרי-סייל", "pre-sale", "presale", "מכירה מוקדמת", "טרום מכירה", "הרשמה מוקדמת", "מחיר מוקדם", "שלב ההרשמה"],
  "מבצע בפרויקט": ["מבצע", "הטבה", "הטבת", "הנחה", "מבצעי", "ללא ריבית", "80/20", "20/80", "סבסוד מימון", "הלוואת קבלן", "מימון נוח"],
  // כלכלה
  "דולר/מט\"ח": ["דולר", "מט\"ח", "שקל", "אירו", "מטבע"],
  "אינפלציה": ["אינפלציה", "מדד מחירים", "מדד המחירים", "יוקר המחיה"],
  "בנקים": ["בנק", "אשראי", "פיקדון", "ריבית בנק ישראל"],
  "בורסה": ["בורסה", "מניות", "מדד תל אביב", "ת\"א 35", "ת\"א 125"],
};

function rangeToDays(range: string | null): number {
  if (range === "month") return 30;
  if (range === "day") return 1;
  return 7; // default: week
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "";
  const range = searchParams.get("range") || "week";
  const topic = searchParams.get("topic") || ""; // optional: filter by predefined topic

  const days = rangeToDays(range);
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - days);
  const startStr = startDate.toISOString().split("T")[0];

  // ─── Cache check ───
  // Narrative synthesis is the slowest call in the app (Sonnet over dozens of
  // headlines). Memoize per (category|range|topic) with a 15-minute TTL so a
  // second viewer — or the same user toggling tabs — gets an instant result
  // and we skip both the headlines query and the Claude call.
  const cacheKey = `${category}|${range}|${topic}`;
  const TTL_MS = 15 * 60 * 1000;
  try {
    const { data: cached } = await supabase
      .from("narrative_cache")
      .select("narratives, count, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached && now.getTime() - new Date(cached.created_at).getTime() < TTL_MS) {
      return NextResponse.json({
        narratives: cached.narratives || [],
        range,
        startStr,
        todayStr,
        count: cached.count,
        cached: true,
      });
    }
  } catch {
    // Cache miss / table issue — fall through to live generation
  }

  const { data, error } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .gte("scan_date", startStr)
    .lte("scan_date", todayStr)
    .order("score", { ascending: false })
    .limit(800);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ narratives: [], range, startStr, todayStr });
  }

  type RawHeadline = { title: string; source: string; score: number; scan_date: string; category: string };
  const allHeadlines: RawHeadline[] = data.map((s: any) => {
    const item = s.news_items;
    const realSource = detectSourceFromUrl(item.source_url) || item.source;
    const cleanTitle = (item.title || "").replace(/<[^>]*>/g, "");
    return {
      title: cleanTitle,
      source: realSource,
      score: s.score,
      scan_date: s.scan_date,
      category: classifyTitle(cleanTitle),
    };
  });

  // Step 1: filter by category if provided
  let headlines = category
    ? allHeadlines.filter((h) => h.category === category)
    : allHeadlines.filter((h) => h.score >= 30);

  // Step 2: filter by topic keywords if provided
  if (topic && TOPIC_KEYWORDS[topic]) {
    const kws = TOPIC_KEYWORDS[topic].map((k) => k.toLowerCase());
    headlines = headlines.filter((h) => {
      const t = h.title.toLowerCase();
      return kws.some((k) => t.includes(k));
    });
  }

  if (headlines.length === 0) {
    return NextResponse.json({ narratives: [], range, startStr, todayStr, count: 0 });
  }

  // Cap aggressively. נדל"ן had ~150+ candidates and was timing out at ~40s on
  // Vercel (one cold start from a 504). 45 top-scored items is plenty for
  // clustering recurring narratives and keeps the Sonnet call well under the
  // function timeout.
  headlines.sort((a, b) => b.score - a.score);
  const capped = headlines.slice(0, 45);

  // Drop summary text — title + source + score is enough signal for clustering
  // and keeps the prompt small enough to fit comfortably in a 60s response.
  const headlineList = capped
    .map((h) => `[${h.scan_date}] ${h.title} (${h.source}, ציון: ${h.score})`)
    .join("\n");

  // ─── Theme hints per category — bias the model toward what readers care about ───
  const THEME_HINTS: Record<string, string> = {
    "הייטק": "שים לב במיוחד לסיפורים כמו: פיטורים, גיוסי הון, אקזיטים ורכישות, AI ובינה מלאכותית, הנפקות וIPO, חברות ישראליות במכירה, השקעות זרות בישראל.",
    "נדל\"ן": "שים לב במיוחד לסיפורים כמו: מחירי דירות (עליות/ירידות), משכנתאות וריבית, פינוי בינוי והתחדשות עירונית, מחיר למשתכן ודירה בהנחה, התחלות וסיומי בנייה, רגולציה ומיסוי.",
    "כלכלה": "שים לב במיוחד לסיפורים כמו: דולר ושקל ומט\"ח, אינפלציה ומדד מחירים, ריבית בנק ישראל, בורסה ומניות, אבטלה ושכר, מצב המשק הכללי.",
  };

  const rangeLabel = range === "month" ? "חודש האחרון" : range === "day" ? "יום האחרון" : "שבוע האחרון";
  const themeHint = category && THEME_HINTS[category] ? `\n\n${THEME_HINTS[category]}` : "";
  const topicHint = topic ? `\n\nהמשתמש בחר נושא ספציפי: "${topic}". בנה נרטיבים סביב הנושא הזה בלבד.` : "";

  // Sonnet 4. (Haiku would be faster/cheaper for this clustering task but this
  // account 404s on claude-3-5-haiku-20241022 — see SCORING_MODEL note.) To
  // keep the flagship נדל"ן feed away from Vercel's timeout we instead cap the
  // candidate set hard (see slice above) and keep max_tokens lean.
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    // 1500 tokens. NOTE: do NOT lower this — Hebrew narratives tokenize
    // heavily, and at 1000 the JSON array got truncated mid-output (no closing
    // bracket → parse fails → empty result). Latency is handled by the cache
    // (repeat views are instant) and the candidate cap, not by starving the
    // output budget.
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `אתה מנתח נרטיבים תקשורתיים${category ? ` בתחום ${category}` : ""}. קיבלת רשימת כותרות חדשות מה${rangeLabel}.

זהה את הנרטיבים המרכזיים שרצו ב${rangeLabel} — נושאים שחוזרים בכמה כתבות ממקורות שונים, בעיקר סיפורים עם מספרים, אקזיטים, רכישות, מהלכים גדולים.${themeHint}${topicHint}

כותרות (סה"כ ${capped.length}):
${headlineList}

החזר JSON בלבד, בפורמט הזה:
[
  {
    "title": "כותרת הנרטיב (קצרה, 3-6 מילים, עם מספר אם רלוונטי)",
    "count": מספר כתבות על הנושא,
    "summary": "1-2 משפטים שמסכמים את הנרטיב ומציינים שמות חברות / מספרים ספציפיים אם יש",
    "sources": ["רשימת מקורות שכיסו את הנושא"]
  }
]

מקסימום 8 נרטיבים, מסודרים לפי כמות כתבות (מהרב למעט). העדף נרטיבים עם 2+ כתבות.
רק JSON, בלי הסברים.`,
      },
    ],
  });

  let narratives: any[] = [];
  const rawText = (response.content[0] as any)?.text || "";
  try {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      narratives = JSON.parse(match[0]);
    } else {
      throw new Error("no array match");
    }
  } catch {
    // Salvage: the array may be truncated (no closing ]). Pull out every
    // complete {...} object so we still return something instead of empty.
    try {
      const objs = rawText.match(/\{[^{}]*\}/g) || [];
      narratives = objs
        .map((o: string) => {
          try { return JSON.parse(o); } catch { return null; }
        })
        .filter((n: any) => n && n.title);
    } catch {
      narratives = [];
    }
    if (narratives.length === 0) {
      console.error("narratives: parse produced 0 results. raw starts:", rawText.slice(0, 120));
    }
  }

  // Write-through cache. Only store non-empty results so a transient empty
  // generation doesn't get pinned for 15 minutes.
  if (narratives.length > 0) {
    try {
      await supabase
        .from("narrative_cache")
        .upsert(
          { cache_key: cacheKey, narratives, count: capped.length, created_at: new Date().toISOString() },
          { onConflict: "cache_key" },
        );
    } catch (cacheErr) {
      console.error("narratives: cache write failed", cacheErr);
    }
  }

  return NextResponse.json({ narratives, range, startStr, todayStr, count: capped.length, cached: false });
}

export const maxDuration = 60;
