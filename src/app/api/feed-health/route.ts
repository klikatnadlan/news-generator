import { NextResponse } from "next/server";
import { checkFeeds } from "@/lib/feed-health";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Manual feed-health check. Zero AI tokens — plain HTTP fetches.
 * The daily alarm lives in /api/cron/model-health; this is the on-demand view
 * for QA ("is the home feed thin because a source died again?").
 */
export async function GET() {
  const report = await checkFeeds();
  return NextResponse.json(report, {
    // A dead scorable feed is a real failure — surface it in the status code so
    // a monitor or a curl in a terminal notices without reading the body.
    status: report.ok ? 200 : 503,
  });
}
