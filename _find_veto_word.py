# -*- coding: utf-8 -*-
import io
title = "רכשו דירה ב-2022 ביישוב הזה "
summary = "האם יכול להיות שמחירי דירות חדשות יורדים ביישובים שבהם הם עומדים על 1.5 מיליון שקל ומטה? מספר עסקאות בחריש מצביעות על כך שלמרות המחירים, העיר עדיין לא מתאימה למשקיעים"
veto = "ירי"
text = (title + " " + summary)
out = []
for w in text.split():
    if veto in w.lower():
        out.append(w)
with io.open("_find_veto_word_out.txt","w",encoding="utf-8") as f:
    f.write("veto term: %s (len %d)\n" % (veto, len(veto)))
    f.write("words containing it: %s\n" % out)
    # also show index positions in full text
    idx = text.find(veto)
    f.write("first index in text: %d\n" % idx)
    f.write("context: ...%s...\n" % text[max(0,idx-8):idx+10])
print("done")
