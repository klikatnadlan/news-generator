import { NextResponse } from "next/server";
import { checkFeeds } from "@/lib/feed-health";
import { supabaseKeyKind } from "@/lib/supabase";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Manual feed-health check. Zero AI tokens — plain HTTP fetches.
 * The daily alarm lives in /api/cron/model-health; this is the on-demand view
 * for QA ("is the home feed thin because a source died again?").
 */
export async function GET() {
  const report = await checkFeeds();
  // Lets a human confirm which Supabase key production is using, without
  // opening a dashboard and without ever printing the key.
  const dbKey = supabaseKeyKind();
  return NextResponse.json({ ...report, dbKey }, {
    // A dead scorable feed is a real failure — surface it in the status code so
    // a monitor or a curl in a terminal notices without reading the body.
    status: report.ok ? 200 : 503,
  });
}
