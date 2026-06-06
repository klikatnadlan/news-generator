import { NextRequest, NextResponse } from "next/server";
import { sendWatchDigest } from "@/lib/email";

export const maxDuration = 60;

// Sends the "🆕 חדש במעקבים" email digest to ALERT_EMAIL_TO. Token-free.
// Called automatically after the daily scan; also manually triggerable
// (x-manual-scan header, same-origin) for testing. Recipient is server-fixed,
// so this can never be used to email an arbitrary address.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isManual = request.headers.get("x-manual-scan") === "true";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && !isManual && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("days") || "1", 10) || 1, 1), 30);
  const result = await sendWatchDigest(days);
  return NextResponse.json(result);
}
