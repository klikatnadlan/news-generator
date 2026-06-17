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

// Mirror of TOPIC_KEYWORDS in ../route.ts (keep in sync).
const TOPIC_KEYWORDS: Record<string, string[]> = {
  "פיטורים": ["פיטורים", "פיטר", "מפטר", "פוטרו", "פיטרה", "פיטרו", "צמצומים", "קיצוצים"],
  "גיוסים": ["גיוס", "גייסה", "גייסו", "סבב", "השקעה", "השקעת", "מימון", "Series"],
  "אקזיט": ["אקזיט", "נמכרה", "נרכשה", "נמכר", "רכשה", "מיזוג", "M&A", "מימוש"],
  "AI": ["AI", "בינה מלאכותית", "GPT", "Anthropic", "OpenAI", "צ'אטבוט", "מודל שפה", "LLM"],
  "הנפקה": ["הנפקה", "IPO", "הנפיקה", "פלאסמנט", "בורסה"],
  "פינוי בינוי": ["פינוי בינוי", "פינוי-בינוי", "התחדשות עירונית", "תמ\"א 38"],
  "משכנתאות": ["משכנתא", "ריבית", "הלוואת זכאות", "תמהיל", "מחזור משכנתא"],
  "מחיר למשתכן": ["מחיר למשתכן", "מחיר מטרה", "דירה בהנחה", "זכאי משרד"],
  "מחירי דירות": ["מחירי דירות", "מדד מחירי", "מחיר דירה", "ירדו המחירים", "עלו המחירים"],
  "בנייה": ["התחלות בנייה", "סיומי בנייה", "היתרי בנייה", "התחיל לבנות"],
  "פרויקט חדש": ["פרויקט חדש", "מתחם חדש", "שכונה חדשה", "מגדל חדש", "מגדלים חדשים", "מתחם מגורים", "תוכנית חדשה", "יוקם", "ייבנה", "ייבנו", "יקים", "תקים"],
  "השקה": ["השק", "השיק", "השיקה", "משיק", "משיקה", "יצא לשיווק", "יצאה לשיווק", "ייצא לשיווק", "נפתח לשיווק", "נפתחו המכירות", "נפתחה ההרשמה", "חשפ", "נחשף"],
  "פריסייל": ["פריסייל", "פרי-סייל", "pre-sale", "presale", "מכירה מוקדמת", "טרום מכירה", "הרשמה מוקדמת", "מחיר מוקדם", "שלב ההרשמה"],
  "מבצע בפרויקט": ["מבצע", "הטבה", "הטבת", "הנחה", "מבצעי", "ללא ריבית", "80/20", "20/80", "סבסוד מימון", "הלוואת קבלן", "מימון נוח"],
  'דולר/מט"ח': ["דולר", "מט\"ח", "שקל", "אירו", "מטבע"],
  "אינפלציה": ["אינפלציה", "מדד מחירים", "מדד המחירים", "יוקר המחיה"],
  "בנקים": ["בנק", "אשראי", "פיקדון", "ריבית בנק ישראל"],
  "בורסה": ["בורסה", "מניות", "מדד תל אביב", "ת\"א 35", "ת\"א 125"],
};

function rangeToDays(range: string | null): number {
  if (range === "month") return 30;
  if (range === "day") return 1;
  return 7;
}

type RawHeadline = { title: string; source: string; score: number; scan_date: string; category: string };

