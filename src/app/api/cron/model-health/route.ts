import { NextRequest, NextResponse } from "next/server";
import { pingModel, MONITORED_MODELS, MODEL_FALLBACKS } from "@/lib/anthropic";
import { sendEmail } from "@/lib/email";
import { supabase } from "@/lib/supabase";

export const maxDuration = 30;

// Daily AI-model health monitor. The 2-day outage happened because a deprecated
// model failed SILENTLY — nobody knew. This pings every model the app uses (4
// tokens each) and, the moment one is retired, emails Ben a clear alert naming a
// live replacement. Runs at 03:40, just before the 04:00 scan, so a dead model
// is known before it can break the daily run. Self-heal (aiCreate fallbacks)
// handles non-streaming calls automatically; this is the alarm for everything.
export async function GET(request: NextRequest) {
  const isManual = request.headers.get("x-manual-scan") === "true";
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && !isManual && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checked: { kind: string; model: string; alive: boolean; detail?: string }[] = [];
  const dead: { kind: string; model: string; detail?: string; replacement: string | null }[] = [];

  for (const { kind, model } of MONITORED_MODELS) {
    const r = await pingModel(model);
    checked.push({ kind, model, alive: r.alive, detail: r.detail });
    if (!r.alive) {
      let replacement: string | null = null;
      for (const fb of MODEL_FALLBACKS[model] || []) {
        if ((await pingModel(fb)).alive) { replacement = fb; break; }
      }
      dead.push({ kind, model, detail: r.detail, replacement });
    }
  }

  // Alert (once per dead-set per day) if anything died.
  if (dead.length) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `model_alert|${dead.map((d) => d.model).join(",")}|${today}`;
    let alreadySent = false;
    try {
      const { data } = await supabase.from("narrative_cache").select("cache_key").eq("cache_key", key).maybeSingle();
      alreadySent = !!data;
    } catch { /* ignore */ }
    if (!alreadySent) {
      const rows = dead.map((d) =>
        `<tr><td style="padding:6px 10px;border:1px solid #eee">${d.kind}</td>
         <td style="padding:6px 10px;border:1px solid #eee;color:#dc2626;font-weight:700">${d.model} ❌</td>
         <td style="padding:6px 10px;border:1px solid #eee;color:#059669;font-weight:700">${d.replacement ? `${d.replacement} ✅` : "אין גיבוי חי — דחוף!"}</td></tr>`
      ).join("");
      const html = `<div dir="rtl" style="font-family:Arial;font-size:14px;color:#0f1419">
        <h2>🚨 לידרפיד — מודל AI הוצא משירות</h2>
        <p>הבדיקה היומית זיהתה מודל שכבר לא עונה. פיצ'רי ה-AI שמשתמשים בו ייפלו עד החלפה.</p>
        <table style="border-collapse:collapse"><tr>
          <th style="padding:6px 10px;border:1px solid #eee">תפקיד</th>
          <th style="padding:6px 10px;border:1px solid #eee">מודל מת</th>
          <th style="padding:6px 10px;border:1px solid #eee">החלפה חיה מומלצת</th></tr>${rows}</table>
        <p style="color:#6b7280;font-size:12px">תיקון: עדכן את הקבוע ב-<code>src/lib/anthropic.ts</code> למודל המומלץ. (הקריאות הלא-מזרימות כבר עברו אוטומטית לגיבוי.)</p>
      </div>`;
      try {
        await sendEmail({ to: "klikatnadlan@gmail.com", subject: `🚨 לידרפיד: מודל AI מת — ${dead.map((d) => d.model).join(", ")}`, html });
        await supabase.from("narrative_cache").upsert({ cache_key: key, narratives: { dead }, count: dead.length, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
      } catch (e) { console.error("model-health alert failed:", e); }
    }
  }

  return NextResponse.json({ ok: dead.length === 0, checked, dead });
}
