/**
 * Pulse — the official Israeli housing figures (CBS, Bank of Israel, the Chief
 * Economist), read straight from the Pulse Supabase. Zero AI tokens.
 *
 * WHY THIS FILE EXISTS
 * Every previous caller queried columns that do not exist. The tables have
 * `year` and `month` as separate integers, never a `date`, so every
 * `order=date.desc` answered HTTP 400 — and each call site swallowed the error
 * and returned an empty array. The result: eight silent failures, and an app
 * that answered "המקורות אינם מספקים מספר מדויק" about an index sitting in its
 * own database. Verified 2026-09-03 against the live tables.
 *
 * FRESHNESS IS PART OF THE ANSWER
 * The tables update at very different rates, so every reading carries the
 * period it belongs to. A number without its month is worse than no number:
 * quoting July's mortgage rate as "current" in December is how a valuation tool
 * loses its credibility.
 */

const PULSE_URL = "https://zkirtoefpwugcyybebed.supabase.co";
// Public anon key for a read-only published dataset — the same one that was
// already hardcoded in four separate route files before this module existed.
const PULSE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpraXJ0b2VmcHd1Z2N5eWJlYmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTMyNTQsImV4cCI6MjA4NTc4OTI1NH0.Fwwi0HNS4HxQNDCUFmK5XwPRWaaVVSeaqVQIuA66Ems";

const HEADERS = { apikey: PULSE_KEY, Authorization: `Bearer ${PULSE_KEY}` };

/** Rows are keyed by (year, month) integers — there is no date column. */
const BY_PERIOD = "order=year.desc,month.desc&limit=1";

const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export interface PulsePeriod {
  year: number;
  month: number;
  /** "מאי 2026" — what a reader needs to judge whether the number still holds. */
  label: string;
  /** Whole months between this reading and today. */
  monthsOld: number;
}

export interface PulseFacts {
  priceIndex?: { value: number; monthlyChange: number | null; annualChange: number | null; period: PulsePeriod };
  mortgage?: { avgRate: number; boiRate: number | null; volumeBillions: number | null; period: PulsePeriod };
  transactions?: { total: number; investors: number | null; firstTime: number | null; newBuild: number | null; period: PulsePeriod };
  rentalIndex?: { annualChange: number | null; monthlyChange: number | null; period: PulsePeriod };
}

