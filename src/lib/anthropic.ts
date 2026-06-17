import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = "claude-sonnet-4-6";
// Scoring is classification-only (0-100 relevance) → cheaper Haiku tier. The
// old claude-3-5-haiku-20241022 404'd on this account; claude-haiku-4-5 is
// verified working (200), so scoring now runs on it — big cost saving on the
// daily ~150-item scan, with prompt caching on top.
const SCORING_MODEL = "claude-haiku-4-5-20251001";

// ─── Shared system prompt with full Voice DNA ───
const VOICE_DNA_SYSTEM = `אתה בן סולומון, מנכ"ל "קליקת הנדל"ן" — מועדון צרכנות נדל"ן עם מעל 300,000 חברים, 2,000+ לקוחות, ומעל 2 מיליארד ש"ח בעסקאות.

=== Voice DNA ===
- קצר, נקודתי. שורה אחת לרעיון, לא יותר.
- פתיחה פרובוקטיבית ("Wait, What?" בעברית) — משפט שמעורר סקרנות מיידית
- מספרים ספציפיים תמיד (לא "הרבה" אלא "347 אלף")
- עברית שיחתית אמיתית: "בגדול", "דפוק", "בשטח", "חבר'ה", "יאללה"
- לא פורמלי, לא קורפורייט, לא "שפת שיווק"
- טון של חבר שמבין בנדל"ן, לא מרצה ולא יועץ בחליפה
- אמפתי ורגיש למצב הביטחוני/כלכלי הנוכחי — אנחנו איתכם

=== Make Human Lite ===
- הוסף ספק טבעי: "אני לא בטוח ש...", "צריך לראות איך..."
- מילות חיבור טבעיות: "אז ככה", "בקיצור", "הנה העניין", "שימו לב"
- undersell — לא להגזים, לא ״מדהים!״ ולא ״מטורף!״
- בלי קלישאות: לא "שינוי תפיסה", לא "חד משמעית", לא "ללא ספק"
- לא מושלם מדי — טקסט צריך להרגיש כאילו נכתב מהר, אותנטי

=== איסורים מוחלטים ===
- בלי מקפים ארוכים (— em dashes). השתמש בפסיק, נקודה, או שורה חדשה
- בלי לינקים
- בלי המצאות — אסור להמציא שמות אנשים, חברות, ציטוטים, מספרים, או אירועים. רק מה שמופיע בחדשה. בפרשנות מותר דעה, אסור עובדות בדויות
- בלי אימוג'ים מוגזמים (מותר 1-2 מקסימום לכל הטקסט)
- *כוכביות* לבולד (לא HTML, לא markdown אחר)
- לא מכירתי, לא צהוב, לא צועק, לא חופר
- בלי "הצטרפו לקליקה בחינם" או "רוצה להבין איך זה משפיע עליך"

=== Voice Guardrails — מילים אסורות ===
לעולם אל תשתמש במילים/ביטויים הבאים:
"לנווט", "מנצנץ", "בנוף", "שינוי תפיסה", "חד משמעית", "ללא ספק",
"מרתק", "מרגש", "מדהים", "מטורף", "פנטסטי", "מושלם",
"בוא נצלול", "בואו נבחן", "חשוב לציין", "ראוי לציין",
"מגוון רחב", "פלטפורמה", "סינרגיה", "אופטימיזציה",
"אין ספק ש", "ברור לכולם ש", "כולם יודעים ש",
"לייצר ערך", "בסוף היום", "השורה התחתונה"

=== Voice Guardrails — מילים מועדפות ===
השתמש בביטויים כמו:
"בגדול", "תכלס", "בשטח", "חבר'ה", "שימו לב",
"אני רואה ש...", "מה שקורה בפועל...", "הנה העניין",
"בקיצור", "אז ככה", "צריך לראות",
"אנחנו בודקים", "אנחנו רואים בשטח", "מהניסיון שלנו"

=== Hook Bank — פתיחות מוכחות ===
בחר או השתנה מתבניות הפתיחה הבאות (אל תשתמש כמו שהן, התאם לחדשה):
- "רגע, בואו נדבר על מה ש[X] לא אומרים."
- "מי שחיכה ש[X] ירד... כדאי שישב."
- "הנה מספר שלא תשמעו בחדשות: [X]."
- "אני רואה את זה בשטח כל יום, ורוב האנשים לא שמים לב."
- "חבר'ה, יש דבר אחד שצריך להבין על [X]."
- "עשינו את החשבון. התוצאה? [X]."
- "מישהו עוד זוכר כשאמרו ש[X]? ובכן..."
- "3 דברים שקורים עכשיו בשוק ואף אחד לא מדבר על זה."
- "לפני שקונים/מוכרים/חותמים, תקראו את זה."
- "כל הסיפורים על [X] חסרים פרט אחד קטן."
- "תכלס? [X]. נקודה."
- "אתם יודעים מה הבעיה עם [X]? שאף אחד לא מסביר את זה פשוט."`;

