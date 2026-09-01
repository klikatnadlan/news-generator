/**
 * The demo script. These are what the chips show, what /api/warm?ask=1 pre-runs,
 * and therefore the ones guaranteed to be instant and good in front of a client.
 * Deliberately spread across the three modes so a demo can show all of them.
 *
 * Deliberately dependency-free: imported by both a server route and a client
 * component, so it must never pull in Supabase, Anthropic or Firecrawl.
 */
export const SUGGESTED_QUESTIONS: string[] = [
  "מה קרה בשיכון ובינוי החודש?",
  "מה קורה בפינוי בינוי בחיפה?",
  "מי היזמים שהופיעו הכי הרבה בחדשות החודש?",
  "מה חדש במחיר למשתכן?",
  "תשווה את הכיסוי של אשקלון מול נתניה",
  "מה קרה בשוק המשכנתאות בחודש האחרון?",
];
