/**
 * A web news result's date, as an ISO string no more precise than the source.
 *
 * Why. Firecrawl news dates come in two shapes: absolute ("Apr 9, 2026") and
 * RELATIVE ("22 hours ago", "3 weeks ago", "95 months ago"). The city research
 * used `Date.parse`, which returns NaN for every relative one, so those items
 * silently lost their date. Measured 2026-09-29 on the REIT searches: most news
 * results were relative — the very items Ben's rule says must show when they
 * are true as of.
 *
 * Precision follows the source, so a date is never shown sharper than it is:
 *   minutes/hours, or fewer than 7 days  → YYYY-MM-DD
 *   weeks, months                         → YYYY-MM
 *   years                                 → YYYY
 * Absolute dates are read at noon UTC, so no timezone can move them a day.
 */
const DAY = 86_400_000;
const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: DAY,
  week: 7 * DAY,
  month: 30.44 * DAY,
  year: 365.25 * DAY,
};

export function normNewsDate(d: string | null | undefined, now: number = Date.now()): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(s) || /^\d{4}$/.test(s)) return s;

  const rel = /^(\d+|an?|one)\s+(minute|hour|day|week|month|year)s?\s+ago$/i.exec(s);
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : 1;
    const unit = rel[2].toLowerCase();
    const iso = new Date(now - n * UNIT_MS[unit]).toISOString();
    if (unit === "minute" || unit === "hour" || (unit === "day" && n < 7)) return iso.slice(0, 10);
    if (unit === "year") return iso.slice(0, 4);
    return iso.slice(0, 7);
  }
  if (/^yesterday$/i.test(s)) return new Date(now - DAY).toISOString().slice(0, 10);

  let t = Date.parse(`${s} 12:00 UTC`);
  if (Number.isNaN(t)) t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

/**
 * A normalized date for a Hebrew line, in words: "28 בספטמבר 2026", "דצמבר 2025", "2026".
 *
 * Why. "2025-12" inside a Hebrew line "(כלכליסט · 2025-12)" wraps at the hyphen on a
 * phone, and the two halves are then laid out right to left: Ben's screenshot of
 * 2026-09-29 showed "(כלכליסט · -2025" on one line and "(12" on the next. Month
 * names cannot flip, and a line may break between words without garbling them.
 * Precision is kept: a month-only date never gains a day.
 */
export function hebrewDateLabel(d: string | null | undefined): string {
  const s = (d || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m && HE_MONTHS[Number(m[2]) - 1]) return `${Number(m[3])} ב${HE_MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m && HE_MONTHS[Number(m[2]) - 1]) return `${HE_MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return s;
}