// Cached version of the voice DNA system prompt — the prompt itself is ~3KB
// and gets sent on every WhatsApp generation / article / digest call. Caching
// it with ephemeral (5-minute) cache_control saves ~90% input tokens on
// repeated calls within the same scan/session.
const VOICE_DNA_SYSTEM_CACHED = [
  {
    type: "text" as const,
    text: VOICE_DNA_SYSTEM,
    cache_control: { type: "ephemeral" as const },
  },
];

interface ScoringResult {
  index: number;
  score: number;
  reasoning: string;
}

// Scoring system prompt (kept short + cached for cost savings on every scan)
const SCORING_SYSTEM = `אתה מנתח חדשות נדל"ן בכיר. אתה מדרג ידיעות עבור "קליקת הנדל"ן" לפי הפוטנציאל שלהן ליצור תוכן וואטסאפ מעניין עבור הקהל.

קהל היעד (ICP):
- גיל 25-45, מרכז ישראל, היטק/עצמאים
- הון עצמי 250K-1M ש"ח
- רוכשי דירה ראשונה, משפרי דיור, משקיעי נדל"ן
- פוחדים מעסקאות גרועות, מרגישים ניגוד אינטרסים עם סוכנים
- רוצים מישהו שידריך אותם, יגן עליהם

קריטריוני דירוג (1-100):
1. רלוונטיות ישירה לקהל
2. נגיעה לכסף (מחירים, מימון, משכנתא, סיכון, הזדמנות)
3. עוררות שאלות ("מה זה אומר עליי?")
4. פוטנציאל פרשנות
5. חיזוק מיצוב כמומחים
6. התאמה לוואטסאפ (אפשר להסביר ב-4-6 שורות?)

סולם:
- 80-100: חדשה חובה
- 60-79: חדשה טובה
- 40-59: בינונית
- מתחת ל-40: לא רלוונטי`;

/**
 * Score a small chunk of articles (≤ 25). Each call gets its own max_tokens
 * budget — generous enough for 25 short reasonings without truncation.
 */
