import { isRealEstate } from "./src/lib/classify.ts";

const title = "רכשו דירה ב-2022 ביישוב הזה ";
const summary = "האם יכול להיות שמחירי דירות חדשות יורדים ביישובים שבהם הם עומדים על 1.5 מיליון שקל ומטה? מספר עסקאות בחריש מצביעות על כך שלמרות המחירים, העיר עדיין לא מתאימה למשקיעים";

for (const src of ["ICE", "ice", "מדלן"]) {
  console.log("source=", src, "=>", isRealEstate(title, summary, src));
}
