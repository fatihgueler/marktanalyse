/**
 * Vorschläge für den Rückblick-Test: Produkte, die in DACH in den letzten Jahren durchgestartet sind,
 * plus Kontrollen, bei denen der Radar NICHT anschlagen sollte (oder nur saisonal).
 * ANNAHME: Zeiträume aus dem Gedächtnis, nicht geprüft – den genauen Höhepunkt liest der Test aus der CSV.
 */
export interface BacktestSuggestion {
  term: string;
  group: "Figuren & Sammeln" | "Beauty" | "Haushalt & Gadgets" | "Hypes außerhalb des Sortiments" | "Kontrolle";
  /** ungefährer Höhepunkt, nur zur Orientierung */
  approxPeak: string;
  note: string;
}

export const BACKTEST_SUGGESTIONS: BacktestSuggestion[] = [
  { term: "Labubu", group: "Figuren & Sammeln", approxPeak: "Sommer 2025", note: "Pop-Mart-Figur aus China, der Ostasien-Hype schlechthin" },
  { term: "Sonny Angel", group: "Figuren & Sammeln", approxPeak: "2024", note: "japanische Sammelfiguren, Blindbox" },
  { term: "Smiski", group: "Figuren & Sammeln", approxPeak: "2024", note: "japanische Leuchtfiguren, Blindbox" },
  { term: "Blindbox", group: "Figuren & Sammeln", approxPeak: "2025", note: "Oberbegriff, zeigt, ob der Radar die Welle allgemein erkennt" },
  { term: "Taschenanhänger", group: "Figuren & Sammeln", approxPeak: "2025", note: "Bag Charms, im Sog von Labubu" },
  { term: "LED Maske", group: "Beauty", approxPeak: "2024–2025", note: "Lichttherapie-Maske, meist aus China" },
  { term: "Lip Oil", group: "Beauty", approxPeak: "2024", note: "Lippenöl, TikTok-Beauty" },
  { term: "Haarwachs Stick", group: "Beauty", approxPeak: "2023", note: "Hair Wax Stick, klassischer AliExpress-Viralartikel" },
  { term: "Airfryer Silikonform", group: "Haushalt & Gadgets", approxPeak: "2023", note: "Zubehör im Heißluftfritteusen-Boom" },
  { term: "Mini Thermodrucker", group: "Haushalt & Gadgets", approxPeak: "2023–2024", note: "Sticker- und Notizdrucker, auch im Demo-Katalog" },
  { term: "Stanley Becher", group: "Haushalt & Gadgets", approxPeak: "Winter 2023/24", note: "Marke, aber eindeutiger Trinkbecher-Hype" },
  { term: "Matcha Besen", group: "Haushalt & Gadgets", approxPeak: "2025", note: "Zubehör im Matcha-Boom" },
  { term: "Pickleball Schläger", group: "Haushalt & Gadgets", approxPeak: "2024–2025", note: "Sporttrend aus den USA, Schläger oft aus China" },
  { term: "Dubai Schokolade", group: "Hypes außerhalb des Sortiments", approxPeak: "Ende 2024", note: "extrem schneller DACH-Hype, guter Härtetest" },
  { term: "Pistaziencreme", group: "Hypes außerhalb des Sortiments", approxPeak: "2024–2025", note: "Folgetrend der Dubai-Schokolade" },
  { term: "Stitch Plüsch", group: "Hypes außerhalb des Sortiments", approxPeak: "2025", note: "filmgetrieben (Kinostart Mai 2025)" },
  { term: "Eisbad Tonne", group: "Hypes außerhalb des Sortiments", approxPeak: "2023–2024", note: "Cold-Plunge-Welle" },
  { term: "Powerbank", group: "Kontrolle", approxPeak: "gleichbleibend", note: "Dauerbrenner – hier sollte kein Signal kommen" },
  { term: "Adventskalender", group: "Kontrolle", approxPeak: "jedes Jahr im Herbst", note: "Saisonware – zeigt, ob der Radar jeden Herbst anschlägt" },
  { term: "Nackenventilator", group: "Kontrolle", approxPeak: "jeden Sommer", note: "Saisonware mit Hitzewellen-Spitzen" },
];

/** Google Trends: Deutschland, letzte 5 Jahre (Wochenwerte) – von dort die CSV herunterladen. */
export function trendsExploreUrl(term: string): string {
  return `https://trends.google.de/trends/explore?date=today%205-y&geo=DE&q=${encodeURIComponent(term)}&hl=de`;
}