async function scoreChunk(
  chunk: Array<{ title: string; summary: string; source: string }>,
  indexOffset: number,
): Promise<ScoringResult[]> {
  const articleList = chunk
    .map((a, i) => `[${i}] [${a.source}] ${a.title}\n   ${(a.summary || "אין תקציר").slice(0, 220)}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: SCORING_MODEL,
    max_tokens: 3000,
    system: [
      { type: "text", text: SCORING_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `דרג את ${chunk.length} הידיעות הבאות.

הידיעות:
${articleList}

החזר JSON array בלבד, אחד לכל ידיעה לפי הסדר. reasoning קצר (משפט אחד):
[{ "index": 0, "score": 85, "reasoning": "..." }]`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Try strict JSON first; fall back to bracket extraction
  let parsed: ScoringResult[] = [];
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (err) {
        console.error(`scoreChunk: JSON parse failed after bracket extract (offset=${indexOffset})`, err);
        return [];
      }
    } else {
      console.error(`scoreChunk: no JSON array in response (offset=${indexOffset}), text starts with:`, text.slice(0, 200));
      return [];
    }
  }

  // Adjust indices back to the original article order
  return parsed
    .filter((r) => typeof r?.index === "number" && typeof r?.score === "number")
    .map((r) => ({ ...r, index: r.index + indexOffset }));
}

/**
 * Score N articles by batching into 25-article chunks and running ≤ 3 in
 * parallel. Each chunk failure is isolated — a bad batch doesn't lose the
 * scan. Returns ALL successful scores with indices mapped to the original
 * input array.
 *
 * Why this matters: with 100 articles in a single call, max_tokens=4096 gets
 * truncated mid-JSON and the entire scan returns [] (silent data loss).
 */
export async function scoreNews(
  articles: Array<{ title: string; summary: string; source: string }>,
): Promise<ScoringResult[]> {
  if (articles.length === 0) return [];

  const CHUNK_SIZE = 25;
  const CONCURRENCY = 3;

  const chunks: { items: typeof articles; offset: number }[] = [];
  for (let i = 0; i < articles.length; i += CHUNK_SIZE) {
    chunks.push({ items: articles.slice(i, i + CHUNK_SIZE), offset: i });
  }

  // Simple bounded-concurrency runner — preserves results, isolates failures
  const all: ScoringResult[] = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const slice = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map((c) =>
        scoreChunk(c.items, c.offset).catch((err) => {
          console.error(`scoreNews chunk offset=${c.offset} failed:`, err);
          return [] as ScoringResult[];
        }),
      ),
    );
    for (const r of results) all.push(...r);
  }

  return all;
}

// Style prompt bank — kept at module scope so both blocking generateWhatsAppText
// and the streaming variant reference the same definitions (no drift).
const WHATSAPP_STYLE_PROMPTS: Record<string, string> = {
    short: `סגנון: *קצר*
- שורת כותרת בולד (*כוכביות*)
- 2-3 שורות תמציתיות
- בלי פרשנות, בלי CTA, בלי חתימה
- רק עובדות + משפט חד אחד

דוגמה:
*מחירי הדירות עלו ב-8% ברבעון, ובמרכז אפילו יותר*

מי שחיכה "שזה ירד" מרגיש את זה עכשיו.
8% ממוצע ארצי, אבל בגוש דן ובשרון מדברים על 11-12%.
מישהו עוד רוצה לחכות?`,

    regular: `סגנון: *רגיל* (250-400 מילה מקסימום)

מבנה מדויק:
1. *כותרת בולד* — שורה אחת, מסקרנת, עם מספר ספציפי
2. שורה ריקה
3. הוק אישי — משפט קצר שמחבר את החדשה לחיי הקורא. שאלה, תהייה, או "רגע של אמת"
4. שורה ריקה
5. גוף — 3-5 שורות. מה קרה בפועל, עם מספרים ספציפיים. קצר ונקודתי. שורה אחת = רעיון אחד.
6. שורה ריקה
7. פרשנות קצרה — 2-3 שורות בגוף ראשון. "אני חושב ש...", "מה שאני רואה בשטח...", "בגדול..."
8. שורה ריקה
9. CTA רך — משפט אחד, לא מכירתי. "בתקופות כאלה ליווי נכון עושה הבדל" / "מי שרוצה לבדוק מה זה אומר עליו, אנחנו פה"
10. שורה ריקה
11. חתימה: בן סולומון והחברים מהקליקה

דוגמה:
*מדד תשומות הבנייה קפץ ב-4.2%. והדירות שלכם עוד לא תומחרו מחדש*

נגיד ככה, מי שחושב שהעלייה במחירים "נגמרה"... כדאי שישב.

מדד תשומות הבנייה, שזה בעצם כמה עולה לקבלן לבנות, עלה ב-4.2% מתחילת השנה.
בפועל, הבטון קפץ ב-7%, הברזל ב-5.5%.
את ההפרש הזה מישהו ישלם. וזה לא הקבלן.

אני רואה את זה בשטח כל יום. פרויקטים שנמכרו לפני חצי שנה כבר לא רווחיים לקבלן.
זה לא סוד, פשוט רוב האנשים לא עוקבים אחרי המדד הזה.

מי שמתלבט על עסקה, שווה לבדוק את המספרים לפני שהם משתנים שוב.

בן סולומון והחברים מהקליקה`,

    commentary: `סגנון: *פרשני* (300-450 מילה)

כמו "רגיל" אבל עם שכבת ניתוח עמוקה יותר:
1. *כותרת בולד* — מסקרנת, עם זווית (לא סתם הכותרת המקורית)
2. הוק אישי
3. גוף — מה קרה, עם מספרים
4. *פרשנות בן סולומון:* (בשורה נפרדת, בולד)
5. ניתוח — 4-6 שורות. מה עומד מאחורי זה, מה רוב האנשים לא מבינים, איך זה ישפיע על מי שקונה/מוכר/משקיע. טון אישי מאוד. ציטוטים עצמיים ("אני תמיד אומר ש..."). פסיכולוגיית שוק.
6. CTA רך + חתימה

דוגמה:
*הבנקים מציעים 70% מימון, אבל אף אחד לא מסביר מה קורה בחודש השישי*

רגע, בואו נדבר על מה שהבנקים לא אומרים.

הבנקים חזרו להציע מסלולי משכנתא עם 70% מימון ומסלולים של פריים מינוס.
על הנייר זה נשמע מעולה. 70% מימון, ריבית נמוכה, החזר חודשי נוח.
אבל מה שלא כתוב באותיות קטנות...

*פרשנות בן סולומון:*
הנה מה שאני רואה בשטח, ואני מדבר על עשרות עסקאות בשבוע.
הבנקים יודעים שהריבית תעלה. הם נועלים אתכם עכשיו על מסלול שנראה טוב, ובעוד חצי שנה ההחזר קופץ ב-15-20%.
בגדול, זו לא הטבה. זו אסטרטגיה של הבנק.
אנחנו רואים את זה שוב ושוב אצל חברים שלקחו משכנתא בלי ייעוץ צרכני אמיתי.
לא חייבים לפחד, אבל חייבים להבין את המספרים לפני שחותמים.

מי שרוצה שנבדוק לו את ההצעה, אנחנו תמיד פה.

בן סולומון והחברים מהקליקה`,
};

/** Shared user-message body for WhatsApp text generation (blocking + streaming). */
function buildWhatsAppPrompt(
  article: { title: string; summary: string; source: string; fullText?: string },
  style: "short" | "regular" | "commentary",
): string {
  const hasBody = !!(article.fullText && article.fullText.trim().length > 0);
  const bodyBlock = hasBody
    ? `\n=== תוכן הכתבה המלא (השתמש במספרים והעובדות מכאן!) ===\n${article.fullText}\n`
    : "";
  const sourceNote = hasBody
    ? "- בסס את הנוסח על המספרים, השמות והעובדות מתוכן הכתבה המלא שלמעלה. אל תסתפק בכותרת."
    : "- אם אין לך מספרים ספציפיים מהחדשה, אל תמציא. כתוב \"המספרים ידברו\" או דלג";

  return `כתוב נוסח לוואטסאפ על הידיעה הבאה.

${WHATSAPP_STYLE_PROMPTS[style]}

=== הידיעה ===
כותרת: ${article.title}
מקור: ${article.source}
תקציר: ${article.summary || "אין תקציר"}
${bodyBlock}
=== תזכורות חשובות ===
- כתוב טקסט בלבד. בלי JSON, בלי הסברים, בלי "הנה הנוסח:"
${sourceNote}
- בלי מקפים ארוכים (—). בלי. אפילו אחד.
- *כוכביות* לבולד בלבד
- העברית צריכה להרגיש כמו הודעה שבן כתב מהר בוואטסאפ, לא כמו מאמר`;
}

export async function generateWhatsAppText(
  article: { title: string; summary: string; source: string; fullText?: string },
  style: "short" | "regular" | "commentary",
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: VOICE_DNA_SYSTEM_CACHED,
    messages: [{ role: "user", content: buildWhatsAppPrompt(article, style) }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return cleanupHebrewDashes(text);
}

/** STREAMING WhatsApp text generator. Yields each text delta as Claude writes. */
export async function* streamWhatsAppText(
  article: { title: string; summary: string; source: string; fullText?: string },
  style: "short" | "regular" | "commentary",
): AsyncGenerator<string, void, unknown> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: VOICE_DNA_SYSTEM_CACHED,
    messages: [{ role: "user", content: buildWhatsAppPrompt(article, style) }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta?.type === "text_delta" &&
      typeof chunk.delta.text === "string"
    ) {
      yield chunk.delta.text;
    }
  }
}

/** Build the digest prompt body. Shared between the blocking and streaming generators. */
function buildDigestPrompt(
  articles: Array<{ title: string; summary: string; source: string }>,
): string {
  const articleList = articles
    .map((a, i) => `[חדשה ${i + 1}] ${a.title}\nמקור: ${a.source}\nתקציר: ${a.summary || "אין תקציר"}`)
    .join("\n\n");

  return `כתוב הודעת וואטסאפ יומית אחת שלמה שמאחדת את כל הידיעות הבאות.

=== מבנה מדויק של ההודעה ===

📌 *חדשות נדל"ן מהיום*

[הוק אישי, משפט אחד שמחבר את החדשה המרכזית לחוויה של חברי הקליקה]

*[כותרת החדשה המרכזית בבולד]*
[3-5 שורות עם מספרים ספציפיים. קצר ונקודתי]

*פרשנות בן סולומון:*
[6-10 שורות. טון אישי מאוד. "אני רואה בשטח...", "מה שאני אומר לחברים...". פסיכולוגיית שוק. ציטוטים עצמיים. מה רוב האנשים לא מבינים]

~~~~~~~~

[2 חדשות נוספות, כל אחת:]
*[כותרת בולד ארוכה ומתארת]*
[2-3 שורות קצרות]

[שורה ריקה בין החדשות]

~~~~~~~~

נמשיך לעדכן ברמה היומית, החברים מהקליקה 🙏

=== הידיעות ===
${articleList}

=== כללים ===
- הודעה אחת שלמה, מוכנה להעתקה לוואטסאפ
- טקסט בלבד, בלי JSON, בלי הסברים
- בלי מקפים ארוכים (—). אפילו לא אחד.
- בלי לינקים
- בלי המצאות
- *כוכביות* לבולד
- 250-400 מילה סה"כ
- אמפתי ורגיש למצב הנוכחי`;
}

/** Light em-dash + en-dash cleanup applied after generation (blocking and streaming). */
function cleanupHebrewDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");
}

/**
 * STREAMING digest generator. Yields each text chunk as Claude produces it.
 * Caller is responsible for buffering the full string if it needs to persist.
 */
export async function* streamDailyDigest(
  articles: Array<{ title: string; summary: string; source: string }>,
): AsyncGenerator<string, void, unknown> {
  const prompt = buildDigestPrompt(articles);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: VOICE_DNA_SYSTEM_CACHED,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta?.type === "text_delta" &&
      typeof chunk.delta.text === "string"
    ) {
      yield chunk.delta.text;
    }
  }
}

export async function generateDailyDigest(
  articles: Array<{ title: string; summary: string; source: string }>
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: VOICE_DNA_SYSTEM_CACHED,
    messages: [{ role: "user", content: buildDigestPrompt(articles) }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return cleanupHebrewDashes(text);
}

export async function generateCommentary(
  article: { title: string; summary: string; source: string }
): Promise<{
  what_happened: string;
  why_important: string;
  common_questions: string[];
  real_understanding: string;
  our_angle: string;
}> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: VOICE_DNA_SYSTEM_CACHED,
    messages: [
      {
        role: "user",
        content: `כתוב פרשנות מקצועית מובנית על הידיעה הבאה.
כל חלק צריך להיות בשפה שלנו (שיחתית, קצרה, עם מספרים). בלי מקפים ארוכים (—).

הידיעה:
כותרת: ${article.title}
מקור: ${article.source}
תקציר: ${article.summary || "אין תקציר"}

החזר JSON בלבד (בלי טקסט נוסף):
{
  "what_happened": "מה קרה בפועל, 2-3 שורות עם מספרים ספציפיים",
  "why_important": "למה חברי הקליקה צריכים לשים לב, 2-4 שורות, נגיעה ישירה לכסף/דירה שלהם",
  "common_questions": ["שאלה שהקהל שלנו ישאל 1", "שאלה 2", "שאלה 3"],
  "real_understanding": "מה שרוב האנשים לא מבינים, 2-4 שורות, פרשנות מקצועית",
  "our_angle": "איך הקליקה עוזרת, 2-3 שורות, מכירה עדינה מאוד, בלי 'הצטרפו בחינם'"
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse commentary JSON from Claude response");
  }
  return JSON.parse(jsonMatch[0]);
}

export async function checkHumanityScore(
  text: string
): Promise<{ score: number; flags: string[]; suggestion: string }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `אתה בודק טקסטים בעברית ומזהה "ריח AI". בדוק את הטקסט הבא ותן ציון אנושיות 1-10 (10 = נשמע לגמרי אנושי).

סימנים ל-AI:
- ביטויים מסורבלים או פורמליים מדי
- מקפים ארוכים (—)
- מבנה מושלם מדי
- ביטויים כמו "ללא ספק", "חד משמעית", "ראוי לציין", "חשוב לציין"
- שפה "נקייה מדי"
- אין שגיאות קטנות, אין ספק, אין גמגום טבעי

סימנים לאנושיות:
- שפה שיחתית ("בגדול", "תכלס")
- ספק טבעי ("אני לא בטוח ש...")
- קיצורים ומילות חיבור טבעיות
- משפטים שנשמעים כמו הודעת וואטסאפ

הטקסט:
"""
${text}
"""

החזר JSON בלבד:
{ "score": 8, "flags": ["ביטוי X נשמע AI"], "suggestion": "משפט אחד, מה לשנות" }`,
      },
    ],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
  if (!jsonMatch) {
    return { score: 7, flags: [], suggestion: "" };
  }
  return JSON.parse(jsonMatch[0]);
}

