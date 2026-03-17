import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/scanner";

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  // Manual scans from frontend send x-manual-scan header (same-origin only)
  const authHeader = request.headers.get("authorization");
  const isManualScan = request.headers.get("x-manual-scan") === "true";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && !isManualScan && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runScan();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Scan failed:", error);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 }
    );
  }
}
