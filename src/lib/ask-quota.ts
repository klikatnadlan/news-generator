import { getSupabase } from "@/lib/supabase";

// ~10 agorot per uncached question at the analysis tier, so 150 is a hard
// ceiling of roughly 15 shekels a day. Realistic use is 5-20 questions.
const DEFAULT_CAP = 150;

function cap(): number {
  const raw = parseInt(process.env.ASK_DAILY_CAP || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CAP;
}

/**
 * Consume one unit of today's ask budget.
 *
 * Fails OPEN on a DB error: a Supabase blip should not take the feature down in
 * front of a client. The cap exists to stop a runaway loop, not to be a gate we
 * trust for correctness.
 */
export async function consumeAskQuota(): Promise<{ allowed: boolean; used: number; cap: number }> {
  const limit = cap();
  try {
    const { data, error } = await getSupabase().rpc("bump_ask_usage", { p_cap: limit });
    if (error) {
      console.error("[ask] quota check failed, allowing through:", error.message);
      return { allowed: true, used: -1, cap: limit };
    }
    const used = Number(data);
    return { allowed: used >= 0, used, cap: limit };
  } catch (e) {
    console.error("[ask] quota check threw, allowing through:", e instanceof Error ? e.message : e);
    return { allowed: true, used: -1, cap: limit };
  }
}