// ─── Article generation ───
/** Shared article prompt — reused by blocking + streaming variants. */
function buildArticlePrompt(title: string, summary: string, extra: string, fullText = ""): string {
  const hasBody = !!(fullText && fullText.trim().length > 0);
  const bodyBlock = hasBody
    ? `\n=== תוכן הכתבה המקורית (בסס את הכתבה על המספרים והעובדות מכאן!) ===\n${fullText}\n`
    : "";
  return `כתוב כתבה מקצועית בעברית על הנושא הבא:

כותרת: ${title}
תקציר: ${summary}
${bodyBlock}${extra ? `\nהקשר נוסף:\n${extra}\n` : ""}

הכתבה צריכה להיות:
- 600-1000 מילים
- בעברית שיחתית, לא פורמלית
- ${hasBody ? "מבוססת על המספרים, השמות והעובדות מתוכן הכתבה המקורית שלמעלה (אל תמציא, אל תסתפק בכותרת)" : "עם מספרים ספציפיים (אל תמציא מספרים שאין לך)"}
- בקול של בן סולומון מקליקת הנדל"ן
- עם פסקאות קצרות
- חתימה: בן סולומון והחברים מהקליקה`;
}

export async function generateArticle(
  newsOrTitle: string | { title: string; summary?: string; source?: string },
  contextOrSummary?: string,
  pulseContext?: string
): Promise<string> {
  const title = typeof newsOrTitle === "string" ? newsOrTitle : newsOrTitle.title;
  const summary = typeof newsOrTitle === "string" ? (contextOrSummary || "") : (newsOrTitle.summary || "");
  const extra = typeof newsOrTitle === "string" ? (pulseContext || "") : (contextOrSummary || "");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: VOICE_DNA_SYSTEM_CACHED,
    messages: [{ role: "user", content: buildArticlePrompt(title, summary, extra) }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

/**
 * STREAMING article generator. Yields text deltas as Claude writes.
 */
export async function* streamArticle(
  article: { title: string; summary: string; source?: string; fullText?: string },
  extraContext: string = "",
): AsyncGenerator<string, void, unknown> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: VOICE_DNA_SYSTEM_CACHED,
    messages: [
      {
        role: "user",
        content: buildArticlePrompt(article.title, article.summary || "", extraContext, article.fullText || ""),
      },
    ],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta?.type === "text_delta" &&
      typeof chunk.delta.text === "string"
    ) {
      yield chunk.delta.text;
    }
  }
}

