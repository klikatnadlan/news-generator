// ─── Fetch context from Pulse Property Insight (דופק הנדל"ן) ───
const PULSE_URL = "https://zkirtoefpwugcyybebed.supabase.co";
const PULSE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpraXJ0b2VmcHd1Z2N5eWJlYmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTMyNTQsImV4cCI6MjA4NTc4OTI1NH0.Fwwi0HNS4HxQNDCUFmK5XwPRWaaVVSeaqVQIuA66Ems";

const headers = {
  apikey: PULSE_KEY,
  Authorization: `Bearer ${PULSE_KEY}`,
};

async function safeFetch(url: string): Promise<unknown[]> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getPulseContext(): Promise<string> {
  const [priceIndex, mortgage, transactions, rental] = await Promise.all([
    safeFetch(`${PULSE_URL}/rest/v1/housing_price_index?select=*&order=date.desc&limit=2`),
    safeFetch(`${PULSE_URL}/rest/v1/mortgage_data?select=*&order=date.desc&limit=2`),
    safeFetch(`${PULSE_URL}/rest/v1/transactions_data?select=*&order=date.desc&limit=2`),
    safeFetch(`${PULSE_URL}/rest/v1/rental_data?select=*&order=date.desc&limit=2`),
  ]);

  const lines: string[] = ["=== הקשר היסטורי מדופק הנדל\"ן (נתונים אמיתיים!) ==="];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (priceIndex.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latest = priceIndex[0] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prev = priceIndex[1] as any;
    lines.push(`מדד מחירי דיור: ${latest.index_value || "?"} (${latest.date || "?"})`);
    if (latest.change_pct !== undefined) lines.push(`  שינוי: ${latest.change_pct}%`);
    if (prev?.index_value) lines.push(`  קודם: ${prev.index_value} (${prev.date})`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (mortgage.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latest = mortgage[0] as any;
    lines.push(`משכנתא ממוצעת: ריבית ${latest.avg_rate || "?"}%, סכום ${latest.avg_amount || "?"} ש"ח (${latest.date || "?"})`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (transactions.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latest = transactions[0] as any;
    lines.push(`עסקאות: ${latest.total_transactions || "?"} (${latest.date || "?"})`);
    if (latest.change_pct !== undefined) lines.push(`  שינוי: ${latest.change_pct}%`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (rental.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latest = rental[0] as any;
    lines.push(`שכירות ממוצעת: ${latest.avg_rent || "?"} ש"ח (${latest.date || "?"})`);
  }

  lines.push("השתמש בנתונים האלה רק אם הם רלוונטיים לחדשה. אל תמציא נתונים — השתמש רק במה שכתוב כאן.");

  return lines.length > 2 ? lines.join("\n") : "";
}
