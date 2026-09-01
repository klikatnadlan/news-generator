#!/usr/bin/env node
/**
 * LeaderFeed MCP server — ask the corpus from a chat instead of the app.
 *
 * DESIGN NOTE: this calls LeaderFeed's deployed HTTP API rather than importing
 * src/lib/ask.ts.
 *
 * The obvious alternative — import planQuery/retrieveForPlan directly — would
 * need a second Supabase client, a second Anthropic client, a copy of every env
 * var, and a TypeScript build step, and the two paths would drift the first
 * time one of them was fixed. Going through /api/ask means an answer here is
 * the SAME answer the app gives, by construction, and it inherits the daily
 * quota and the six-hour cache for free.
 *
 * Cost: identical to using the app. A repeat question is cached and free.
 *
 * Setup (see README.md): add to the MCP config, then ask things like
 *   "מה קרה בשיכון ובינוי החודש?"
 *   "תשווה את הכיסוי של אשקלון מול נתניה, ותכתוב מזה הודעת וואטסאפ"
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.LEADERFEED_URL || "https://news-generator-seven.vercel.app").replace(/\/$/, "");
// A cold question runs plan -> search -> write. Measured 24-40s in production,
// so the client timeout has to clear that with room to spare.
const TIMEOUT_MS = 90_000;

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": "leaderfeed-mcp" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

/**
 * Consume the SSE answer stream and return the finished text plus its sources.
 * Status frames are dropped — they exist for a progress bar, not for a reader.
 */
async function askLeaderFeed(question) {
  const url = `${BASE}/api/ask?q=${encodeURIComponent(question)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "leaderfeed-mcp" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let done = {};
  let failure = null;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      let event = null;
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }
      // Order matters: a status frame also carries `text`, and counting it as
      // answer text prefixes every answer with "34 כתבות מ-6 מקורות".
      if (event === "status") continue;
      if (event === "error") failure = parsed.error || "שגיאה";
      else if (event === "done") done = parsed;
      else if (typeof parsed.text === "string") answer += parsed.text;
    }
  }

  if (failure) throw new Error(failure);
  return { answer, ...done };
}

const server = new McpServer({ name: "leaderfeed", version: "1.0.0" });

server.registerTool(
  "ask_leaderfeed",
  {
    title: "שאל את לידרפיד",
    description:
      "Answer a free-text Hebrew question from LeaderFeed's Israeli real-estate news corpus. " +
      "Returns a written answer where every claim carries a [n] reference into the returned source list, " +
      "plus the sources themselves (title, outlet, date, URL). " +
      "Handles three kinds of question: what happened with a company/topic/city; " +
      "rankings and counts across the month (\"who appeared most\"); and comparisons between two entities. " +
      "Falls back to a live web search when the corpus is thin, and says so. " +
      "A cold question takes 25-40 seconds; a repeat is instant and free. " +
      "Prefer this over search_news when the user wants an answer rather than a list of articles.",
    inputSchema: {
      question: z
        .string()
        .min(2)
        .max(300)
        .describe("The question, in Hebrew. e.g. \"מה קרה בשיכון ובינוי החודש?\""),
    },
  },
  async ({ question }) => {
    const r = await askLeaderFeed(question);
    const sources = (r.sources || [])
      .map((s, i) => `[${i + 1}] ${s.title}${s.source ? ` — ${s.source}` : ""}${s.date ? ` (${s.date})` : ""}${s.web ? " [web]" : ""}\n    ${s.url}`)
      .join("\n");
    const meta = [
      r.basis,
      r.webCount ? `${r.webCount} מהרשת` : null,
      r.cached ? "מהמטמון" : null,
    ].filter(Boolean).join(" · ");

    return {
      content: [{
        type: "text",
        text: `${r.answer}\n\n--- מקורות (${(r.sources || []).length}) ---\n${sources}\n\n${meta}`,
      }],
    };
  },
);

server.registerTool(
  "search_news",
  {
    title: "חיפוש בארכיון",
    description:
      "Search LeaderFeed's article archive and return the matching articles as a list, with no AI involved. " +
      "Free and fast (1-4 seconds). Use this when the user wants the articles themselves rather than a written answer, " +
      "or to check what coverage exists before asking a question. " +
      "IMPORTANT: the search matches substrings, so pass the bare entity name without an attached Hebrew prefix letter — " +
      "\"שיכון ובינוי\", not \"בשיכון ובינוי\"; \"בת ים\", not \"בבת ים\".",
    inputSchema: {
      query: z.string().min(2).max(120).describe("Search terms in Hebrew, no attached prefix letters."),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest date, YYYY-MM-DD."),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest date, YYYY-MM-DD."),
    },
  },
  async ({ query, from, to }) => {
    const qs = new URLSearchParams({ q: query });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const d = await getJson(`/api/archive?${qs}`);
    const items = (d.items || [])
      .map((it) => `${it.scan_date || "?"} · ${it.source || "?"}${it.web ? " [web]" : ""}\n  ${it.title}\n  ${it.url}`)
      .join("\n\n");
    const header = `${d.internalTotal ?? 0} מהמאגר` +
      (d.webCount ? ` + ${d.webCount} מהרשת` : "") +
      (d.widenedTo ? ` · הורחב ל־"${d.widenedTo}"` : "") +
      (d.scanTruncated ? " · הספירה היא רצפה, לא סך מדויק" : "");
    return { content: [{ type: "text", text: `${header}\n\n${items || "לא נמצאו תוצאות."}` }] };
  },
);

server.registerTool(
  "city_dossier",
  {
    title: "תדריך אזור",
    description:
      "Build an appraiser-style briefing on how an Israeli city is covered in the news: real estate and projects, " +
      "employment, security, education, transport, active developers, and marketing pros and cons. " +
      "Returns the briefing plus the real articles behind it. Takes 20-40 seconds cold, instant when cached. " +
      "Use for \"tell me about city X\" rather than a specific question about a single event there.",
    inputSchema: {
      city: z.string().min(2).max(40).describe("City name in Hebrew, e.g. \"אשקלון\"."),
    },
  },
  async ({ city }) => {
    const d = await getJson(`/api/cities/dossier?city=${encodeURIComponent(city)}`);
    if (d.error) throw new Error(d.error);
    const sources = (d.sources || [])
      .map((s, i) => `[${i + 1}] ${s.title}${s.source ? ` — ${s.source}` : ""}${s.date ? ` (${s.date})` : ""}\n    ${s.url}`)
      .join("\n");
    return {
      content: [{
        type: "text",
        text: `${d.report}\n\n--- מקורות (${(d.sources || []).length}) ---\n${sources}`,
      }],
    };
  },
);

await server.connect(new StdioServerTransport());
