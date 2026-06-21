# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, sys, io, time

BASE = "https://news-generator-seven.vercel.app"

def hit(path, headers=None, label=None):
    url = BASE + path
    h = {"User-Agent": "klika-api-sweep/1.0", "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h, method="GET")
    out = {"label": label or path, "url": url}
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
            out["status"] = r.getcode()
            out["ctype"] = r.headers.get("Content-Type", "")
            out["bytes"] = len(body)
            text = body.decode("utf-8", errors="replace")
            out["sample"] = make_sample(text)
            out["raw_head"] = text[:600]
    except urllib.error.HTTPError as e:
        body = e.read()
        out["status"] = e.code
        out["ctype"] = e.headers.get("Content-Type", "") if e.headers else ""
        out["bytes"] = len(body)
        text = body.decode("utf-8", errors="replace")
        out["sample"] = make_sample(text)
        out["raw_head"] = text[:600]
    except Exception as e:
        out["status"] = "EXC"
        out["sample"] = "EXCEPTION: " + repr(e)
        out["raw_head"] = ""
    out["ms"] = int((time.time() - t0) * 1000)
    return out

def make_sample(text):
    text = text.strip()
    try:
        j = json.loads(text)
        if isinstance(j, dict):
            keys = list(j.keys())
            summ = "JSON dict keys=" + str(keys)
            # count common array fields
            for k in keys:
                v = j[k]
                if isinstance(v, list):
                    summ += " | %s=len%d" % (k, len(v))
                elif isinstance(v, (str, int, float, bool)) or v is None:
                    sv = str(v)
                    if len(sv) > 60:
                        sv = sv[:60] + "..."
                    summ += " | %s=%s" % (k, sv)
            return summ
        elif isinstance(j, list):
            return "JSON array len=%d; first=%s" % (len(j), json.dumps(j[0], ensure_ascii=False)[:200] if j else "EMPTY")
        else:
            return "JSON scalar: " + str(j)[:200]
    except Exception:
        oneline = " ".join(text.split())
        return "NON-JSON[" + str(len(text)) + "b]: " + oneline[:200]

endpoints = [
    ("/api/news/today", None, "news/today"),
    ("/api/news/week", None, "news/week"),
    ("/api/news/week-all", None, "news/week-all"),
    ("/api/narratives", None, "narratives"),
    ("/api/market-index", None, "market-index"),
    ("/api/archive?" + urllib.parse.urlencode({"q": "מעלות"}), None, "archive?q=מעלות"),
    ("/api/cities/overview?" + urllib.parse.urlencode({"city": "מעלות תרשיחא"}), None, "cities/overview"),
    ("/api/cities/feed?" + urllib.parse.urlencode({"city": "מעלות תרשיחא"}), None, "cities/feed"),
    ("/api/cities/research?" + urllib.parse.urlencode({"city": "מעלות תרשיחא", "topics": "פרויקט"}), None, "cities/research (ONCE)"),
    ("/api/cities/maturation?" + urllib.parse.urlencode({"city": "מעלות תרשיחא", "entity": "רני צים"}), None, "cities/maturation (ONCE)"),
    ("/api/alerts", None, "alerts"),
    ("/api/cron/model-health", {"x-manual-scan": "true"}, "cron/model-health (manual scan)"),
    ("/api/history", None, "history"),
    ("/api/article-read?" + urllib.parse.urlencode({"url": "https://www.gov.il/he/pages/maalot-security-10819"}), None, "article-read"),
]

results = []
for path, hdr, label in endpoints:
    print("HIT:", label, file=sys.stderr)
    results.append(hit(path, hdr, label))

with io.open("_api_sweep_results.txt", "w", encoding="utf-8") as f:
    for r in results:
        f.write("=" * 80 + "\n")
        f.write("LABEL : %s\n" % r["label"])
        f.write("URL   : %s\n" % r["url"])
        f.write("STATUS: %s   (%s ms, %s bytes, %s)\n" % (r.get("status"), r.get("ms"), r.get("bytes"), r.get("ctype","")))
        f.write("SAMPLE: %s\n" % r.get("sample",""))
        f.write("HEAD  : %s\n" % r.get("raw_head","").replace("\n", " ")[:600])
        f.write("\n")

print("DONE", file=sys.stderr)
