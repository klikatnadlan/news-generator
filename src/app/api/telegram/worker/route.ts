import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { processJob } from "@/lib/telegram-handlers";

export const maxDuration = 60;

export async function GET() {
  const supabase = getSupabase();

  // Pick oldest pending job
  const { data: jobs } = await supabase
    .from("telegram_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const job = jobs[0];

  // Mark as running
  await supabase.from("telegram_jobs").update({ status: "running" }).eq("id", job.id);

  try {
    await processJob(
      job.chat_id,
      job.job_type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      job.params as any,
      job.reply_to_message_id
    );

    await supabase.from("telegram_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
  } catch (error) {
    console.error("Worker failed:", error);
    await supabase.from("telegram_jobs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
  }

  return NextResponse.json({ processed: 1, type: job.job_type });
}
