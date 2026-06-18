import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/scanner";
import { sendWatchDigest } from "@/lib/email";

// ~105 feeds (RE + ingest-only local/national) fetched concurrently, then
// scoring of only the (few) new RE items. Give it room so the daily cron
// never times out mid-ingest.
export const maxDuration = 60;

// Mitigate abuse of the manual-scan path (the x-manual-scan header bypasses the
// cron-secret check): cap non-cron callers to 5/min so a flood can't drain RSS
// + Claude scoring cost. The legitimate single "סרוק עכשיו" press is unaffected.
const scanHits: number[] = [];
function scanRateLimited(): boolean {
  const now = Date.now();
  while (scanHits.length && now - scanHits[0] > 60_000) scanHits.shift();
  if (scanHits.length >= 5) return true;
  scanHits.push(now);
  return false;
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  // Manual scans from frontend send x-manual-scan header (same-origin only)
  const authHeader = request.headers.get("authorization");
  const isManualScan = request.headers.get("x-manual-scan") === "true";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (cronSecret && !isManualScan && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Throttle non-cron (manual / bypass) callers so the scan can't be hammered.
  if (!isCron && scanRateLimited()) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const result = await runScan();
    // After the daily scan, push the "🆕 חדש במעקבים" email digest (token-free).
    // Never let an email failure break the scan response.
    try {
      await sendWatchDigest(1);
    } catch (e) {
      console.error("watch digest email failed:", e);
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Scan failed:", error);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 }
    );
  }
}
