// "פורטל הצמיחה של הגליל" — the Galilee growth intelligence report, embedded into
// LeaderFeed. Seeded with the curated investor portal Ben built (the 20 verified
// sources, the developing-story chains, the big numbers and leading narrative),
// rendered in the LeaderFeed design with live augmentation. This is the curated
// marketing thesis ("decisions already made, not forecasts") for the Galilee
// buying-group campaign — facts only, every item linked to its source.
//
// Future: an AI engine will generate this structure for any region on click
// (the maturation/research features are its seed). For now this is the proven,
// hand-verified Galilee report, structured so the engine can later populate it.

export type Impact = "high" | "medium" | "low";

export interface GalileeItem {
  title: string;
  source: string;
  date: string; // display string, "" when undated
  category: string;
  impact: Impact;
  whyItMatters: string; // the "חשוב לדעת" investor-lens interpretation
  url: string;
}

export interface GalileeStory {
  title: string; // e.g. "אאורה במעלות — שלוש שנים, שלושה צעדים"
  steps: (GalileeItem & { stepLabel: string })[]; // "שלב 1/3" …
}

export const GALILEE_BIG_NUMBERS: { value: string; unit: string; label: string }[] = [
  { value: "16", unit: "מיליארד ₪", label: "השקעות ביטחוניות לגליל" },
  { value: "570", unit: "מיליון ₪", label: "לאוניברסיטת תל חי" },
  { value: "1.4", unit: "מיליארד ₪", label: "להתחדשות עירונית בצפון" },
  { value: "1,800", unit: "יח״ד", label: "חדשות במעלות תרשיחא" },
  { value: "250", unit: "חדרי מלון", label: "מלון רני צים באגם מונפורט" },
];

// Developing stories — the connected multi-step chains that show the
// השתלשלות / how long maturation took / that דבר קשור בדבר.
export const GALILEE_STORIES: GalileeStory[] = [
  {
    title: "אאורה במעלות — שלוש שנים, שלושה צעדים",
    steps: [
      {
        stepLabel: "שלב 1/3",
        title: "מגידו זכתה במכרז לבניית הפרויקט",
        source: "כלכליסט", date: "2021", category: "היזם / פרויקט", impact: "medium",
        whyItMatters: "הפרויקט יצא לדרך במכרז מסודר שזכה לסיקור כלכלי. נקודת הפתיחה של רצף ההחלטות שתראו בצעדים הבאים.",
        url: "https://www.calcalist.co.il/real-estate/article/ryovqlijf",
      },
      {
        stepLabel: "שלב 2/3",
        title: "אאורה רכשה את מגידו",
        source: "כלכליסט", date: "אפריל 2024", category: "נדל״ן וחברות ציבוריות", impact: "high",
        whyItMatters: "אאורה, חברה ציבורית בבורסה, בחרה לרכוש את היזם המקומי. רכישה כזו עוברת ועדות, דירקטוריון ובדיקות נאותות — כלומר היא משקפת אמון מוסדי בעיר ובפרויקט, לא הימור של יחיד.",
        url: "https://www.calcalist.co.il/market/article/r111cujnkc",
      },
      {
        stepLabel: "שלב 3/3",
        title: "אאורה זכתה במכרז במעלות לבניית 1,800 דירות",
        source: "מרכז הנדל״ן", date: "ינואר 2025", category: "נדל״ן והתחדשות", impact: "high",
        whyItMatters: "תשעה חודשים אחרי הרכישה, אותה חברה לקחה גם פינוי-בינוי של 1,800 דירות במעלות. שתי עסקאות גדולות בטווח זמן קצר באותה עיר — אינדיקציה ברורה להחלטה אסטרטגית להעמיק בעיר ובאזור.",
        url: "https://www.nadlancenter.co.il/article/11327",
      },
    ],
  },
  {
    title: "אוניברסיטת תל חי — מדיבורים להחלטה",
    steps: [
      {
        stepLabel: "שלב 1/2",
        title: "פגישה על הקמת אוניברסיטה בגליל",
        source: "תל חי", date: "2022", category: "חינוך ואקדמיה", impact: "medium",
        whyItMatters: "סטודנטים וסגל אקדמי הם אוכלוסייה קבועה שיוצרת ביקוש שוטף לשכירות, מסחר ושירותים. הקמת אוניברסיטה משנה את ההרכב הדמוגרפי והכלכלי של אזור שלם.",
        url: "https://www.telhai.ac.il/%D7%9E%D7%90%D7%9E%D7%A8%D7%99%D7%9D/%D7%94%D7%A7%D7%9E%D7%AA-%D7%90%D7%95%D7%A0%D7%99%D7%91%D7%A8%D7%A1%D7%99%D7%98%D7%94-%D7%91%D7%92%D7%9C%D7%99%D7%9C",
      },
      {
        stepLabel: "שלב 2/2",
        title: "570 מיליון ₪ לאוניברסיטת תל חי בגליל",
        source: "Ynet", date: "2026", category: "השקעת מדינה / אקדמיה", impact: "high",
        whyItMatters: "מה שב-2022 היה ברמה של פגישות, ב-2026 כבר תקציב מאושר של 570 מיליון ₪. זה ההבדל בין הצהרת כוונות לבין החלטת תקציב — והוא קורה בפועל באזור.",
        url: "https://www.ynet.co.il/news/article/bj6nhk6s11e",
      },
    ],
  },
];

