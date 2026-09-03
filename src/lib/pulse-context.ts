import { getPulseFacts, pulseFactLines } from "@/lib/pulse";

/**
 * The official housing figures as a prompt block, for article generation.
 *
 * This module used to hold its own copy of the Pulse URL, key and queries — and
 * every one of those queries named columns that do not exist (`date`,
 * `change_pct`, `avg_rate`, `avg_rent`). All four answered HTTP 400, `safeFetch`
 * swallowed them, and the function returned "" forever: articles were written
 * with no market data at all while the numbers sat in the database. Verified
 * and replaced 2026-09-03 — lib/pulse.ts is now the single owner of the schema.
 */
export async function getPulseContext(): Promise<string> {
  const lines = pulseFactLines(await getPulseFacts());
  if (!lines.length) return "";
  return [
    '=== נתונים רשמיים (הלמ"ס / בנק ישראל / הכלכלן הראשי) ===',
    ...lines.map((l) => `• ${l}`),
    "השתמש בהם רק אם הם רלוונטיים לכתבה, וציין תמיד את התקופה ליד המספר. אל תמציא נתונים.",
  ].join("\n");
}
