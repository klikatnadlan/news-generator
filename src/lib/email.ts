import { supabase } from "@/lib/supabase";

// Token-free email digest of "🆕 חדש במעקבים" via the Resend REST API.
// No npm package — a plain fetch. No AI, no tokens.

function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("klikatnadlan.co.il")) return 'קליקת הנדל"ן';
  if (lower.includes("globes.co.il")) return "גלובס";
  if (lower.includes("calcalist.co.il")) return "כלכליסט";
  if (lower.includes("themarker.com")) return "דה מרקר";
  if (lower.includes("ynet.co.il")) return "ynet";
  if (lower.includes("maariv.co.il")) return "מעריב";
  if (lower.includes("bizportal.co.il")) return "ביזפורטל";
  if (lower.includes("walla.co.il")) return "וואלה";
  if (lower.includes("ice.co.il")) return "ICE";
  if (lower.includes("nadlancenter.co.il")) return 'מרכז הנדל"ן';
  if (lower.includes("magdilim.co.il")) return "מגדילים";
  return null;
}

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "alerts@klikatnadlan.co.il";
  if (!key) return { ok: false, error: "RESEND_API_KEY missing" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `לידרפיד <${from}>`, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Build + send the daily "what's new in your watches" digest. Token-free.
export async function sendWatchDigest(days = 1): Promise<{ sent: boolean; total?: number; reason?: string; error?: string }> {
  const to = process.env.ALERT_EMAIL_TO;
  if (!to) return { sent: false, reason: "ALERT_EMAIL_TO missing" };

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase.rpc("new_alert_hits", { p_since: since });
  if (error) return { sent: false, error: error.message };

  // Group by watch, dedup, cap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[];
  const map = new Map<string, { name: string; emoji: string; total: number; seen: Set<string>; items: { title: string; source: string; url: string }[] }>();
  for (const r of rows) {
    if (!map.has(r.alert_id)) map.set(r.alert_id, { name: r.alert_name, emoji: r.emoji, total: 0, seen: new Set(), items: [] });
    const g = map.get(r.alert_id)!;
    const k = (r.title || "").replace(/<[^>]*>/g, "").slice(0, 90);
    if (g.seen.has(k)) continue;
    g.seen.add(k);
    g.total += 1;
    if (g.items.length < 6) {
      g.items.push({
        title: (r.title || "").replace(/<[^>]*>/g, "").trim(),
        source: detectSourceFromUrl(r.source_url) || r.source || "",
        url: r.source_url || "",
      });
    }
  }
  const groups = Array.from(map.values()).sort((a, b) => b.total - a.total);
  const total = groups.reduce((s, g) => s + g.total, 0);
  if (total === 0) return { sent: false, reason: "no new items" };

  const today = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  const body = groups
    .map((g) => {
      const items = g.items
        .map((it) => `<div style="margin:4px 0;font-size:14px;line-height:1.5;color:#374151">• ${esc(it.title)} <span style="color:#9ca3af;font-size:12px">(${esc(it.source)})</span>${it.url ? ` <a href="${esc(it.url)}" style="color:#0071e3;font-size:12px;text-decoration:none">מקור ←</a>` : ""}</div>`)
        .join("");
      return `<div style="margin:0 0 16px"><div style="font-size:15px;font-weight:700;color:#0f1419;margin-bottom:4px">${g.emoji} ${esc(g.name)} <span style="color:#9ca3af;font-weight:400;font-size:13px">· ${g.total} חדש</span></div>${items}</div>`;
    })
    .join("");

  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f8f9fb;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#0f1419;color:#fff;border-radius:12px;padding:18px 20px;margin-bottom:16px">
      <div style="font-size:20px;font-weight:800">לידרפיד</div>
      <div style="font-size:13px;opacity:.7">🆕 חדש במעקבים שלך · ${today}</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:18px 20px;border:1px solid #eef0f2">
      <div style="font-size:13px;color:#6b7280;margin-bottom:14px">${total} באזים חדשים נתפסו במעקבים שלך ביממה האחרונה.</div>
      ${body}
    </div>
    <div style="text-align:center;font-size:12px;color:#9ca3af;padding:14px">
      <a href="https://news-generator-seven.vercel.app/alerts" style="color:#dc2626;text-decoration:none;font-weight:700">פתח את תודעת השוק ←</a>
      <div style="margin-top:6px">מקבוצת קליקת הנדל״ן · החברים מהקליקה</div>
    </div>
  </div></body></html>`;

  const r = await sendEmail({ to, subject: `🆕 חדש במעקבים · ${total} באזים · ${today}`, html });
  return r.ok ? { sent: true, total } : { sent: false, error: r.error };
}
