// Fetches the full text of a news article from its URL so the AI can write
// from the real content (numbers, quotes, details) instead of guessing from
// the headline + RSS snippet. Best-effort: returns "" on failure / paywall /
// too-little-content, in which case callers fall back to title + summary.

const COMMON_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#039;": "'",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&laquo;": "«",
  "&raquo;": "»",
  "&ndash;": "-",
  "&mdash;": "-",
  "&hellip;": "…",
};

function decodeEntities(s: string): string {
  let out = s.replace(/&[a-zA-Z#0-9]+;/g, (m) => COMMON_ENTITIES[m] ?? m);
  // Numeric entities like &#8220;
  out = out.replace(/&#(\d+);/g, (_, n) => {
    try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ""; }
  });
  return out;
}

// Nav/menu junk signature — modern news sites (ynet, mako…) are JS-rendered,
// so the static HTML's <p>/text is often the navigation menu. If the extracted
// text reeks of nav categories, we reject it.
const NAV_SIGNATURE = ["מבזקים", "פודקאסטים", "רכילות", "מזג אוויר", "ערוצי", "כל הכתבות", "מנויים"];

function looksLikeNav(text: string): boolean {
  const head = text.slice(0, 400);
  let hits = 0;
  for (const w of NAV_SIGNATURE) if (head.includes(w)) hits++;
  return hits >= 3;
}

/** Pull articleBody from JSON-LD structured data (the most reliable source). */
function jsonLdArticleBody(html: string): string {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1].trim());
      const nodes = Array.isArray(data) ? data : (data["@graph"] || [data]);
      for (const node of nodes) {
        if (node && typeof node.articleBody === "string" && node.articleBody.length > 80) {
          return decodeEntities(node.articleBody.replace(/\s+/g, " ").trim());
        }
      }
    } catch {
      // malformed JSON-LD block — skip
    }
  }
  return "";
}

/** og:description / meta description — a clean one-paragraph summary. */
function metaDescription(html: string): string {
  const m =
    html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i);
  return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : "";
}

/**
 * Extract readable body text. Order of preference:
 *   1. JSON-LD articleBody (full text, works on most news sites incl. ynet)
 *   2. <article>/<p> text — but only if it isn't navigation junk
 *   3. og:description (clean summary, better than the RSS snippet)
 */
function extractText(html: string): string {
  // 1. JSON-LD — best
  const ld = jsonLdArticleBody(html);
  if (ld.length >= 150) return ld;

  const meta = metaDescription(html);

  // 2. <p> extraction (skip script/style/comments first)
  const h = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const articleMatch = h.match(/<article[\s\S]*?<\/article>/i);
  const region = articleMatch ? articleMatch[0] : h;
  const paras = region.match(/<p[\s\S]*?<\/p>/gi) || [];
  const pText = paras
    .map((p) => decodeEntities(p.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()))
    .filter((t) => t.length >= 40)
    .join("\n")
    .trim();

  const pIsClean = pText.length >= 200 && !looksLikeNav(pText);

  // 3. Choose the best clean candidate. Prepend the meta summary when we have
  // real body text; otherwise the meta alone still beats the RSS snippet.
  if (pIsClean) return meta ? `${meta}\n${pText}` : pText;
  if (meta.length >= 80) return meta;
  return ""; // nothing usable → caller falls back to title + summary
}

/**
 * Fetch + extract the article text. Returns up to ~4000 chars, or "" if the
 * fetch fails, times out, or yields too little usable text (e.g. paywall).
 */
export async function fetchArticleText(url: string, maxChars = 4000): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Look like a real browser so sites return the full page
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return "";

    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("text/html") && !ctype.includes("application/xhtml")) return "";

    const html = await res.text();
    const text = extractText(html);
    // extractText already returns "" when nothing usable was found.
    if (text.length < 80) return "";
    return text.slice(0, maxChars);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}