function compactList(rows: RawHeadline[], cap: number): string {
  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, cap)
    .map((h) => `- ${h.title} (${h.source})`)
    .join("\n");
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "";
  const range = searchParams.get("range") || "week";
  const topic = searchParams.get("topic") || "";

  const days = rangeToDays(range);
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const curStart = new Date(now); curStart.setDate(now.getDate() - days);
  const curStartStr = curStart.toISOString().split("T")[0];
  const prevStart = new Date(now); prevStart.setDate(now.getDate() - days * 2);
  const prevStartStr = prevStart.toISOString().split("T")[0];

  const rangeLabel = range === "month" ? "החודש האחרון" : range === "day" ? "היום האחרון" : "השבוע האחרון";

  // ─── Cache check (15-min TTL). Diff is a click-triggered Claude call, so we
  // memoize per (category|range|topic) under a "diff|" prefix that never
  // collides with the main narratives cache. ───
  const cacheKey = `diff|${category}|${range}|${topic}`;
  const TTL_MS = 15 * 60 * 1000;
  try {
    const { data: cached } = await supabase
      .from("narrative_cache")
      .select("narratives, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached && now.getTime() - new Date(cached.created_at).getTime() < TTL_MS) {
      return NextResponse.json({ diff: cached.narratives, range, cached: true });
    }
  } catch {
    /* fall through to live generation */
  }

  // Pull the full 2-period window in one query, then split by date.
  const { data, error } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .gte("scan_date", prevStartStr)
    .lte("scan_date", todayStr)
    .order("score", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ diff: { changed: false, summary: "אין מספיק נתונים בטווח כדי להשוות.", new: [], faded: [], intensified: [], mood: "" }, range });
  }

  const all: RawHeadline[] = data.map((s: any) => {
    const item = s.news_items;
    const realSource = detectSourceFromUrl(item.source_url) || item.source;
    const cleanTitle = (item.title || "").replace(/<[^>]*>/g, "");
    return { title: cleanTitle, source: realSource, score: s.score, scan_date: s.scan_date, category: classifyTitle(cleanTitle) };
  });

  const matchTopic = (h: RawHeadline) => {
    if (!topic || !TOPIC_KEYWORDS[topic]) return true;
    const t = h.title.toLowerCase();
    return TOPIC_KEYWORDS[topic].some((k) => t.includes(k.toLowerCase()));
  };
  const inCategory = (h: RawHeadline) => (category ? h.category === category : h.score >= 30);

  const filtered = all.filter((h) => inCategory(h) && matchTopic(h));
  const current = filtered.filter((h) => h.scan_date >= curStartStr);
  const previous = filtered.filter((h) => h.scan_date < curStartStr);

  if (current.length === 0 && previous.length === 0) {
    return NextResponse.json({ diff: { changed: false, summary: `אין כותרות בנושא הזה ב${rangeLabel} או בתקופה שלפניו.`, new: [], faded: [], intensified: [], mood: "" }, range });
  }

  const focus = `${category || "כלל החדשות"}${topic ? ` · ${topic}` : ""}`;
  const prompt = `אתה אנליסט תקשורת ישראלי שמנתח איך משתנה השיח בנושא "${focus}".

קיבלת שתי רשימות כותרות:
1) "התקופה הקודמת" (${days} ימים שקדמו), ${previous.length} כותרות.
2) "התקופה הנוכחית" (${rangeLabel}), ${current.length} כותרות.

תקופה קודמת:
${compactList(previous, 35) || "(אין כותרות)"}

תקופה נוכחית:
${compactList(current, 35) || "(אין כותרות)"}

נתח מה השתנה בנרטיב התקשורתי בין התקופות — מה הציבור והעיתונאים מדברים עליו עכשיו שלא דיברו קודם, מה דעך, ומה התעצם. התמקד בשינוי האמיתי, לא ברעש.

החזר JSON בלבד בפורמט:
{
  "changed": true/false,
  "summary": "2-3 משפטים שמסבירים את עיקר השינוי בשיח, עם מספרים/שמות אם רלוונטי",
  "new": ["נרטיב חדש שצץ בתקופה הנוכחית", "..."],
  "faded": ["נרטיב שדעך מהתקופה הקודמת", "..."],
  "intensified": ["נרטיב שהתעצם / קיבל יותר תשומת לב", "..."],
  "mood": "משפט אחד על מצב הרוח / הטון של השיח עכשיו (למשל: חשש, אופטימיות זהירה, ביקורת על רגולציה)"
}

עד 4 פריטים בכל רשימה. אם אין שינוי משמעותי, החזר changed=false והסבר זאת ב-summary. רק JSON, בלי הסברים.`;

  let diff: any = { changed: false, summary: "לא הצלחנו לנתח את השינוי כרגע. נסה שוב.", new: [], faded: [], intensified: [], mood: "" };
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1300,
      messages: [{ role: "user", content: prompt }],
    });
    const rawText = (response.content[0] as any)?.text || "";
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      diff = {
        changed: !!parsed.changed,
        summary: parsed.summary || "",
        new: Array.isArray(parsed.new) ? parsed.new.slice(0, 4) : [],
        faded: Array.isArray(parsed.faded) ? parsed.faded.slice(0, 4) : [],
        intensified: Array.isArray(parsed.intensified) ? parsed.intensified.slice(0, 4) : [],
        mood: parsed.mood || "",
      };
    }
  } catch (e) {
    console.error("narratives/diff: generation/parse failed", e);
  }

  // Write-through cache (only if we got a real summary).
  if (diff.summary) {
    try {
      await supabase
        .from("narrative_cache")
        .upsert({ cache_key: cacheKey, narratives: diff, count: current.length + previous.length, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
    } catch (cacheErr) {
      console.error("narratives/diff: cache write failed", cacheErr);
    }
  }

  return NextResponse.json({ diff, range, curCount: current.length, prevCount: previous.length, cached: false });
}

export const maxDuration = 60;
