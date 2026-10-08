/**
 * Link zum Lieferanten-Angebot. Demo-Angebote haben erfundene Artikelnummern – ihr Link führte auf eine
 * 404-Seite. Für sie gibt es stattdessen die Suche nach dem Keyword beim selben Anbieter.
 */
export interface OfferLink {
  url: string;
  /** „Angebot“ bzw. „Ähnliche suchen“ */
  label: string;
  demo: boolean;
}

const SEARCH_URL: Record<string, (q: string) => string> = {
  aliexpress: (q) => `https://www.aliexpress.com/wholesale?SearchText=${q}`,
  // 1688 sucht mit chinesischen Begriffen; ein deutsches Keyword findet dort selten etwas, die Seite existiert aber.
  "alibaba-1688": (q) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${q}`,
};

export function offerLink(product: { source: string; url: string }, sourceModes: unknown, keyword: string): OfferLink | null {
  const demo = (sourceModes as Record<string, string> | null)?.[product.source] === "mock";
  if (!demo) return { url: product.url, label: "Angebot", demo: false };
  const search = SEARCH_URL[product.source];
  return search ? { url: search(encodeURIComponent(keyword)), label: "Ähnliche suchen", demo: true } : null;
}
