// ─── Geo-tagging: detect area from news title/summary ───

const AREA_KEYWORDS: Record<string, string[]> = {
  "תל אביב": ["תל אביב", "ת\"א", "גוש דן", "רמת גן", "גבעתיים", "בני ברק", "חולון", "בת ים"],
  "מרכז": ["פתח תקווה", "ראשון לציון", "ראשל\"צ", "נתניה", "הרצליה", "כפר סבא", "רעננה", "הוד השרון", "רחובות", "נס ציונה", "לוד", "רמלה", "מודיעין", "שרון"],
  "ירושלים": ["ירושלים", "בית שמש", "מעלה אדומים"],
  "חיפה והצפון": ["חיפה", "קריות", "עכו", "נהריה", "כרמיאל", "נצרת", "עפולה", "טבריה", "צפון"],
  "דרום": ["באר שבע", "אשדוד", "אשקלון", "נגב", "דימונה", "ערד", "דרום"],
  "שרון": ["נתניה", "חדרה", "שרון", "השרון"],
  "שפלה": ["שפלה", "רחובות", "נס ציונה", "גדרה", "יבנה"],
  "ארצי": [], // default
};

export function detectAreas(title: string, summary?: string): string[] {
  const text = `${title} ${summary || ""}`.toLowerCase();
  const detected: string[] = [];

  for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (area === "ארצי") continue;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        if (!detected.includes(area)) {
          detected.push(area);
        }
        break;
      }
    }
  }

  // If no area detected, it's national news
  if (detected.length === 0) {
    detected.push("ארצי");
  }

  return detected;
}

export function filterNewsByArea(
  news: Array<{ title: string; summary?: string; [key: string]: unknown }>,
  selectedAreas: string[]
): typeof news {
  if (selectedAreas.length === 0) return news;

  return news.filter((item) => {
    const areas = detectAreas(item.title, item.summary as string);
    // Always include national news
    if (areas.includes("ארצי")) return true;
    // Include if any detected area matches selected areas
    return areas.some((a) => selectedAreas.includes(a));
  });
}

export const AVAILABLE_AREAS = Object.keys(AREA_KEYWORDS);
