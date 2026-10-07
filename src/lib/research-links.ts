import type { Country } from "@/config/radar.config";

export interface ResearchLink {
  label: string;
  url: string;
  /** true, wenn die Seite keinen Suchbegriff per Link annimmt – dann muss er dort eingegeben werden */
  manualQuery: boolean;
}

const AMAZON: Record<Country, string> = { DE: "amazon.de", AT: "amazon.de", CH: "amazon.de", GB: "amazon.co.uk" };
const EBAY: Record<Country, string> = { DE: "ebay.de", AT: "ebay.at", CH: "ebay.ch", GB: "ebay.co.uk" };

/**
 * Such-Links zu einem Produktnamen. Es werden nur Links gebaut – der Radar ruft keine dieser Seiten selbst auf.
 * ANNAHME: Die Parameter entsprechen dem Stand Oktober 2026; die Anbieter können sie jederzeit ändern.
 */
export function researchLinks(name: string, country: Country): ResearchLink[] {
  const q = encodeURIComponent(name.trim());
  return [
    { label: "Google Trends", url: `https://trends.google.com/trends/explore?date=today%2012-m&geo=${country}&q=${q}&hl=de`, manualQuery: false },
    // Das Creative Center nimmt keinen Suchbegriff per Link an
    { label: "TikTok Creative Center", url: `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/de?period=30&region=${country}`, manualQuery: true },
    {
      label: "Meta-Werbebibliothek",
      url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${q}&search_type=keyword_unordered&media_type=all`,
      manualQuery: false,
    },
    // ANNAHME: query_type=0 sucht nach Stichwort; TikTok zeigt nur Anzeigen aus der EU (für CH/GB: DE)
    {
      label: "TikTok-Werbebibliothek",
      url: `https://library.tiktok.com/ads?region=${country === "AT" ? "AT" : "DE"}&adv_name=${q}&query_type=0&sort_type=last_shown_date,desc`,
      manualQuery: false,
    },
    { label: "Amazon Movers & Shakers", url: `https://www.${AMAZON[country]}/gp/movers-and-shakers`, manualQuery: true },
    { label: "AliExpress", url: `https://www.aliexpress.com/wholesale?SearchText=${q}`, manualQuery: false },
    // Die 1688-Bildersuche braucht ein hochgeladenes Produktbild
    { label: "1688-Bildersuche", url: "https://s.1688.com/youyuan/index.htm?tab=imageSearch", manualQuery: true },
    { label: "eBay verkauft", url: `https://www.${EBAY[country]}/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`, manualQuery: false },
  ];
}
