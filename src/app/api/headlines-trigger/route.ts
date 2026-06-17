import { NextRequest, NextResponse } from "next/server";
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
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
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

  const text = (response.content[0] as any).text || "";
  return NextResponse.json({ text });
}

export const maxDuration = 30;
