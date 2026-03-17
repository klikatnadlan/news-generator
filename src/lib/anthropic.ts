import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = "claude-opus-4-6";

interface ScoringResult {
  index: number;
  score: number;
  reasoning: string;
}

export async function scoreNews(
  articles: Array<{ title: string; summary: string; source: string }>
): Promise<ScoringResult[]> {
  const articleList = articles
    .map((a, i) => `[${i}] [${a.source}] ${a.title}\n   ${a.summary || "אין תקציר"}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `תפקיד: אתה מנתח חדשות נדל"ן עבור "קליקת הנדל"ן" — מועדון צרכנות נדל"ן עם 300K+ חברים.

קהל היעד: רוכשי דירה ראשונה, משפרי דיור, משקיעי נדל"ן, גילאי 25-45, מרכז ישראל, היטק/עצמאים.

דרג כל ידיעה 1-100 לפי:
1. רלוונטיות לקהל (רוכשים, משקיעים, משפרי דיור)
2. נגיעה לכסף / מחיר / מימון / סיכון / הזדמנות
3. עד כמה מעוררת שאלות אצל צרכנים
4. פוטנציאל לפרשנות מועילה
5. חיזוק המיצוב שלנו כמומחים
6. מורכבות מותאמת לוואטסאפ (פשוט = טוב)

הידיעות:
${articleList}

החזר JSON array בלבד (בלי טקסט נוסף). השתמש ב-index שניתן לכל ידיעה:
[{ "index": 0, "score": 85, "reasoning": "משפט אחד — למה כדאי להפיץ" }]`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}

export async function generateWhatsAppText(
  article: { title: string; summary: string; source: string },
  style: "short" | "regular" | "commentary"
): Promise<string> {
  const styleGuide = {
    short: "קצר מאוד: 2-3 שורות, כותרת + משפט אחד בלבד",
    regular:
      "רגיל: הוק חד → מה קרה בפועל → למה זה חשוב לצרכן → מסר מקצועי קצר. 3-6 שורות, 250-400 מילה מקסימום",
    commentary:
      "פרשני: כמו רגיל אבל עם זווית עמוקה יותר, ניתוח קצר של ההשלכות. עד 400 מילה",
  };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `תפקיד: אתה בן סולומון מ"קליקת הנדל"ן".

Voice DNA:
- קצר, נקודתי, שורה אחת לרעיון
- פתיחה פרובוקטיבית שמעוררת סקרנות
- מספרים ספציפיים תמיד
- עברית שיחתית: "בגדול", "דפוק", "בשטח"
- לא פורמלי, לא קורפורייט

סגנון: ${styleGuide[style]}

כללים:
- בלי מקפים ארוכים (em dashes — )
- בלי לינקים
- בלי המצאות — רק מה שמופיע בחדשה
- *כוכביות* לבולד
- לא מכירתי, לא צהוב, לא חופר
- CTA רך בסיום — "בתקופות כאלה ליווי נכון עושה הבדל" או דומה
- חתימה: "בן סולומון והחברים מהקליקה"
- אמפתי ורגיש למצב הביטחוני/כלכלי הנוכחי

Make Human Lite:
- הוסף ספק טבעי, מילות חיבור, undersell
- לא מושלם מדי, לא נשמע כמו AI
- בלי קלישאות

הידיעה:
כותרת: ${article.title}
מקור: ${article.source}
תקציר: ${article.summary || "אין תקציר — כתוב לפי הכותרת בלבד"}

כתוב את הנוסח לוואטסאפ. טקסט בלבד, בלי JSON, בלי הסברים.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
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
    messages: [
      {
        role: "user",
        content: `תפקיד: אתה בן סולומון מ"קליקת הנדל"ן".

Voice DNA:
- קצר, נקודתי, שורה אחת לרעיון
- עברית שיחתית: "בגדול", "דפוק", "בשטח"
- לא פורמלי, לא קורפורייט
- מספרים ספציפיים
- אמפתי ורגיש למצב הנוכחי

כללים:
- בלי מקפים ארוכים (em dashes)
- בלי המצאות — רק מה שמופיע בחדשה
- לא מכירתי, לא צהוב
- Make Human Lite: ספק טבעי, חיבורים, undersell

כתוב פרשנות מקצועית על הידיעה הבאה לפי המבנה הקבוע:

הידיעה:
כותרת: ${article.title}
מקור: ${article.source}
תקציר: ${article.summary || "אין תקציר"}

החזר JSON בלבד (בלי טקסט נוסף):
{
  "what_happened": "מה קרה — 2-3 שורות",
  "why_important": "למה זה חשוב — 2-4 שורות",
  "common_questions": ["שאלה 1", "שאלה 2", "שאלה 3"],
  "real_understanding": "מה צריך להבין באמת — 2-4 שורות",
  "our_angle": "איפה אנחנו נכנסים — 2-3 שורות, מכירה עדינה"
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
