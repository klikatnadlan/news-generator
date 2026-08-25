import type { RSSFeedConfig } from "./types";

// Some publishers reject any non-browser User-Agent. Used per-feed, never
// globally — the default bot UA identifies us honestly and most feeds accept it.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const RSS_FEEDS: RSSFeedConfig[] = [
  {
    // 2026-08-16: iID=2611 had gone dead — it answered 200 with an EMPTY body
    // (`<rss version="2.0" />`, 61 bytes), so the failure was invisible: no
    // error, no items, just a starved home feed. iID=607 is the live
    // "נדל״ן ותשתיות" channel (verified: 15 items, all User-Agents).
    name: "גלובס נדל״ן",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=607",
    category: "general",
  },
  // ─── כלכליסט: REMOVED 2026-08-16 — no reachable feed ───
  // https://www.calcalist.co.il/GeneralRSS/0,16335,L-8,00.xml answered 404 to our
  // bot UA and 403 to a browser UA; every variant tried (bare UA, no UA, http,
  // no-www, /integration/StoryRss8.xml, L-3856) returned 403. Calcalist content
  // still reaches us through the rss.app aggregate below ("קליקת חדשות"), which
  // supplied 78 scored כלכליסט items in the 14 days before this audit. Left here
  // as a record so nobody re-adds a dead URL.
  {
    name: "TheMarker נדל״ן",
    url: "https://www.themarker.com/cmlink/1.145",
    category: "general",
    // Measured 2026-08-16: 403 for "KlikaVault-NewsBot/1.0" AND for a
    // compat-style UA that still named us; 200 with 100 fresh items for a plain
    // browser UA. This feed is the single richest real-estate source we have,
    // so it gets the override.
    userAgent: BROWSER_UA,
  },
  {
    // Renamed 2026-08-16: this channel's own <title> is "ynet - מבזקים" — it is
    // the general news-flash feed, never a real-estate one. It was mislabelled
    // "ynet נדל״ן", which is why ynet general news dominated the scoring budget
    // (287 of 907 scored items in 14 days, most vetoed as non-real-estate).
    name: "ynet מבזקים",
    url: "https://www.ynet.co.il/Integration/StoryRss1854.xml",
    category: "general",
  },
  {
    name: "מעריב נדל״ן",
    url: "https://www.maariv.co.il/rss/nadlan",
    category: "general",
    // 2026-08-25: started answering 403 from Vercel while serving 20 items/day
    // to any User-Agent from a normal connection — the same signature TheMarker
    // showed, which a browser UA fixed. It had delivered exactly 20 items/day on
    // the 22nd, 23rd and 24th and zero on the 25th.
    userAgent: BROWSER_UA,
  },
  {
    name: 'קליקת הנדל"ן',
    url: "https://klikatnadlan.co.il/feed/",
    category: "נדל\"ן",
  },
  {
    name: "קליקת חדשות (מאוחד)",
    url: "https://rss.app/feeds/_EXSHhiSZsny9QX8x.xml",
    category: "נדל\"ן",
  },
  {
    // 2026-08-16: StoryRss6740 ("Ynet כסף") returned 200 with a ZERO-BYTE body —
    // another silent death. StoryRss6 is the live "ynet - כלכלה" channel
    // (verified: 30 items, all User-Agents).
    name: "ynet כלכלה",
    url: "https://www.ynet.co.il/Integration/StoryRss6.xml",
    category: "כלכלה",
  },
  // ─── Bizportal: REMOVED 2026-08-16 — RSS discontinued ───
  // /rss/realestate answered 404 to every UA, as did /rss, /rss.xml, /feed,
  // /feed/rss, /realestate/rss, /realestates/rss and /rss/generalnews, and the
  // section page contains no feed reference at all. Bizportal items still arrive
  // via the rss.app aggregate below. Left as a record.
  {
    // 2026-08-16: feed/6 answered 200 with a valid but EMPTY channel (no items,
    // blank title). feed/13111 is the live "עסקים כלכלה ונדל״ן" channel
    // (verified: 30 items, all User-Agents).
    name: "וואלה עסקים ונדל״ן",
    url: "https://rss.walla.co.il/feed/13111",
    category: "כלכלה",
  },

  // ─── Broad feeds (ingest-only, NOT scored — zero tokens) ───
  // General national news so cities/areas get civic coverage (employment,
  // education, security, transport, big employers like Nvidia). These enrich
  // search / city research only; they never reach the curated home/headlines.
  { name: "ynet בארץ", url: "https://www.ynet.co.il/Integration/StoryRss2.xml", category: "כללי", ingestOnly: true },
  { name: "וואלה חדשות", url: "https://rss.walla.co.il/feed/1", category: "כללי", ingestOnly: true },
  { name: "מעריב חדשות", url: "https://www.maariv.co.il/Rss/RssChadashot", category: "כללי", ingestOnly: true },
  { name: "גלובס חדשות", url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=1725", category: "כללי", ingestOnly: true },
  { name: "דבר", url: "https://www.davar1.co.il/feed/", category: "כללי", ingestOnly: true },

  // ─── Local news + regional מקומונים (ingest-only, NOT scored — 0 tokens) ───
  // 90 validated feeds across all regions: fills civic/area coverage for small
  // cities + neighborhoods so city research / dossier / internal search get rich.
  { name: "בית שמש חדשות", url: "https://www.bsnews.co.il/rss.xml", category: "מקומי", ingestOnly: true },
  { name: "נטו העמקים והגליל / עפולה נאו", url: "https://www.afulanow.com/rss.xml", category: "מקומי", ingestOnly: true },
  { name: "ניוז חיפה והקריות", url: "https://newshaifakrayot.net/?feed=rss2", category: "מקומי", ingestOnly: true },
  { name: "NWS — חדשות חיפה והסביבה", url: "https://nws.report/feed/", category: "מקומי", ingestOnly: true },
  { name: "כל רגע", url: "https://www.kore.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "HKN — חדשות חיפה והקריות", url: "https://hkn.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "השרון הצפוני NHN", url: "https://nhn.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "ON LINE גליל מערבי", url: "https://www.gmaaravionline.com/feed/", category: "מקומי", ingestOnly: true },
  { name: "מגזין נטו", url: "https://www.netobatyam.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדשות באר שבע", url: "https://beer7news.com/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדש בגליל", url: "https://g-news.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "גו אייטם", url: "https://goitem.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מכל מקום", url: "https://mikolmakom.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "גל גפן", url: "https://gal-gefen.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "נתניה און ליין", url: "https://www.ksn.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מגדלור ניוז", url: "https://www.migdalor-news.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "כוכב הצפון (Star10) - מקומון טבריה וסובב", url: "https://www.star10.co.il/blog-feed.xml", category: "מקומי", ingestOnly: true },
  { name: "כלבו חיפה והקריות", url: "https://www.colbonews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "צומת השרון כפר סבא", url: "https://www.tzomet-kfs.co.il/feed", category: "מקומי", ingestOnly: true },
  { name: "צומת השרון הרצליה", url: "https://www.tzomet-hrz.co.il/feed", category: "מקומי", ingestOnly: true },
  { name: "צומת השרון רעננה", url: "https://www.tzomet-ran.co.il/feed", category: "מקומי", ingestOnly: true },
  { name: "כאן דרום - אשדוד", url: "https://www.kan-ashdod.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "כאן דרום - אשקלון", url: "https://www.kan-ashkelon.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדשות אפס שמונה 08", url: "https://www.news08.net/feed/", category: "מקומי", ingestOnly: true },
  { name: "אשדודי", url: "https://ashdodi.com/feed/", category: "מקומי", ingestOnly: true },
  { name: "אשקלון ניוז", url: "https://ashkelon.news/rss/news", category: "מקומי", ingestOnly: true },
  { name: "רחובות ניוז", url: "https://rehovot.news/feed/", category: "מקומי", ingestOnly: true },
  { name: "בראש החדשות — טירת כרמל", url: "https://www.tcnews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מיטב - חדשות בית שמש", url: "https://rbs-news.com/feed/", category: "מקומי", ingestOnly: true },
  { name: "בלינקר", url: "https://blinker.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "צפון-1 כרמיאל / גליל מערבי", url: "https://blinker.co.il/category/%D7%92%D7%9C%D7%99%D7%9C-%D7%9E%D7%A2%D7%A8%D7%91%D7%99/feed/", category: "מקומי", ingestOnly: true },
  { name: "קול הגליל", url: "https://kol-hagalil.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "קול מעלות", url: "https://kol-maalot.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חי פֹּה — תאגיד החדשות של חיפה והסביבה", url: "https://haipo.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט חיפה והקריות", url: "https://www.haifa-city.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "קול החוף", url: "https://hoff.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "העיר NEWS — חדרה, פרדס חנה-כרכור, זכרון ", url: "https://citynews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "גפן — מגזין המושבות", url: "https://www.gfn.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדשות עפולה", url: "https://www.afulanews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "עמקניוז", url: "https://emeknews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "YCOM - חדשות מקומיות", url: "https://ycom.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדשות טבריה", url: "https://www.tiberiasnews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "צפת.נט", url: "https://zefat.net/feed/", category: "מקומי", ingestOnly: true },
  { name: "בית שאן - ארץ המעיינות", url: "https://bet-shean.org.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט השרון", url: "https://inhasharon.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "שרון אונליין", url: "https://sharonline.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "קול כפר סבא", url: "https://kfarsabanews.com/feed", category: "מקומי", ingestOnly: true },
  { name: "רעננה ניוז", url: "https://raanana.news/feed/", category: "מקומי", ingestOnly: true },
  { name: "הוד השרון ניוז", url: "https://hodhasharon.news/feed/", category: "מקומי", ingestOnly: true },
  { name: "ירוק - רשת מקומונים בשרון", url: "https://hoha.co.il/?feed=rss2", category: "מקומי", ingestOnly: true },
  { name: "רחובות בשבילנו", url: "https://rehovot.org.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט רמת גן", url: "https://www.rmgcity.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט גבעתיים", url: "https://rgcity.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "רמת גן גבעתיים NEWS", url: "https://www.rgg-news.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "רמת גן גבעתיים אונליין", url: "https://rgonline.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט בת ים חולון", url: "https://bhcity.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט רמלה לוד", url: "https://ramla-st.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "שישי בעיר", url: "https://shishi-bair.co.il/?feed=rss2", category: "מקומי", ingestOnly: true },
  { name: "מקומונט תל אביב", url: "https://tlife.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומון ראשון", url: "https://mekomonrishon.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "פתח תקוואי", url: "https://petachtikva.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "פתח תקווה NEWS", url: "https://www.ptnews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מודיעין אונליין", url: "https://modiinonline.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדשות מודיעין", url: "https://www.hadshot-modiin.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מודיעין ניוז", url: "http://mnews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט ירושלים", url: "https://jcity.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "JNEWS חדשות ירושלים", url: "https://jerusalemnews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "RBSN חדשות בית שמש", url: "https://rbsn.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדשות העיר בית שמש", url: "https://city-news-bs.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "ביתר 24 - חדשות ביתר עילית", url: "https://beitar24.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט דרום", url: "https://dcity.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדשות אשדוד - אשדוד10", url: "https://ashdod10.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "שדרונט", url: "https://sderonet.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "נתיבותי", url: "https://netivoti.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "קבוצת עיתוני מה נשמע", url: "https://manishma.news/feed/", category: "מקומי", ingestOnly: true },
  { name: "פורטל חדשות תל אביב TLVCT", url: "https://tlvct.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "TGspot", url: "https://www.tgspot.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "ראשון ניוז", url: "https://www.rishon.news/feed/", category: "מקומי", ingestOnly: true },
  { name: "אשקלנייעס", url: "https://ashkelnayes.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "אונו ניוז", url: "https://ononews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט הישובים ביו'ש", url: "https://www.tcity.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "חדשות מודיעין דתי", url: "https://datilim.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "מקומונט אשדוד", url: "https://ashdodnews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "סוגרים שבוע", url: "https://sogrimshavua.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "בת ים NEWS", url: "https://www.b-hnews.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "השבוע בנתניה / רשת מקומונים בשרון", url: "https://israelnow.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "השבועון פתח תקווה", url: "https://shavuon.co.il/?feed=rss2", category: "מקומי", ingestOnly: true },
  { name: "הד העיר", url: "https://hed-haeer.co.il/?feed=rss2", category: "מקומי", ingestOnly: true },
  { name: "חדשות הגליל - News8", url: "https://news8.co.il/feed/", category: "מקומי", ingestOnly: true },
  { name: "הצפון", url: "https://www.hatzafon.co.il/feed/", category: "מקומי", ingestOnly: true },
];
