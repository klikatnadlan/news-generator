// Curated list of Israeli cities for the "ערים" city-intelligence tab.
// district (מחוז) is embedded — stable, reliable, instant (no external call).
// Population/mayor are fetched live (Wikidata/Wikipedia) and cached.

export interface City {
  name: string;       // canonical display + Wikipedia title
  district: string;   // מחוז
  aliases?: string[]; // extra search terms (e.g. short form)
  commonWord?: boolean; // name is also a common Hebrew word (streets/tower/…) →
                        // match the city only in the TITLE to avoid false hits
  wikiPage?: string;  // he-wiki article title when it differs from name
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
  { name: "יקנעם", district: "צפון", aliases: ["יקנעם עילית"], wikiPage: "יקנעם עילית" },
  { name: "שלומי", district: "צפון" },
  { name: "מעלה אדומים", district: "יו\"ש" },
  // חיפה
  { name: "חיפה", district: "חיפה" },
  { name: "חדרה", district: "חיפה" },
  { name: "קריית אתא", district: "חיפה" },
  { name: "קריית ביאליק", district: "חיפה" },
  { name: "קריית מוצקין", district: "חיפה" },
  { name: "קריית ים", district: "חיפה" },
  { name: "נשר", district: "חיפה", commonWord: true, wikiPage: "נשר (עיר)" },
  { name: "טירת כרמל", district: "חיפה" },
  { name: "אום אל פחם", district: "חיפה" },
  { name: "אור עקיבא", district: "חיפה" },
  { name: "זכרון יעקב", district: "חיפה" },
  { name: "פרדס חנה כרכור", district: "חיפה", wikiPage: "פרדס חנה-כרכור" },
  // מרכז
  { name: "פתח תקווה", district: "מרכז", aliases: ["פ\"ת"] },
  { name: "ראשון לציון", district: "מרכז" },
  { name: "נתניה", district: "מרכז" },
  { name: "רחובות", district: "מרכז", commonWord: true },
  { name: "כפר סבא", district: "מרכז" },
  { name: "הרצליה", district: "מרכז" },
  { name: "רעננה", district: "מרכז" },
  { name: "הוד השרון", district: "מרכז" },
  { name: "ראש העין", district: "מרכז" },
  { name: "יבנה", district: "מרכז", commonWord: true },
  { name: "נס ציונה", district: "מרכז" },
  { name: "לוד", district: "מרכז", commonWord: true },
  { name: "רמלה", district: "מרכז" },
  { name: "מודיעין", district: "מרכז", aliases: ["מודיעין מכבים רעות"], commonWord: true, wikiPage: "מודיעין-מכבים-רעות" },
  { name: "כפר יונה", district: "מרכז" },
  { name: "גדרה", district: "מרכז", commonWord: true },
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
  { name: "נתיבות", district: "דרום", commonWord: true },
  { name: "שדרות", district: "דרום", commonWord: true },
  { name: "אופקים", district: "דרום", commonWord: true },
  { name: "ערד", district: "דרום" },
  { name: "קריית מלאכי", district: "דרום" },
  { name: "רהט", district: "דרום" },
  { name: "מצפה רמון", district: "דרום" },
  { name: "ירוחם", district: "דרום" },
  // יו"ש
  { name: "אריאל", district: "יו\"ש", commonWord: true },
  { name: "מודיעין עילית", district: "יו\"ש" },
];

export function findCity(q: string): City | undefined {
  const s = q.trim();
  if (!s) return undefined;
  const exact = CITIES.find((c) => c.name === s || (c.aliases || []).includes(s));
  if (exact) return exact;
  return CITIES.find((c) => c.name.includes(s) || (c.aliases || []).some((a) => a.includes(s) || s.includes(a)));
}