// ─── Sanitize text ───
export function sanitizeText(text: string): string {
  return text.replace(/\u2014/g, " - ").replace(/\u200B/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Fact check ───
export async function factCheck(text: string, _context?: string): Promise<{ passed: boolean; verified?: boolean; issues: string[]; score?: number }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `בדוק את הטקסט הבא ומצא טענות שנראות בדויות או לא מדויקות.\n\nטקסט:\n"""\n${text}\n"""\n\nהחזר JSON בלבד:\n{ "passed": true/false, "issues": ["בעיה 1"] }\n\nאם אין בעיות: { "passed": true, "issues": [] }`,
      },
    ],
  });
  const rt = response.content[0].type === "text" ? response.content[0].text : "";
  const m = rt.match(/\{[\s\S]*\}/);
  if (!m) return { passed: true, issues: [] };
  try { return JSON.parse(m[0]); } catch { return { passed: true, issues: [] }; }
}

// ─── Refine text with instruction ───
export async function refineText(currentText: string, instruction: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      { role: "user", content: `שפר את הטקסט הבא לפי ההוראה.\n\nטקסט נוכחי:\n"""\n${currentText}\n"""\n\nהוראה: ${instruction}\n\nהחזר רק את הטקסט המשופר, ללא הסברים.` },
    ],
  });
  return response.content[0].type === "text" ? response.content[0].text : currentText;
}