// Standalone verified items (the growth engines), each with its investor lens.
export const GALILEE_ITEMS: GalileeItem[] = [
  {
    title: "שלושה מפעלים יועתקו לגליל — 16 מיליארד ₪",
    source: "מעריב", date: "", category: "ביטחון ותעשיות ביטחוניות", impact: "high",
    whyItMatters: "העתקת מפעלים ביטחוניים בהיקף 16 מיליארד ₪ מביאה אלפי מקומות עבודה קבועים, שכר ממוצע גבוה ותשתיות נלוות. זו אוכלוסייה עם כושר השתכרות שמייצרת ביקוש לדיור באזור.",
    url: "https://www.maariv.co.il/breaking-news/article-1289953",
  },
  {
    title: "ביקושים למגרשים גם בשיא המלחמה במעלות תרשיחא",
    source: "כלכליסט", date: "אוגוסט 2024", category: "ביקושים ונדל״ן", impact: "high",
    whyItMatters: "גם בשיא המלחמה בצפון נרשמו ביקושים אמיתיים למגרשים במעלות תרשיחא. נתון שמראה שהביקוש הבסיסי באזור עומד בלחצים, ולא נשען על שקט ביטחוני בלבד.",
    url: "https://www.calcalist.co.il/real-estate/article/bjp500py9a",
  },
  {
    title: "1.4 מיליארד ₪ לסבסוד התחדשות עירונית בצפון",
    source: "מרכז הנדל״ן", date: "יוני 2026", category: "השקעות מדינה", impact: "high",
    whyItMatters: "1.4 מיליארד ₪ סבסוד ממשלתי ייעודי להתחדשות עירונית בצפון מוזיל ליזמים את הכניסה לפרויקטים באזור. בפועל זה מאיץ אישורים, התנעת פרויקטים והיצע חדש.",
    url: "https://www.nadlancenter.co.il/article/14742",
  },
  {
    title: "2.4 מיליארד ₪ לצפון: תוכנית לאומית לפיתוח הגליל וההתיישבות",
    source: "רשויות", date: "יוני 2026", category: "השקעות מדינה", impact: "high",
    whyItMatters: "תוכנית חומש ממשלתית (2026–2030) לערי הליבה בגליל: דיור, תחבורה, תעסוקה, בריאות ותמריצים לעולים ולמשפחות צעירות. תקציבים רב-שנתיים יוצרים יציבות שמתבטאת לאורך זמן בביקוש לדיור.",
    url: "https://www.rashuiot.co.il/html5/arcLookup.taf?_function=details&_ID=76242&did=1118&G=8701&SM=8657",
  },
  {
    title: "13 מיליון ₪ לצמיחת התיירות החקלאית בגליל",
    source: "משרד החקלאות", date: "2026", category: "השקעות מדינה", impact: "medium",
    whyItMatters: "13 מיליון ₪ ייעודיים לחקלאים וליזמים בגליל להרחבת פעילות תיירותית. תיירות פנים מגדילה תנועה, מסחר ושירותים סביב הפרויקט.",
    url: "https://www.gov.il/he/pages/13_million_growth_agricultural_tourism",
  },
  {
    title: "משרד הנגב והגליל ישקיע כ-50 מיליון ₪ להסרת חסמים ופרויקטים כלכליים",
    source: "האיחוד החקלאי", date: "2026", category: "השקעות מדינה", impact: "medium",
    whyItMatters: "כ-50 מיליון ₪ ייעודיים להסרת חסמים תקציביים ולהאצת פרויקטים כלכליים בגליל ובנגב. תקציב מסוג זה ממיר תכניות 'תקועות' לפרויקטים פעילים בשטח.",
    url: "https://www.ihaklai.org.il/index.php/component/k2/item/36664",
  },
  {
    title: "לראשונה זה 35 שנה: יישוב חדש 'שיבולת' יוקם בגליל",
    source: "מקור ראשון", date: "מאי 2026", category: "התיישבות וצמיחה אזורית", impact: "high",
    whyItMatters: "אישור ממשלתי להקמת יישוב חדש בגליל לראשונה מזה 35 שנה. החלטה כזו משקפת מדיניות אקטיבית של חיזוק הצפון והרחבת ההתיישבות סביב מעלות.",
    url: "https://www.makorrishon.co.il/news/settlement/article/337244",
  },
  {
    title: "רני צים יקים מלון 250 חדרים באגם מונפורט ליד מעלות",
    source: "כלכליסט", date: "פברואר 2026", category: "תיירות ומלונאות", impact: "high",
    whyItMatters: "המלון (250 חדרים) יוקם על אגם מונפורט, בצמוד לפרויקט — בפועל סביבת ריזורט. תוכנית מתחם הנופש סביב האגם, המתפרסת על כ-370 דונם, מאושרת מ-2019 ומקודמת על ידי הרשות. כלומר סביבת מגורים תיירותית מתפתחת ולא הבטחה עתידית.",
    url: "https://www.calcalist.co.il/real-estate/article/rjqifzsowg",
  },
  {
    title: "עבודות פיתוח במשולש בן עמי",
    source: "עיריית נהריה", date: "2026", category: "תחבורה ותשתיות", impact: "medium",
    whyItMatters: "מכרזים לעבודות פיתוח שכבר יצאו לדרך — סימן שהפרויקט נמצא בשלב ביצוע ולא רק תכנון על הנייר.",
    url: "https://www.nahariya.muni.il/bids/487/",
  },
  {
    title: "יישוב חלוצי יוקם במעלות",
    source: "רשויות", date: "", category: "התיישבות וצמיחה אזורית", impact: "medium",
    whyItMatters: "יישוב חלוצי נוסף במעלות מוסיף תושבים קבועים לאזור. ככל שגדלה האוכלוסייה הסובבת, גדל גם הביקוש לשירותים, למסחר ולדיור בעיר עצמה.",
    url: "https://www.rashuiot.co.il/html5/ARCLookup.taf?_function=details&_ID=76216&did=1118&G=8657&SM=",
  },
  {
    title: "מגדל תפן — מוקד תעסוקה 10 דקות ממעלות",
    source: "ויקיפדיה", date: "", category: "תעסוקה ותעשייה", impact: "medium",
    whyItMatters: "מגדל תפן הוא אחד ממוקדי התעסוקה הגדולים בגליל המערבי, במרחק של כ-10 דקות נסיעה ממעלות. קרבה זו מספקת מענה תעסוקתי בפועל לדיירים — לא רק חזון.",
    url: "https://he.wikipedia.org/wiki/%D7%9E%D7%92%D7%93%D7%9C_%D7%AA%D7%A4%D7%9F",
  },
  {
    title: "אזור התעשייה מעלות",
    source: "ויקיפדיה", date: "", category: "תעסוקה ותעשייה", impact: "low",
    whyItMatters: "אזור תעשייה פעיל בתוך מעלות עצמה מספק מקומות עבודה בעיר ולא רק באזורים סמוכים — בסיס תעסוקתי קיים שלא תלוי בהבטחות עתידיות.",
    url: "https://he.wikipedia.org/wiki/%D7%90%D7%96%D7%95%D7%A8_%D7%94%D7%AA%D7%A2%D7%A9%D7%99%D7%99%D7%94_%D7%9E%D7%A2%D7%9C%D7%95%D7%AA",
  },
  {
    title: "מרכז אמות מעלות",
    source: "אמות", date: "", category: "מסחר ושירותים", impact: "low",
    whyItMatters: "מרכז מסחרי-תעסוקתי פעיל של חברת אמות (חברה ציבורית) בעיר. נוכחות של גוף נדל״ן מניב גדול היא אינדיקציה לכלכלה מקומית יציבה.",
    url: "https://www.amot.co.il/assets-list/industry/amot-maalot/",
  },
  {
    title: "פארק ההייטק בגליל",
    source: "YouTube", date: "", category: "הייטק וחדשנות", impact: "medium",
    whyItMatters: "פארק הייטק פעיל בגליל מוסיף שכבת תעסוקה איכותית באזור — שכר גבוה יותר מתורגם בטווח הארוך לכושר שכירות וקנייה גבוה יותר.",
    url: "https://youtu.be/ghcFanqwmqE",
  },
  {
    title: "תחבורה מתחדשת במעלות — יוני 2026",
    source: "נתיב אקספרס", date: "יוני 2026", category: "תחבורה ותשתיות", impact: "medium",
    whyItMatters: "עדכון קווי תחבורה ציבורית במעלות נכנס לתוקף ביוני 2026. שיפור נגישות לערים סובבות מרחיב את שוק העובדים והסטודנטים שיכולים להתגורר בעיר.",
    url: "https://nateevexpress.com/changes/2026/maalot/he/",
  },
];