// Curated keyword sets per research cube — relevance: a single generic word
// ("כביש") matched ANY incidental mention; each topic ORs precise keywords and
// city_news ranks title-hits first, so results actually match the topic.
export const RESEARCH_TOPIC_KEYWORDS: Record<string, string[]> = {
  "פרויקט": ["פרויקט", "יח\"ד", "שכונה חדשה", "היתר בנייה", "תוכנית בנייה"],
  "דירות": ["דירות חדשות", "דירות למכירה", "שיווק דירות", "אכלוס", "דירות"],
  "התחדשות": ["התחדשות עירונית", "פינוי בינוי", "פינוי-בינוי", "תמ\"א 38", "מתחם פינוי"],
  "מחירים": ["מחירי הדירות", "מחירי דירות", "עליית מחירים", "ירידת מחירים", "מחיר ממוצע", "התייקר"],
  "מחיר למשתכן": ["מחיר למשתכן", "דירה בהנחה", "מחיר מטרה", "הגרלת דירות"],
  "מכרז": ["מכרז", "רמ\"י", "רשות מקרקעי ישראל", "שיווק קרקע"],
  "חינוך": ["חינוך", "בית ספר", "בתי ספר", "גני ילדים", "תיכון", "בגרות", "תלמידים"],
  // Ben: crime = also thefts, break-ins, murders, domestic violence, police
  // presence (משטרת לוד…), enforcement (החרמת סוסים, הריסת מבנים) — public order.
  "אלימות": ["אלימות", "פשיעה", "שוד", "רצח", "נרצח", "ירי", "דקירה", "סכין", "גנבה", "גניבה", "פריצה", "אלימות במשפחה", "עבריינות", "משטרה", "משטרת", "אכיפה", "מעצר", "נעצר", "שוטרים", "התעללות"],
  "תעסוקה": ["תעסוקה", "מפעל", "משרות", "פארק תעשייה", "אזור תעשייה", "עובדים", "מרכז עסקים"],
  "כביש": ["כביש", "מחלף", "תחבורה ציבורית", "פקקים", "נתיבי ישראל", "תשתיות תחבורה"],
  "רכבת": ["רכבת", "רכבת קלה", "מטרו", "תחנת רכבת", "הרכבת"],
  "בריאות": ["בית חולים", "בריאות", "מרפאה", "קופת חולים", "טיפת חלב"],
  "סביבה": ["איכות הסביבה", "זיהום", "פארק", "שטחים ירוקים", "מיחזור", "גינה ציבורית"],
  "תיירות": ["תיירות", "מלון", "מלונות", "נופש", "אטרקציה", "מבקרים"],
  // New topics (Ben): sport (incl. city races like "מרוץ מעלות"), culture/leisure, civic events.
  "ספורט": ["מרוץ", "ריצה", "אצטדיון", "היכל ספורט", "כדורגל", "כדורסל", "קבוצה עירונית", "ליגה", "אירוע ספורט", "אולם ספורט", "טורניר", "אליפות"],
  "תרבות": ["הופעה", "הופעות", "מופע", "מופעים", "תיאטרון", "קונצרט", "מוזיקה", "פסטיבל", "אירוע תרבות", "אירועי תרבות", "היכל התרבות", "מרכז תרבות"],
  "אירועים": ["אירוע עירוני", "אירועים", "חגיגה", "חגיגות", "יריד", "כנס", "אירוע המוני", "יום העצמאות", "אירוע קהילתי", "טקס"],
};

// Natural-language web-search query per topic (city name is prepended). Used by
// the research web-fallback (Firecrawl) — phrased the way a person would Google
// it, NOT the internal keyword-OR list (which is tuned for our title matching).
export const RESEARCH_TOPIC_WEB_QUERY: Record<string, string> = {
  "פרויקט": "פרויקט בנייה חדש, שכונה חדשה, מגדל מגורים, היתר בנייה, יח\"ד חדשות בשיווק",
  "דירות": "דירות חדשות למכירה, שיווק דירות, אכלוס שכונה, דירות מקבלן",
  "התחדשות": "התחדשות עירונית, פינוי בינוי, תמ\"א 38, מתחם פינוי בינוי חדש, הריסה ובנייה מחדש",
  "מחירים": "מחירי דירות, עליית מחירי הדירות, ירידת מחירים, מחיר ממוצע למ\"ר, שוק הנדל\"ן",
  "מחיר למשתכן": "דירה בהנחה, מחיר למשתכן, מחיר מטרה, הגרלת דירות בהנחה, מתחם מחיר מטרה חדש",
  "מכרז": "מכרז קרקע חדש, רשות מקרקעי ישראל רמ\"י, שיווק קרקע למגורים, מכרז להקמת שכונה",
  "חינוך": "בית ספר חדש, בתי ספר, גני ילדים, מוסדות חינוך, דירוג בגרויות, פתיחת שנת לימודים",
  "אלימות": "רצח, ניסיון לרצח, ירי, דקירה, שוד, גנבות ופריצות, אלימות נגד נשים, אלימות במשפחה, פשיעה ועבריינות, פעילות משטרה",
  "תעסוקה": "אזור תעשייה חדש, פארק תעשייה והייטק, פתיחת מפעל, משרות ומקומות עבודה, מרכז עסקים",
  "כביש": "כביש חדש, כבישי גישה חדשים, מחלף חדש, צומת, כביש 6, פרויקט תשתיות תחבורה",
  "רכבת": "תחנת רכבת חדשה, רכבת קלה, מטרו, קו רכבת חדש, הרחבת תחבורה ציבורית",
  "בריאות": "בית חולים חדש, מרכז רפואי, מרפאה וקופת חולים חדשה, שירותי בריאות, טיפת חלב",
  "סביבה": "פארק חדש, שטחים ירוקים וגינות ציבוריות, איכות הסביבה, זיהום אוויר, פרויקט מיחזור",
  "תיירות": "מלון חדש, פרויקט תיירות, אטרקציה תיירותית, נופש ותיירות, מתחם מלונאות",
  // New topics (Ben): sport incl. city races, culture/leisure incl. shows, civic events.
  "ספורט": "מרוץ, אירועי ספורט, אצטדיון, קבוצת כדורגל וכדורסל עירונית, היכל ספורט",
  "תרבות": "הופעות ומופעים, תיאטרון, קונצרט ומוזיקה, פסטיבל ואירועי תרבות, היכל התרבות",
  "אירועים": "אירוע עירוני, פסטיבל ויריד, אירוע המוני, חגיגות יום העצמאות, אירוע קהילתי",
};

// Search terms for a city's news feed (name + aliases).
export function citySearchTerms(c: City): string {
  // The longest / most specific term first; the search uses word-AND so the
  // full official name is precise (e.g. "מעלות תרשיחא" not just "מעלות").
  return c.name;
}
