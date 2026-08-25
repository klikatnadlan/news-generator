import { NextRequest, NextResponse } from "next/server";
import { pingModel, MONITORED_MODELS, MODEL_FALLBACKS } from "@/lib/anthropic";
import { sendEmail } from "@/lib/email";
import { supabase } from "@/lib/supabase";
import { checkFeeds } from "@/lib/feed-health";

export const maxDuration = 60;

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

  // ─── Feed health ───────────────────────────────────────────────────────────
  // Same failure shape as a retired model, different layer: on 2026-08-16 six of
  // the ten scorable real-estate feeds were found dead — several answering
  // 200 OK with an empty body — and nothing had ever raised an error, so the
  // home feed starved for weeks in silence. Checked here (03:40, before the
  // 04:00 scan) so a dead source is known before the day's run depends on it.
  const feedReport = await checkFeeds();

  // TWO STRIKES before we email. Publishers block Vercel's IPs intermittently:
  // measured 2026-08-25, מעריב נדל״ן delivered exactly 20 items/day on the 22nd,
  // 23rd and 24th and zero on the 25th, while answering 6/6 from another network
  // the same minute. A feed that fails one day and works the next is not dead,
  // and paging Ben about it teaches him to ignore the channel. Only a feed that
  // failed the PREVIOUS check too is treated as really gone.
  const prevKey = "feed_health_prev_failing";
  let prevFailing: string[] = [];
  try {
    const { data } = await supabase.from("narrative_cache").select("narratives").eq("cache_key", prevKey).maybeSingle();
    const n = data?.narratives as unknown;
    if (Array.isArray(n)) prevFailing = n as string[];
  } catch { /* first run — no history yet */ }

  const failingNow = feedReport.deadScorable.map((f) => f.name);
  const confirmedDead = feedReport.deadScorable.filter((f) => prevFailing.includes(f.name));
  try {
    await supabase.from("narrative_cache").upsert(
      { cache_key: prevKey, narratives: failingNow, count: failingNow.length, created_at: new Date().toISOString() },
      { onConflict: "cache_key" }
    );
  } catch { /* best effort — worst case we alert a day later */ }

  if (confirmedDead.length) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `feed_alert|${confirmedDead.map((f) => f.name).join(",")}|${today}`;
    let alreadySent = false;
    try {
      const { data } = await supabase.from("narrative_cache").select("cache_key").eq("cache_key", key).maybeSingle();
      alreadySent = !!data;
    } catch { /* ignore */ }
    if (!alreadySent) {
      const rows = confirmedDead.map((f) =>
        `<tr><td style="padding:6px 10px;border:1px solid #eee;font-weight:700">${f.name}</td>
         <td style="padding:6px 10px;border:1px solid #eee;color:#dc2626">${f.error || "אפס פריטים"}</td>
         <td style="padding:6px 10px;border:1px solid #eee;color:#6b7280;font-size:11px;direction:ltr">${f.url}</td></tr>`
      ).join("");
      const live = feedReport.feeds.filter((f) => f.ok && f.scorable);
      const html = `<div dir="rtl" style="font-family:Arial;font-size:14px;color:#0f1419">
        <h2>📡 לידרפיד — מקור חדשות הפסיק להחזיר פריטים</h2>
        <p>הבדיקה היומית מצאה פיד שאמור להזין את עמוד הבית ולא מחזיר כלום.
        <b>שים לב: פיד מת לא זורק שגיאה</b> — הוא עונה 200 עם גוף ריק, ולכן הסריקה
        ממשיכה לדווח הצלחה בזמן שעמוד הבית מתרוקן.</p>
        <table style="border-collapse:collapse"><tr>
          <th style="padding:6px 10px;border:1px solid #eee">מקור</th>
          <th style="padding:6px 10px;border:1px solid #eee">מה קרה</th>
          <th style="padding:6px 10px;border:1px solid #eee">כתובת</th></tr>${rows}</table>
        <p style="margin-top:14px">נשארו חיים ${live.length} מקורות מדורגים: ${live.map((f) => `${f.name} (${f.items})`).join(" · ") || "אף אחד — עמוד הבית יתרוקן!"}</p>
        <p style="color:#6b7280;font-size:12px">תיקון: מצא את הכתובת העדכנית ועדכן ב-<code>src/lib/sources.ts</code>.
        בדיקה ידנית בכל רגע: <code>/api/feed-health</code></p>
      </div>`;
      try {
        await sendEmail({
          to: "klikatnadlan@gmail.com",
          subject: `📡 לידרפיד: ${confirmedDead.length} מקורות חדשות מתים — ${confirmedDead.map((f) => f.name).join(", ")}`,
          html,
        });
        await supabase.from("narrative_cache").upsert(
          { cache_key: key, narratives: { dead: confirmedDead }, count: confirmedDead.length, created_at: new Date().toISOString() },
          { onConflict: "cache_key" }
        );
      } catch (e) { console.error("feed-health alert failed:", e); }
    }
  }

  // ─── Precompute the מעקבים trend arrows ────────────────────────────────────
  // `alert_radar()` computes this-week vs prior-week counts per alert. With 64
  // saved watches that is 128 windowed scans over a table growing ~400 rows/day,
  // and it intermittently dies with `57014 statement timeout` — which used to
  // take the whole מעקבים page down with it (see /api/alerts).
  //
  // So compute it ONCE here, off the user's path, and cache the result. The page
  // reads the cache and shows arrows even on a day the live call would fail;
  // /api/alerts still tries live first, so a fast day is always current.
  // Pure SQL — zero AI tokens.
  try {
    const { data: radar, error: radarErr } = await supabase.rpc("alert_radar");
    if (radarErr) {
      console.error("alert_radar precompute failed (cache keeps yesterday's arrows):", radarErr.message);
    } else if (Array.isArray(radar)) {
      const trends = (radar as { id: string; cur_7d: number; prev_7d: number }[]).map((a) => ({
        id: a.id, cur7d: Number(a.cur_7d) || 0, prev7d: Number(a.prev_7d) || 0,
      }));
      await supabase.from("narrative_cache").upsert(
        { cache_key: "alert_trends", narratives: trends, count: trends.length, created_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      );
      console.log(`alert_radar precomputed: ${trends.length} trends cached`);
    }
  } catch (e) {
    console.error("alert_radar precompute threw:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    ok: dead.length === 0 && feedReport.ok,
    checked,
    dead,
    feeds: {
      ok: feedReport.ok,
      total: feedReport.total,
      failingNow: feedReport.deadScorable.map((f) => ({ name: f.name, error: f.error })),
      confirmedDead: confirmedDead.map((f) => f.name),
      deadIngestOnly: feedReport.deadIngestOnly.length,
    },
  });
}