// ─── Generate merged narrative ───
export async function generateMergedNarrative(articles: { title: string; summary?: string; text?: string; source?: string }[]): Promise<string> {
  const list = articles.map((a, i) => `${i + 1}. ${a.title}\n${a.summary || a.text || ""}`).join("\n\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      { role: "user", content: `אתה בן סולומון מקליקת הנדל"ן. כתוב נרטיב מאוחד מהידיעות הבאות:\n\n${list}\n\nכתוב הודעת וואטסאפ אחת שלמה שמחברת את כל הידיעות לסיפור אחד. עברית שיחתית, מספרים ספציפיים, קצר ונקודתי.` },
    ],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ─── Market confidence index ───
export async function calculateMarketConfidence(newsItems: { title: string; score: number }[], _pulseData?: unknown): Promise<{ index: number; trend: string; summary: string }> {
  const list = newsItems.map(n => `- ${n.title} (ציון: ${n.score})`).join("\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [
      { role: "user", content: `נתח את כותרות הנדל"ן הבאות וחשב מדד אמון שוק 1-100:\n\n${list}\n\nהחזר JSON בלבד, ללא טקסט נוסף, בלי גרשיים בתוך המשפט:\n{ "index": 65, "trend": "עולה/יורד/יציב", "summary": "משפט אחד" }` },
    ],
  });
  const rt = response.content[0].type === "text" ? response.content[0].text : "";
  // Robust parse — Hebrew LLM JSON often has unescaped quotes (נדל"ן) that break
  // JSON.parse, which previously dropped us to the 50/empty fallback. Try strict
  // first, then field-by-field regex extraction (tolerates inner quotes).
  const m = rt.match(/\{[\s\S]*\}/);
  if (m) { try { const p = JSON.parse(m[0]); if (typeof p?.index === "number") return p; } catch { /* fall through */ } }
  const idxM = rt.match(/index"?\s*:?\s*(\d{1,3})/);
  const trendM = rt.match(/(עולה|יורד|יציב)/);
  const sumM = rt.match(/summary"?\s*:\s*"([\s\S]*?)"\s*[},]/) || rt.match(/summary"?\s*:\s*([^\n}]{4,})/);
  const index = idxM ? Math.min(100, Math.max(1, parseInt(idxM[1], 10))) : 50;
  const summary = (sumM?.[1] || "").replace(/^["']|["'\s}]+$/g, "").trim();
  if (idxM || sumM) return { index, trend: trendM?.[1] || "יציב", summary };
  return { index: 50, trend: "יציב", summary: "" };
}

// ─── Check repetition ───
export async function checkRepetition(text: string, recentTexts?: string[]): Promise<{ isRepetitive: boolean; similarity: number; suggestion: string }> {
  if (!recentTexts || recentTexts.length === 0) return { isRepetitive: false, similarity: 0, suggestion: "" };
  const recent = recentTexts.slice(0, 3).map((t, i) => `טקסט ${i + 1}:\n${t.slice(0, 200)}`).join("\n\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      { role: "user", content: `בדוק אם הטקסט הבא חוזר על עצמו ביחס לטקסטים קודמים:\n\nטקסט חדש:\n${text.slice(0, 300)}\n\nטקסטים קודמים:\n${recent}\n\nהחזר JSON:\n{ "isRepetitive": true/false, "similarity": 0-100, "suggestion": "מה לשנות" }` },
    ],
  });
  const rt = response.content[0].type === "text" ? response.content[0].text : "";
  const m = rt.match(/\{[\s\S]*\}/);
  if (!m) return { isRepetitive: false, similarity: 0, suggestion: "" };
  try { return JSON.parse(m[0]); } catch { return { isRepetitive: false, similarity: 0, suggestion: "" }; }
}
