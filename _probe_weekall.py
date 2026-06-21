# -*- coding: utf-8 -*-
import urllib.request, json, io

BASE = "https://news-generator-seven.vercel.app"
req = urllib.request.Request(BASE + "/api/news/week-all", headers={"User-Agent":"probe/1.0"})
with urllib.request.urlopen(req, timeout=60) as r:
    j = json.loads(r.read().decode("utf-8"))

news = j.get("news", [])
scores = [n.get("score") for n in news]
scan_dates = {}
for n in news:
    sd = n.get("scan_date")
    scan_dates[sd] = scan_dates.get(sd, 0) + 1

cats = {}
for n in news:
    c = n.get("category")
    cats[c] = cats.get(c, 0) + 1

ge30 = [n for n in news if (n.get("score") or 0) >= 30]
re_ge30 = [n for n in ge30 if n.get("category") == 'נדל"ן']

lines = []
lines.append("total news in week-all: %d" % len(news))
lines.append("scan_date distribution: %s" % json.dumps(scan_dates, ensure_ascii=False))
lines.append("score min=%s max=%s" % (min([s or 0 for s in scores]), max([s or 0 for s in scores])))
lines.append("count score>=30: %d" % len(ge30))
lines.append("count score>=30 AND category=נדלן: %d" % len(re_ge30))
lines.append("category distribution: %s" % json.dumps(cats, ensure_ascii=False))
lines.append("")
lines.append("--- top 10 by score ---")
news_sorted = sorted(news, key=lambda n: -(n.get("score") or 0))
for n in news_sorted[:10]:
    lines.append("score=%s cat=%s scan=%s | %s" % (n.get("score"), n.get("category"), n.get("scan_date"), (n.get("title") or "")[:70]))
lines.append("")
lines.append("--- distinct scores sorted ---")
lines.append(str(sorted(set([s or 0 for s in scores]), reverse=True)))

with io.open("_probe_weekall_out.txt","w",encoding="utf-8") as f:
    f.write("\n".join(lines))
print("done")