export const GALILEE_NARRATIVE =
  "כאשר ממשלה, צבא, חברות ציבוריות ויזמים גדולים שמים יחד עשרות מיליארדים על אותה נקודה במפה — זה לא טרנד, זו מגמה. אלו אינן תחזיות; אלו החלטות שכבר התקבלו — של המדינה, של הצבא, של היזמים הגדולים בישראל.";

export const GALILEE_STATS: { value: string; label: string }[] = [
  { value: "20", label: "ידיעות שאומתו ותועדו" },
  { value: "14", label: "מקורות רשמיים וכלכליים" },
  { value: "9", label: "מהלכים בעלי השפעה ישירה על ערך הנכסים" },
  { value: "12", label: "מנועי צמיחה פעילים באזור" },
];

// Galilee cluster cities — used to pull LIVE fresh items from our own corpus,
// so the portal isn't static like the Lovable original.
export const GALILEE_CITIES = ["מעלות תרשיחא", "נהריה", "כרמיאל", "שלומי", "מעלה יוסף", "מטה אשר"];

export const IMPACT_LABEL: Record<Impact, string> = { high: "השפעה גבוהה", medium: "השפעה בינונית", low: "השפעה נמוכה" };
export const IMPACT_COLOR: Record<Impact, { bg: string; fg: string; bd: string }> = {
  high: { bg: "#fef2f2", fg: "#dc2626", bd: "#fecaca" },
  medium: { bg: "#fffbeb", fg: "#b45309", bd: "#fde68a" },
  low: { bg: "#f0f9ff", fg: "#0369a1", bd: "#bae6fd" },
};

// All distinct categories present (for the filter chips).
export function galileeCategories(): string[] {
  const set = new Set<string>();
  for (const it of GALILEE_ITEMS) set.add(it.category);
  for (const s of GALILEE_STORIES) for (const st of s.steps) set.add(st.category);
  return [...set];
}
