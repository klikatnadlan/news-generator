#!/usr/bin/env node
/**
 * Smoke test: start server.mjs over real stdio, list its tools, and call each
 * one against production. Verifies the MCP protocol path, not just the fetch
 * helpers — a tool that throws on a schema mismatch looks fine until a client
 * actually calls it.
 *
 *   npm run smoke
 *
 * Costs a few agorot on the first run and nothing afterwards (the answers are
 * cached for six hours).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const lines = [];
const log = (s) => { lines.push(s); };

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, "server.mjs")],
});
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
log(`tools: ${tools.length}`);
for (const t of tools) {
  log(`  - ${t.name}  (${Object.keys(t.inputSchema?.properties || {}).join(", ")})`);
}
log("");

const calls = [
  ["search_news", { query: "שיכון ובינוי", from: "2026-08-02" }],
  ["city_dossier", { city: "אשקלון" }],
  ["ask_leaderfeed", { question: "מה קרה בשיכון ובינוי החודש?" }],
];

for (const [name, args] of calls) {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content || []).map((c) => c.text || "").join("");
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    log(`=== ${name} (${secs}s, ${text.length} chars) ===`);
    log(text.slice(0, 700));
    log("");
  } catch (e) {
    log(`=== ${name} FAILED: ${e.message} ===`);
    log("");
  }
}

await client.close();
writeFileSync(join(here, "smoke-out.txt"), lines.join("\n"), "utf8");
