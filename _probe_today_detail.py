# -*- coding: utf-8 -*-
import urllib.request, json, io

BASE = "https://news-generator-seven.vercel.app"

def get(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent":"probe/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.getcode(), json.loads(r.read().decode("utf-8"))

lines = []
# Re-hit today and week 2x to rule out flakiness
for i in range(2):
    sc, j = get("/api/news/today")
    lines.append("today try%d: status=%d news_len=%d lastScan=%s" % (i, sc, len(j.get("news",[])), j.get("lastScan")))
    sc, j = get("/api/news/week")
    lines.append("week  try%d: status=%d news_len=%d weekStart=%s today=%s" % (i, sc, len(j.get("news",[])), j.get("weekStart"), j.get("today")))

# Pull the one RE>=30 item from week-all and print full title+summary+source
sc, wa = get("/api/news/week-all")
re_items = [n for n in wa.get("news",[]) if (n.get("score") or 0) >= 30 and n.get("category")=='נדל"ן']
lines.append("")
lines.append("RE>=30 items in week-all: %d" % len(re_items))
for n in re_items:
    lines.append("  score=%s source=%s" % (n.get("score"), n.get("source")))
    lines.append("  title=%s" % n.get("title"))
    lines.append("  summary=%s" % (n.get("summary") or "")[:300])

# also show ALL score>=30 with source so we can reason about isRealEstate vs classifyHeadline
lines.append("")
lines.append("ALL score>=30 (source / classifyHeadline-category):")
for n in sorted([x for x in wa.get("news",[]) if (x.get("score") or 0)>=30], key=lambda x:-(x.get("score") or 0)):
    lines.append("  s=%s src=%s cat=%s | %s" % (n.get("score"), n.get("source"), n.get("category"), (n.get("title") or "")[:60]))

with io.open("_probe_today_detail_out.txt","w",encoding="utf-8") as f:
    f.write("\n".join(lines))
print("done")
