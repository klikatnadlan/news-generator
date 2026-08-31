import { NextRequest, NextResponse } from "next/server";
import { firstText } from "@/lib/anthropic";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  const { headlines } = await request.json();

  if (!headlines || !Array.isArray(headlines) || headlines.length === 0) {
    return NextResponse.json({ error: "לא נבחרו כותרות" }, { status: 400 });
  }

  const headlineList = headlines
    .map((h: { title: string; source: string }) => `- ${h.title} (${h.source})`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    // Raised for Sonnet 5: THINKING TOKENS COUNT AGAINST max_tokens.
    // Measured 2026-08-31 on /api/narratives — stop_reason "max_tokens",
    // content blocks ["thinking"], output_tokens 1500 of which thinking_tokens
    // 1500. The model spent the entire budget reasoning and emitted no text at
    // all, so the feature returned an empty list with HTTP 200. A ceiling costs
    // nothing unless it is used; starving it costs the whole answer.
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `אתה עוזר לבן סולומון מקליקת הנדל"ן להכין מסגרת להודעה יומית.

הכותרות שנבחרו:
${headlineList}

צור את המסגרת הבאה:
1. **מספרים מפתח** — שלוף מספרים ספציפיים מהכותרות (אחוזים, סכומים, כמויות)
2. **כותרת מושכת** — כותרת אחת מושכת להודעה שמסכמת את הנושאים
3. **תתי כותרות** — כותרת משנה לכל כתבה שנבחרה (קצרה, חדה)
4. **חתימה** — בן סולומון והחברים מהקליקה

פורמט:
📊 מספרים מפתח:
[מספרים]

📌 כותרת:
[כותרת מושכת]

📋 תתי כותרות:
[תתי כותרות]

✍️ בן סולומון והחברים מהקליקה

עברית שיחתית, קצר ונקודתי. רק מה שמופיע בכותרות — אסור להמציא מספרים או עובדות.`,
      },
    ],
  });

  const text = firstText(response);
  return NextResponse.json({ text });
}

export const maxDuration = 30;
