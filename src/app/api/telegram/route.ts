import { NextRequest, NextResponse } from "next/server";
import { routeUpdate } from "@/lib/telegram-handlers";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
    console.log("Telegram update:", JSON.stringify(body).slice(0, 500));
  } catch (e) {
    console.error("Failed to parse body:", e);
    return NextResponse.json({ ok: true });
  }

  try {
    await routeUpdate(body);
    console.log("routeUpdate completed successfully");
  } catch (error) {
    console.error("Telegram webhook error:", error);
  }

  return NextResponse.json({ ok: true });
}

// Also handle GET for health check
export async function GET() {
  return NextResponse.json({ status: "ok", bot: "KlikaNewsBot" });
}
