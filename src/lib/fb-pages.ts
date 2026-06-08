// Official Facebook pages of Galilee municipalities — verified (each linked from
// the municipality's own official website, not a residents' group). Facebook has
// no native RSS, so these are ingested via a scraper (see api/cron/fb-scan).
// All posts land in news_items as INGEST-ONLY (never scored, 0 Claude tokens).

export interface FbPage {
  city: string;
  url: string;
  region: string;
}

export const FB_MUNICIPALITY_PAGES: FbPage[] = [
  // גליל מערבי
  { city: "מעלות-תרשיחא", url: "https://www.facebook.com/maalottar/", region: "גליל מערבי" },
  { city: "נהריה", url: "https://www.facebook.com/citynahariya/", region: "גליל מערבי" },
  { city: "שלומי", url: "https://www.facebook.com/profile.php?id=100064361332500", region: "גליל מערבי" },
  { city: "מטה אשר", url: "https://www.facebook.com/matte.asher.council/", region: "גליל מערבי" },
  { city: "כרמיאל", url: "https://www.facebook.com/karmiel.il/", region: "גליל מערבי" },
  { city: "מעיליא", url: "https://www.facebook.com/mielya.local/", region: "גליל מערבי" },
  { city: "פסוטה", url: "https://www.facebook.com/fassoutaface/", region: "גליל מערבי" },
  { city: "חורפיש", url: "https://www.facebook.com/100064616867331/", region: "גליל מערבי" },
  // גליל עליון וצפון
  { city: "קריית שמונה", url: "https://www.facebook.com/109516292403835/", region: "גליל עליון" },
  { city: "צפת", url: "https://www.facebook.com/israel.zefat/", region: "גליל עליון" },
  { city: "חצור הגלילית", url: "https://www.facebook.com/hatzorhaglilit/", region: "גליל עליון" },
  { city: "מטולה", url: "https://www.facebook.com/100067145392481/", region: "גליל עליון" },
  { city: "ראש פינה", url: "https://www.facebook.com/roshpinna/", region: "גליל עליון" },
  { city: "מבואות חרמון", url: "https://www.facebook.com/mvhr.org.il/", region: "גליל עליון" },
  { city: "גליל עליון", url: "https://www.facebook.com/Regional.Council.Galil.Elyon/", region: "גליל עליון" },
  { city: "מרום הגליל", url: "https://www.facebook.com/maromhagalil/", region: "גליל עליון" },
  { city: "יסוד המעלה", url: "https://www.facebook.com/100066733152909/", region: "גליל עליון" },
  // עמקים, כנרת וגליל תחתון
  { city: "מגדל העמק", url: "https://www.facebook.com/migdalhaemeqmuni/", region: "עמקים" },
  { city: "נצרת", url: "https://www.facebook.com/Naz.muni.official/", region: "עמקים" },
  { city: "נוף הגליל", url: "https://www.facebook.com/Nof.Hagalil.City/", region: "עמקים" },
  { city: "עפולה", url: "https://www.facebook.com/afula.live/", region: "עמקים" },
  { city: "טבריה", url: "https://www.facebook.com/tiberias.municipality/", region: "כנרת" },
  { city: "יקנעם", url: "https://www.facebook.com/yoqneam.org.il/", region: "עמקים" },
  { city: "בית שאן", url: "https://www.facebook.com/Beit.Shean.Municipality/", region: "עמקים" },
  { city: "מגדל", url: "https://www.facebook.com/migdal4me/", region: "כנרת" },
  { city: "קרית טבעון", url: "https://www.facebook.com/KiryatTivonCouncil/", region: "עמקים" },
];