function periodOf(year: number, month: number, now = new Date()): PulsePeriod {
  const monthsOld = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  return { year, month, label: `${HE_MONTHS[month - 1] || month} ${year}`, monthsOld: Math.max(0, monthsOld) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function latest(table: string, select: string): Promise<any | null> {
  const url = `${PULSE_URL}/rest/v1/${table}?select=${select}&${BY_PERIOD}`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      // Loudly. A swallowed 400 here is exactly what hid this for months.
      console.error(`[pulse] ${table} -> HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return null;
    }
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (e) {
    console.error(`[pulse] ${table} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** All four headline figures, each with its own period. Bounded and parallel. */
export async function getPulseFacts(): Promise<PulseFacts> {
  const [price, mortgage, tx, rental] = await Promise.all([
    latest("housing_price_index", "year,month,index_value,monthly_change,annual_change"),
    latest("mortgage_data", "year,month,avg_interest_rate,boi_key_rate,total_volume_billions"),
    latest("transactions_data", "year,month,total_transactions,investor_transactions,first_time_buyers,new_apartments"),
    latest("rental_data", "year,month,monthly_change,annual_change"),
  ]);

  const facts: PulseFacts = {};

  if (price && num(price.index_value) !== null) {
    facts.priceIndex = {
      value: price.index_value,
      monthlyChange: num(price.monthly_change),
      annualChange: num(price.annual_change),
      period: periodOf(price.year, price.month),
    };
  }
  if (mortgage && num(mortgage.avg_interest_rate) !== null) {
    facts.mortgage = {
      avgRate: mortgage.avg_interest_rate,
      boiRate: num(mortgage.boi_key_rate),
      volumeBillions: num(mortgage.total_volume_billions),
      period: periodOf(mortgage.year, mortgage.month),
    };
  }
  if (tx && num(tx.total_transactions) !== null) {
    facts.transactions = {
      total: tx.total_transactions,
      investors: num(tx.investor_transactions),
      firstTime: num(tx.first_time_buyers),
      newBuild: num(tx.new_apartments),
      period: periodOf(tx.year, tx.month),
    };
  }
  // rental_data's headline column avg_rent_national is NULL for every row, so
  // only the change percentages are usable. Reporting a null as a rent figure
  // would be worse than omitting the table.
  if (rental && (num(rental.annual_change) !== null || num(rental.monthly_change) !== null)) {
    facts.rentalIndex = {
      annualChange: num(rental.annual_change),
      monthlyChange: num(rental.monthly_change),
      period: periodOf(rental.year, rental.month),
    };
  }

  return facts;
}

/**
 * The price index at a given month, or the newest reading when no month is
 * given. Used for then-vs-now comparisons.
 *
 * `year`/`month` are separate integers, so "at or before this month" is
 * expressed as `year<=Y` ordered newest-first — a plain `lte` on a date column
 * is not available here, and the previous attempt at one (`lte.date=`) was both
 * malformed and aimed at a column that does not exist.
 */
export async function getPriceIndexAt(
  year?: number,
  month?: number,
): Promise<{ value: number; label: string; period: PulsePeriod } | null> {
  const filter = year ? `&year=lte.${year}` : "";
  const url = `${PULSE_URL}/rest/v1/housing_price_index?select=year,month,index_value${filter}&order=year.desc,month.desc&limit=24`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error(`[pulse] price index at ${year}-${month} -> HTTP ${res.status}`);
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    // Newest row that is not after the requested month.
    const wanted = year && month
      ? rows.find((r) => r.year < year || (r.year === year && r.month <= month))
      : rows[0];
    if (!wanted || num(wanted.index_value) === null) return null;
    const period = periodOf(wanted.year, wanted.month);
    return { value: wanted.index_value, label: period.label, period };
  } catch (e) {
    console.error("[pulse] price index lookup threw:", e instanceof Error ? e.message : e);
    return null;
  }
}

const pct = (v: number | null) => (v === null ? null : `${v > 0 ? "+" : ""}${v}%`);

/**
 * The facts as prompt lines. Every line names its source and its period so the
 * model can attribute it and a reader can judge it.
 */
export function pulseFactLines(f: PulseFacts): string[] {
  const out: string[] = [];
  if (f.priceIndex) {
    const p = f.priceIndex;
    const bits = [`מדד מחירי הדירות (הלמ"ס): ${p.value}`];
    if (p.annualChange !== null) bits.push(`שינוי שנתי ${pct(p.annualChange)}`);
    if (p.monthlyChange !== null) bits.push(`שינוי חודשי ${pct(p.monthlyChange)}`);
    out.push(`${bits.join(", ")} — נכון ל${p.period.label}`);
  }
  if (f.mortgage) {
    const m = f.mortgage;
    const bits = [`ריבית משכנתא ממוצעת (בנק ישראל): ${m.avgRate}%`];
    if (m.boiRate !== null) bits.push(`ריבית בנק ישראל ${m.boiRate}%`);
    if (m.volumeBillions !== null) bits.push(`היקף חודשי ${m.volumeBillions} מיליארד ש"ח`);
    out.push(`${bits.join(", ")} — נכון ל${m.period.label}`);
  }
  if (f.transactions) {
    const t = f.transactions;
    const bits = [`עסקאות דירות (הכלכלן הראשי): ${t.total.toLocaleString("he-IL")}`];
    if (t.investors !== null) bits.push(`מתוכן ${t.investors.toLocaleString("he-IL")} משקיעים`);
    if (t.firstTime !== null) bits.push(`${t.firstTime.toLocaleString("he-IL")} דירה ראשונה`);
    out.push(`${bits.join(", ")} — נכון ל${t.period.label}`);
  }
  if (f.rentalIndex) {
    const r = f.rentalIndex;
    const bits = ["מדד שכר הדירה (הלמ\"ס)"];
    if (r.annualChange !== null) bits.push(`שינוי שנתי ${pct(r.annualChange)}`);
    if (r.monthlyChange !== null) bits.push(`שינוי חודשי ${pct(r.monthlyChange)}`);
    out.push(`${bits.join(", ")} — נכון ל${r.period.label}`);
  }
  return out;
}

/** Questions these official figures actually help answer. */
const MARKET_TERMS = [
  "מדד", "מחירי", "מחיר", "ריבית", "משכנתא", "משכנתאות", "עסקאות", "שכירות",
  "שכר דירה", "יוקר", "אינפלציה", "בנק ישראל", "למ\"ס", "שוק הדיור", "משקיעים",
  "דירה ראשונה", "התייקרות", "התייקרו", "ירידת מחירים", "עליית מחירים",
];

/** Whether a question is one the official figures should be attached to. */
export function questionWantsMarketFacts(question: string): boolean {
  const q = (question || "").toLowerCase();
  return MARKET_TERMS.some((t) => q.includes(t));
}
