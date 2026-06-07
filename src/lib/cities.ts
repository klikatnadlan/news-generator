// Curated list of Israeli cities for the "ערים" city-intelligence tab.
// district (מחוז) is embedded — stable, reliable, instant (no external call).
// Population/mayor are fetched live (Wikidata/Wikipedia) and cached.

export interface City {
  name: string;       // canonical display + Wikipedia title
  district: string;   // מחוז
  aliases?: string[]; // extra search terms (e.g. short form)
}

export const CITIES: City[] = [
  // צפון
  { name: "מעלות תרשיחא", district: "צפון", aliases: ["מעלות"] },
  { name: "נהריה", district: "צפון" },
  { name: "כרמיאל", district: "צפון" },
  { name: "צפת", district: "צפון" },
  { name: "טבריה", district: "צפון" },
  { name: "עכו", district: "צפון" },
  { name: "קריית שמונה", district: "צפון" },
  { name: "עפולה", district: "צפון" },
  { name: "נצרת", district: "צפון" },
  { name: "נוף הגליל", district: "צפון", aliases: ["נצרת עילית"] },
  { name: "בית שאן", district: "צפון" },
  { name: "מגדל העמק", district: "צפון" },
  { name: "יקנעם", district: "צפון", aliases: ["יקנעם עילית"] },
  { name: "שלומי", district: "צפון" },
  { name: "מעלה אדומים", district: "יו\"ש" },
  // חיפה
  { name: "חיפה", district: "חיפה" },
  { name: "חדרה", district: "חיפה" },
  { name: "קריית אתא", district: "חיפה" },
  { name: "קריית ביאליק", district: "חיפה" },
  { name: "קריית מוצקין", district: "חיפה" },
  { name: "קריית ים", district: "חיפה" },
  { name: "נשר", district: "חיפה" },
  { name: "טירת כרמל", district: "חיפה" },
  { name: "אום אל פחם", district: "חיפה" },
  { name: "אור עקיבא", district: "חיפה" },
  { name: "זכרון יעקב", district: "חיפה" },
  { name: "פרדס חנה כרכור", district: "חיפה" },
  // מרכז
  { name: "פתח תקווה", district: "מרכז", aliases: ["פ\"ת"] },
  { name: "ראשון לציון", district: "מרכז" },
  { name: "נתניה", district: "מרכז" },
  { name: "רחובות", district: "מרכז" },
  { name: "כפר סבא", district: "מרכז" },
  { name: "הרצליה", district: "מרכז" },
  { name: "רעננה", district: "מרכז" },
  { name: "הוד השרון", district: "מרכז" },
  { name: "ראש העין", district: "מרכז" },
  { name: "יבנה", district: "מרכז" },
  { name: "נס ציונה", district: "מרכז" },
  { name: "לוד", district: "מרכז" },
  { name: "רמלה", district: "מרכז" },
  { name: "מודיעין", district: "מרכז", aliases: ["מודיעין מכבים רעות"] },
  { name: "כפר יונה", district: "מרכז" },
  { name: "גדרה", district: "מרכז" },
  { name: "אבן יהודה", district: "מרכז" },
  { name: "קדימה צורן", district: "מרכז" },
  // תל אביב
  { name: "תל אביב", district: "תל אביב", aliases: ["תל אביב יפו", "ת\"א"] },
  { name: "בני ברק", district: "תל אביב" },
  { name: "רמת גן", district: "תל אביב" },
  { name: "בת ים", district: "תל אביב" },
  { name: "חולון", district: "תל אביב" },
  { name: "גבעתיים", district: "תל אביב" },
  { name: "הרצליה פיתוח", district: "תל אביב" },
  { name: "אור יהודה", district: "תל אביב" },
  { name: "קריית אונו", district: "תל אביב" },
  { name: "רמת השרון", district: "תל אביב" },
  { name: "גבעת שמואל", district: "מרכז" },
  { name: "יהוד", district: "מרכז", aliases: ["יהוד מונוסון"] },
  // ירושלים
  { name: "ירושלים", district: "ירושלים" },
  { name: "בית שמש", district: "ירושלים" },
  { name: "מבשרת ציון", district: "ירושלים" },
  { name: "ביתר עילית", district: "יו\"ש" },
  // דרום
  { name: "באר שבע", district: "דרום" },
  { name: "אשדוד", district: "דרום" },
  { name: "אשקלון", district: "דרום" },
  { name: "אילת", district: "דרום" },
  { name: "קריית גת", district: "דרום" },
  { name: "דימונה", district: "דרום" },
  { name: "נתיבות", district: "דרום" },
  { name: "שדרות", district: "דרום" },
  { name: "אופקים", district: "דרום" },
  { name: "ערד", district: "דרום" },
  { name: "קריית מלאכי", district: "דרום" },
  { name: "רהט", district: "דרום" },
  { name: "מצפה רמון", district: "דרום" },
  { name: "ירוחם", district: "דרום" },
  // יו"ש
  { name: "אריאל", district: "יו\"ש" },
  { name: "מודיעין עילית", district: "יו\"ש" },
];

export function findCity(q: string): City | undefined {
  const s = q.trim();
  if (!s) return undefined;
  const exact = CITIES.find((c) => c.name === s || (c.aliases || []).includes(s));
  if (exact) return exact;
  return CITIES.find((c) => c.name.includes(s) || (c.aliases || []).some((a) => a.includes(s) || s.includes(a)));
}

// Search terms for a city's news feed (name + aliases).
export function citySearchTerms(c: City): string {
  // The longest / most specific term first; the search uses word-AND so the
  // full official name is precise (e.g. "מעלות תרשיחא" not just "מעלות").
  return c.name;
}
