// Official Facebook pages of Galilee municipalities — verified (each linked from
// the municipality's own official website, not a residents' group). Facebook has
// no native RSS, so these are ingested via a scraper (see api/cron/fb-scan).
// All posts land in news_items as INGEST-ONLY (never scored, 0 Claude tokens).

export interface FbPage {
  city: string;
  url: string;
  region: string;
  kind?: "עירייה" | "ראש העיר"; // default: עירייה (official municipality page)
  name?: string; // mayor display name, e.g. "מוטי בן דוד"
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

  // ראשי הערים / ראשי המועצות של הגליל (עמודים אישיים/רשמיים)
  { city: "מעלות-תרשיחא", url: "https://www.facebook.com/BenDavidMotty/", region: "גליל מערבי", kind: "ראש העיר", name: "מוטי בן דוד" },
  { city: "נהריה", url: "https://www.facebook.com/MarellyRonen/", region: "גליל מערבי", kind: "ראש העיר", name: "רונן מרלי" },
  { city: "שלומי", url: "https://www.facebook.com/gbry.l.n.mn/", region: "גליל מערבי", kind: "ראש העיר", name: "גבי נעמן" },
  { city: "מטה אשר", url: "https://www.facebook.com/100063663338662/", region: "גליל מערבי", kind: "ראש העיר", name: "משה דוידוביץ" },
  { city: "כרמיאל", url: "https://www.facebook.com/moshekoninsky/", region: "גליל מערבי", kind: "ראש העיר", name: "משה קונינסקי" },
  { city: "מעיליא", url: "https://www.facebook.com/Elia.Abed.miilya/", region: "גליל מערבי", kind: "ראש העיר", name: "איליא עבד" },
  { city: "חורפיש", url: "https://www.facebook.com/61550832154970/", region: "גליל מערבי", kind: "ראש העיר", name: "אנוור עאמר" },
  { city: "קריית שמונה", url: "https://www.facebook.com/avihay.shteren.adv/", region: "גליל עליון", kind: "ראש העיר", name: "אביחי שטרן" },
  { city: "צפת", url: "https://www.facebook.com/kakonyosi/", region: "גליל עליון", kind: "ראש העיר", name: "יוסי קקון" },
  { city: "חצור הגלילית", url: "https://www.facebook.com/michaelkabesa2018/", region: "גליל עליון", kind: "ראש העיר", name: "מיכאל קבסה" },
  { city: "מטולה", url: "https://www.facebook.com/metulamoshava/", region: "גליל עליון", kind: "ראש העיר", name: "דוד אזולאי" },
  { city: "ראש פינה", url: "https://www.facebook.com/MotiHatiel/", region: "גליל עליון", kind: "ראש העיר", name: "מוטי חטיאל" },
  { city: "מבואות חרמון (מ.א)", url: "https://www.facebook.com/ben.benmuvhar/", region: "גליל עליון", kind: "ראש העיר", name: "בני בן-מובחר" },
  { city: "הגליל העליון (מ.א)", url: "https://www.facebook.com/langasaf/", region: "גליל", kind: "ראש העיר", name: "אסף לנגלבן" },
  { city: "מרום הגליל (מ.א)", url: "https://www.facebook.com/AMITSOFER2018/", region: "גליל עליון", kind: "ראש העיר", name: "עמית סופר" },
  { city: "יסוד המעלה", url: "https://www.facebook.com/sh.tamirs/", region: "גליל עליון", kind: "ראש העיר", name: "תמיר שלום" },
  { city: "מגדל העמק", url: "https://www.facebook.com/yakibenhaim1/", region: "עמקים", kind: "ראש העיר", name: "יקי בן חיים" },
  { city: "עפולה", url: "https://www.facebook.com/avielkabetz.afula1/", region: "עמקים", kind: "ראש העיר", name: "אבי אלקבץ" },
  { city: "טבריה", url: "https://www.facebook.com/ywsy.nb.h/", region: "כנרת", kind: "ראש העיר", name: "יוסי נבעה" },
  { city: "יקנעם", url: "https://www.facebook.com/Yokneam1/", region: "עמקים", kind: "ראש העיר", name: "רומן פרס" },
  { city: "בית שאן", url: "https://www.facebook.com/100010005789305/", region: "עמקים", kind: "ראש העיר", name: "נועם ג'ומעה" },
  { city: "מגדל", url: "https://www.facebook.com/100034967678001/", region: "כנרת", kind: "ראש העיר", name: "נתנאל אלפסי" },
  { city: "קרית טבעון", url: "https://www.facebook.com/IdoGrinblum4Tivon/", region: "עמקים", kind: "ראש העיר", name: "עידו גרינבלום" },
];
