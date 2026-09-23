import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeStories } from "./classify";

/**
 * מד אמון השוק, rebuilt on the tone of the stories themselves.
 *
 * Why. The old index asked Claude, once a day and only when someone clicked,
 * to read the week's headlines and answer with a number. Every answer was an
 * independent judgement, so it jumped: 21 on 2026-06-03 and 75 the next day.
 * It also went unrefreshed from 2026-09-05 to at least 2026-09-23, because
 * nobody clicked, and its "טווח שבועי" was the min/max of the last five ROWS —
 * which, computed that sparsely, could span two months.
 *
 * Now the morning scoring pass, which already reads every story, also marks its
 * tone: 1 strengthens confidence in the market, -1 weakens it, 0 neither. The
 * index is plain arithmetic over the last seven days of stories that reach the
 * home feed: it is stable, it refreshes itself every morning, it costs a few
 * extra output tokens on a call we already make, and it can be explained in
 * one sentence — "השבוע 12 ידיעות חיוביות מול 25 שליליות".
 *
 * Stored per day in narrative_cache under "market_tone|YYYY-MM-DD" (the same
 * key/value table the app already uses for its precomputed data), so no schema
 * change was needed.
 */

export type Tone = -1 | 0 | 1;

export interface ToneEntry {
  id: string;
  tone: Tone;
  score: number;
  title: string;
  url?: string | null;
  source?: string | null;
}

export const TONE_KEY_PREFIX = "market_tone|";
export const WINDOW_DAYS = 7;
/** Below this many stories the arithmetic is noise, so no number is shown. */
export const MIN_STORIES = 15;
const TREND_STEP = 5;

export function normalizeTone(v: unknown): Tone | undefined {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return n === 1 || n === 0 || n === -1 ? (n as Tone) : undefined;
}

export interface ToneSummary {
  index: number | null;
  pos: number;
  neg: number;
  neu: number;
  total: number;
  topPositive: ToneEntry | null;
  topNegative: ToneEntry | null;
}

/**
 * One vote per story. The same story reaches us from its outlet and from the
 * aggregate under two URLs, so it is collapsed by title as well as by id — the
 * same rule the home feed uses, so the index counts exactly what is on screen.
 * All-positive → 100, all-negative → 0, all-neutral → 50.
 */
export function summarizeTone(entries: ToneEntry[]): ToneSummary {
  const byId = new Map<string, ToneEntry>();
  for (const e of entries) if (e && !byId.has(e.id)) byId.set(e.id, e);
  const stories = dedupeStories([...byId.values()].sort((a, b) => b.score - a.score));
  let pos = 0, neg = 0, neu = 0;
  let topPositive: ToneEntry | null = null;
  let topNegative: ToneEntry | null = null;
  for (const s of stories) {
    if (s.tone === 1) {
      pos++;
      if (!topPositive) topPositive = s;
    } else if (s.tone === -1) {
      neg++;
      if (!topNegative) topNegative = s;
    } else {
      neu++;
    }
  }
  const total = pos + neg + neu;
  const index = total >= MIN_STORIES ? Math.round((100 * (pos + 0.5 * neu)) / total) : null;
  return { index, pos, neg, neu, total, topPositive, topNegative };
}

export function trendOf(current: number | null, previous: number | null): "עולה" | "יורד" | "יציב" | null {
  if (current === null || previous === null) return null;
  if (current - previous >= TREND_STEP) return "עולה";
  if (previous - current >= TREND_STEP) return "יורד";
  return "יציב";
}

export function toneSentence(s: ToneSummary): string {
  if (s.total === 0) return "עדיין אין ידיעות מסומנות השבוע.";
  return `השבוע: ${s.pos} ידיעות חיוביות, ${s.neg} שליליות ו-${s.neu} ניטרליות.`;
}

/** `days` calendar days ending at `endDay` (inclusive), newest first. UTC, like scan_date. */
export function dayList(endDay: string, days: number): string[] {
  const end = Date.parse(`${endDay}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

async function loadDays(supabase: SupabaseClient, days: string[]): Promise<Map<string, ToneEntry[]>> {
  const { data, error } = await supabase
    .from("narrative_cache")
    .select("cache_key, narratives")
    .in("cache_key", days.map((d) => TONE_KEY_PREFIX + d));
  if (error) throw new Error(`market tone read failed: ${error.message}`);
  const out = new Map<string, ToneEntry[]>();
  for (const row of (data || []) as { cache_key: string; narratives: unknown }[]) {
    if (Array.isArray(row.narratives)) out.set(row.cache_key.slice(TONE_KEY_PREFIX.length), row.narratives as ToneEntry[]);
  }
  return out;
}

/** Merge a run's toned stories into that day's record. A later run wins per id. */
export async function recordTone(supabase: SupabaseClient, day: string, entries: ToneEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  const existing = (await loadDays(supabase, [day])).get(day) || [];
  const merged = new Map<string, ToneEntry>();
  for (const e of existing) merged.set(e.id, e);
  for (const e of entries) merged.set(e.id, e);
  const all = [...merged.values()];
  const { error } = await supabase.from("narrative_cache").upsert(
    { cache_key: TONE_KEY_PREFIX + day, narratives: all, count: all.length, created_at: new Date().toISOString() },
    { onConflict: "cache_key" }
  );
  if (error) throw new Error(`market tone write failed: ${error.message}`);
  return all.length;
}

export interface MarketTone {
  current: ToneSummary;
  /** The seven days before the current window, for "לפני שבוע". */
  previous: ToneSummary;
  /** Newest day that has any toned story — what "נכון ל-" should say. */
  latestDay: string | null;
  windowStart: string;
}

export async function computeMarketTone(supabase: SupabaseClient, today: string): Promise<MarketTone> {
  const days = dayList(today, WINDOW_DAYS * 2);
  const byDay = await loadDays(supabase, days);
  const cur = days.slice(0, WINDOW_DAYS);
  const prev = days.slice(WINDOW_DAYS);
  return {
    current: summarizeTone(cur.flatMap((d) => byDay.get(d) || [])),
    previous: summarizeTone(prev.flatMap((d) => byDay.get(d) || [])),
    latestDay: cur.find((d) => (byDay.get(d) || []).length > 0) || null,
    windowStart: cur[cur.length - 1],
  };
}

/**
 * Keep market_index_history current for the time machine, which compares "now"
 * against a past date. Update-or-insert by date, so it is safe whether or not
 * the table has a unique constraint on `date`.
 */
export async function persistDailyIndex(supabase: SupabaseClient, today: string, mt: MarketTone): Promise<void> {
  if (mt.current.index === null) return;
  const row = {
    index_value: mt.current.index,
    trend: trendOf(mt.current.index, mt.previous.index) || "יציב",
    summary: toneSentence(mt.current),
    articles_count: mt.current.total,
  };
  const { data: existing } = await supabase.from("market_index_history").select("date").eq("date", today).limit(1);
  const { error } = existing && existing.length
    ? await supabase.from("market_index_history").update(row).eq("date", today)
    : await supabase.from("market_index_history").insert({ date: today, ...row });
  if (error) throw new Error(`market index history write failed: ${error.message}`);
}
