/**
 * Zentrale Konfiguration des Trend-Radars.
 *
 * ALLE Gewichte, Steuersätze, Zoll- und Versandannahmen, Wechselkurse, Seeds
 * und Limits stehen hier – nirgends sonst im Code. Eine Änderung hier ändert
 * die `configVersion` des nächsten Laufs, damit alte Scores nachvollziehbar bleiben.
 */

export type Country = "DE" | "AT" | "CH" | "GB";
export type Currency = "EUR" | "CHF" | "GBP";
export type VatMode = "kleinunternehmer" | "regelbesteuert";

export const COUNTRIES: readonly Country[] = ["DE", "AT", "CH", "GB"];

export const CATEGORY_IDS = [
  "beleuchtung",
  "wohnen-deko",
  "kueche-haushalt",
  "beauty-pflege",
  "technik-gadgets",
  "handy-zubehoer",
  "spielzeug-fun",
  "sport-outdoor",
  "haustier",
  "mode-accessoires",
  "buero-schreibwaren",
  "sonstiges",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface CountryProfile {
  label: string;
  currency: Currency;
  /** Google-Trends-/Shopping-Parameter */
  serpGeo: string;
  serpLanguage: string;
  /** AliExpress-Parameter */
  aliexpressShipTo: string;
  aliexpressLanguage: string;
}

export interface CountryTax {
  /** Umsatzsteuer-/Einfuhrumsatzsteuer-Satz des Ziellandes */
  vatRate: number;
  /**
   * Muss nexana beim Verkauf in dieses Land USt abführen?
   * - "followVatMode": hängt von `tax.vatMode` ab (DE-Kleinunternehmerregelung)
   * - "always": immer (z. B. UK für ausländische Händler)
   * - "never": nie (z. B. CH unter der Registrierungsschwelle)
   */
  saleVat: "followVatMode" | "always" | "never";
  /** Einfuhrumsatzsteuer wird nicht erhoben, wenn der Betrag darunter liegt (Landeswährung) */
  importVatMinimum: number;
  /**
   * Unterhalb dieses Warenwerts (Landeswährung) wird keine Einfuhr-USt erhoben,
   * weil sie beim Verkauf abgeführt wird (UK-Regel ≤ 135 £). null = gilt nicht.
   */
  importVatCollectedAtSaleBelow: number | null;
}

export interface CountryCustoms {
  /** Warenwert-Grenze für Kleinsendungen (Landeswährung) */
  lowValueThreshold: number;
  /** Regel unterhalb der Grenze */
  lowValueRule: { type: "flatPerItem"; amount: number } | { type: "none" };
  /** Welche Zollsatz-Spalte aus `categories` gilt */
  tariffZone: "EU" | "GB" | "CH";
  /** Pauschale Abfertigungsgebühr je Artikel, wenn Abgaben anfallen (Landeswährung) */
  clearanceFeePerItem: number;
}

export interface CategoryConfig {
  label: string;
  /** Zollsätze nach Zone (Anteil, 0.027 = 2,7 %) */
  dutyRate: { EU: number; GB: number; CH: number };
  /** Referenzpreis-Fallback: typischer Endkundenpreis = Einkaufspreis × Faktor */
  retailMultiplier: number;
  /** Schlüsselwörter für die Heuristik-Kategorisierung (Mock-Modus ohne Claude) */
  keywords: string[];
}

export const radarConfig = {
  countries: {
    DE: { label: "Deutschland", currency: "EUR", serpGeo: "DE", serpLanguage: "de", aliexpressShipTo: "DE", aliexpressLanguage: "DE" },
    AT: { label: "Österreich", currency: "EUR", serpGeo: "AT", serpLanguage: "de", aliexpressShipTo: "AT", aliexpressLanguage: "DE" },
    CH: { label: "Schweiz", currency: "CHF", serpGeo: "CH", serpLanguage: "de", aliexpressShipTo: "CH", aliexpressLanguage: "DE" },
    GB: { label: "Vereinigtes Königreich", currency: "GBP", serpGeo: "GB", serpLanguage: "en", aliexpressShipTo: "UK", aliexpressLanguage: "EN" },
  } satisfies Record<Country, CountryProfile>,

  /**
   * Wechselkurse: Einheiten der Währung pro 1 EUR.
   * ANNAHME: feste Kurse Stand September 2026 (gerundet), regelmäßig manuell pflegen.
   */
  fx: { EUR: 1, CHF: 0.94, GBP: 0.86 } satisfies Record<Currency, number>,

  demand: {
    /**
     * Seed-Begriffe für die Suche nach steigenden Keywords („rising related queries“).
     * ANNAHME: breite Produktbegriffe aus nexanas Sortimentsrichtung (Gadgets, Deko, Küche, Beauty).
     */
    seeds: {
      DE: ["gadget", "lampe", "küchenhelfer", "deko", "led", "geschenkidee", "tiktok produkt", "beauty tool"],
      AT: ["gadget", "lampe", "küchenhelfer", "deko", "led", "geschenkidee"],
      CH: ["gadget", "lampe", "küchenhelfer", "deko", "led", "geschenkidee"],
      GB: ["gadget", "lamp", "kitchen gadget", "home decor", "led", "gift idea", "tiktok made me buy it", "beauty tool"],
    } satisfies Record<Country, string[]>,
    /** Kostenkontrolle SerpApi: je Seed 1 Request, je Keyword 1 Request */
    maxSeedsPerCountry: 8,
    maxKeywordsPerCountry: 25,
    /** Zeitraum der Zeitreihe (SerpApi `date`) */
    seriesTimeframe: "today 12-m",
    discoveryTimeframe: "today 3-m",
  },

  supply: {
    /** Anzahl AliExpress-Treffer je Keyword/Land */
    resultsPerKeyword: 8,
    /** Nur Keywords mit Trend-Score ≥ diesem Wert werden auf der Angebotsseite gesucht */
    minTrendScoreForSupply: 0.2,
  },

  matching: {
    /** Paare darunter werden nicht gescort */
    minRelevance: 0.5,
    /** Obergrenze Ausgabe-Tokens pro Claude-Request (Klassifikation von bis zu 8 Produkten) */
    maxOutputTokens: 4000,
    /** Synonyme für die Heuristik (Keyword-Token → Titel-Token), DE ↔ EN */
    synonyms: {
      lampe: ["lamp", "light", "licht", "leuchte"],
      licht: ["light", "lamp", "lampe"],
      nachtlicht: ["night", "light", "lamp"],
      sonnenuntergang: ["sunset"],
      wolke: ["cloud"],
      wolken: ["cloud"],
      mond: ["moon"],
      sternenhimmel: ["star", "galaxy", "projector"],
      projektor: ["projector"],
      astronaut: ["astronaut"],
      mini: ["mini", "small", "portable"],
      tragbar: ["portable"],
      waffeleisen: ["waffle", "maker"],
      eisroller: ["ice", "roller"],
      gesicht: ["face", "facial"],
      massage: ["massage", "massager"],
      pistole: ["gun"],
      halterung: ["holder", "mount", "stand"],
      handy: ["phone"],
      magnetisch: ["magnetic", "magsafe"],
      powerbank: ["power", "bank"],
      ventilator: ["fan"],
      nacken: ["neck"],
      wasserkocher: ["kettle"],
      faltbar: ["foldable", "folding", "collapsible"],
      mixer: ["blender"],
      reinigung: ["cleaning", "cleaner"],
      buerste: ["brush"],
      bürste: ["brush"],
      katze: ["cat"],
      hund: ["dog"],
      spielzeug: ["toy"],
      tasche: ["bag"],
      kerze: ["candle"],
      aufbewahrung: ["storage", "organizer"],
      schreibtisch: ["desk"],
      tastatur: ["keyboard"],
      flasche: ["bottle"],
    } as Record<string, string[]>,
  },

  categories: {
    // ANNAHME: Zollsätze sind gerundete Richtwerte typischer Tarifnummern (EU-TARIC, UK Global Tariff).
    // Für echte Kalkulationen je Produkt die exakte Tarifnummer prüfen.
    // Schweiz: Industriezölle seit 01.01.2024 abgeschafft → 0.
    beleuchtung: { label: "Beleuchtung", dutyRate: { EU: 0.047, GB: 0.02, CH: 0 }, retailMultiplier: 3.2, keywords: ["lamp", "lampe", "light", "licht", "led", "leuchte", "projector", "projektor", "sunset", "neon"] },
    "wohnen-deko": { label: "Wohnen & Deko", dutyRate: { EU: 0.065, GB: 0.06, CH: 0 }, retailMultiplier: 3.0, keywords: ["deko", "decor", "vase", "kerze", "candle", "poster", "spiegel", "mirror", "pflanze", "plant", "aufbewahrung", "storage", "organizer"] },
    "kueche-haushalt": { label: "Küche & Haushalt", dutyRate: { EU: 0.027, GB: 0.02, CH: 0 }, retailMultiplier: 2.8, keywords: ["küche", "kueche", "kitchen", "waffle", "waffel", "kettle", "wasserkocher", "blender", "mixer", "reinigung", "cleaning", "haushalt", "flasche", "bottle"] },
    "beauty-pflege": { label: "Beauty & Pflege", dutyRate: { EU: 0.027, GB: 0.02, CH: 0 }, retailMultiplier: 3.5, keywords: ["beauty", "face", "gesicht", "facial", "roller", "massage", "skin", "haut", "hair", "haar", "nagel", "nail", "gua sha"] },
    "technik-gadgets": { label: "Technik & Gadgets", dutyRate: { EU: 0.0, GB: 0.0, CH: 0 }, retailMultiplier: 2.6, keywords: ["gadget", "usb", "bluetooth", "powerbank", "power bank", "fan", "ventilator", "speaker", "lautsprecher", "keyboard", "tastatur", "smart"] },
    "handy-zubehoer": { label: "Handy-Zubehör", dutyRate: { EU: 0.027, GB: 0.02, CH: 0 }, retailMultiplier: 3.5, keywords: ["phone", "handy", "magsafe", "halterung", "holder", "case", "hülle", "charger", "ladegerät"] },
    "spielzeug-fun": { label: "Spielzeug & Fun", dutyRate: { EU: 0.0, GB: 0.0, CH: 0 }, retailMultiplier: 3.0, keywords: ["toy", "spielzeug", "squishy", "fidget", "plush", "plüsch", "puzzle", "game", "spiel"] },
    "sport-outdoor": { label: "Sport & Outdoor", dutyRate: { EU: 0.027, GB: 0.02, CH: 0 }, retailMultiplier: 2.8, keywords: ["sport", "fitness", "yoga", "outdoor", "camping", "bike", "fahrrad", "massage gun", "massagepistole"] },
    haustier: { label: "Haustier", dutyRate: { EU: 0.027, GB: 0.02, CH: 0 }, retailMultiplier: 3.0, keywords: ["cat", "katze", "dog", "hund", "pet", "haustier"] },
    "mode-accessoires": { label: "Mode & Accessoires", dutyRate: { EU: 0.12, GB: 0.12, CH: 0 }, retailMultiplier: 3.5, keywords: ["bag", "tasche", "schmuck", "jewelry", "ring", "kette", "necklace", "cap", "mütze", "socken"] },
    "buero-schreibwaren": { label: "Büro & Schreibwaren", dutyRate: { EU: 0.065, GB: 0.06, CH: 0 }, retailMultiplier: 3.0, keywords: ["desk", "schreibtisch", "büro", "office", "stift", "pen", "notizbuch", "notebook"] },
    sonstiges: { label: "Sonstiges", dutyRate: { EU: 0.04, GB: 0.04, CH: 0 }, retailMultiplier: 2.8, keywords: [] },
  } satisfies Record<CategoryId, CategoryConfig>,

  tax: {
    /**
     * Steuerstatus von nexana.
     * "kleinunternehmer": keine USt auf Verkäufe, EUSt ist echter Kostenfaktor.
     * "regelbesteuert": USt auf Verkäufe, EUSt als Vorsteuer abziehbar.
     * Umstellen, sobald nexana die Kleinunternehmergrenze überschreitet.
     */
    vatMode: "kleinunternehmer" as VatMode,
    countries: {
      DE: { vatRate: 0.19, saleVat: "followVatMode", importVatMinimum: 0, importVatCollectedAtSaleBelow: null },
      // ANNAHME: EU-Fernverkäufe insgesamt unter 10.000 €/Jahr → deutsche Kleinunternehmerregel gilt auch für AT.
      AT: { vatRate: 0.2, saleVat: "followVatMode", importVatMinimum: 0, importVatCollectedAtSaleBelow: null },
      // ANNAHME: Schweizer Umsatz unter CHF 100.000 → keine Registrierungspflicht; EUSt < CHF 5 wird nicht erhoben.
      CH: { vatRate: 0.081, saleVat: "never", importVatMinimum: 5, importVatCollectedAtSaleBelow: null },
      // ANNAHME: Ausländische Händler müssen UK-VAT immer abführen (keine Kleinunternehmergrenze für Non-Established Taxable Persons);
      // Sendungen ≤ 135 £: VAT beim Verkauf statt bei der Einfuhr.
      GB: { vatRate: 0.2, saleVat: "always", importVatMinimum: 0, importVatCollectedAtSaleBelow: 135 },
    } satisfies Record<Country, CountryTax>,
  },

  customs: {
    // ANNAHME: Einzelversand je Artikel direkt an Endkunden (Zollwert = Einkauf + Versand eines Stücks).
    // ANNAHME: EU erhebt seit 01.07.2026 auf Kleinsendungen < 150 € eine Pauschale von 3 € je Artikel statt Zollfreiheit.
    DE: { lowValueThreshold: 150, lowValueRule: { type: "flatPerItem", amount: 3 }, tariffZone: "EU", clearanceFeePerItem: 0 },
    AT: { lowValueThreshold: 150, lowValueRule: { type: "flatPerItem", amount: 3 }, tariffZone: "EU", clearanceFeePerItem: 0 },
    // ANNAHME: Schweiz – keine Industriezölle; Abfertigungsgebühr des Paketdienstes nur, wenn EUSt anfällt.
    CH: { lowValueThreshold: 0, lowValueRule: { type: "none" }, tariffZone: "CH", clearanceFeePerItem: 5 },
    // ANNAHME: UK – Sendungen ≤ 135 £ zollfrei.
    GB: { lowValueThreshold: 135, lowValueRule: { type: "none" }, tariffZone: "GB", clearanceFeePerItem: 0 },
  } satisfies Record<Country, CountryCustoms>,

  shipping: {
    /**
     * Versandkosten China → Endkunde je Artikel in EUR, wenn die API keine liefert.
     * ANNAHME: AliExpress Standard Shipping / Choice für Kleinteile bis ~500 g.
     */
    perItemEur: { DE: 3.5, AT: 3.9, CH: 4.5, GB: 3.9 } satisfies Record<Country, number>,
  },

  fees: {
    /** ANNAHME: Shopify Payments, Standardtarif (Kartenzahlung) – Prozent vom Bruttopreis + Fixbetrag in EUR */
    paymentFeePct: 0.021,
    paymentFeeFixedEur: 0.3,
  },

  margin: {
    /** Marge (Anteil vom Nettoerlös), ab der der Margen-Score > 0 wird */
    minMarginPct: 0.2,
    /** Marge, ab der der Margen-Score 1 erreicht */
    targetMarginPct: 0.55,
    /** Mindest-Rohertrag je Stück in EUR; darunter wird der Kandidat markiert und nach unten sortiert */
    minMarginAbsEur: 8,
  },

  referencePrice: {
    /** Mindestanzahl Shopping-Treffer, damit ein Median als Referenz gilt; sonst Fallback-Multiplikator */
    minSampleSize: 3,
    /** Treffer pro Shopping-Anfrage, die in den Median eingehen */
    maxResults: 20,
  },

  trend: {
    recentWeeks: 4,
    previousWeeks: 4,
    /** Untergrenze des Nenners beim Wachstum (verhindert Explosion bei previous ≈ 0) */
    growthFloor: 5,
    /** Wachstum, bei dem G = 0,5 erreicht (1.0 = Verdopplung) */
    growthHalfSaturation: 1.0,
    /** Baseline-Durchschnitt, ab dem ein Keyword nicht mehr als „Frühphase“ gilt */
    earlyBaselineCap: 30,
    /** Unter diesem Niveau der letzten Wochen gilt das Signal als Rauschen → T = 0 */
    minRecentInterest: 5,
    /**
     * Rauschfilter: Enthalten die letzten `recentWeeks` Wochen eine Null, ist das Suchvolumen
     * zu gering – Trends zeigt dann vereinzelte, auf 100 normierte Ausschläge → T = 0.
     */
    requireContinuousRecentInterest: true,
    /** Mindestlänge der Zeitreihe in Wochen */
    minSeriesWeeks: 16,
    weights: { growth: 0.55, early: 0.35, level: 0.1 },
  },

  competition: {
    /** log10(1 + Trefferanzahl), bei dem die Anbieter-Sättigung 1 erreicht (5 ≈ 100.000 Treffer) */
    resultCountLogCap: 5,
    /** log10(1 + Σ Bestellungen/30 Tage der Top-Treffer), bei dem die Volumen-Sättigung 1 erreicht */
    ordersLogCap: 5,
    weights: { results: 0.5, orders: 0.5 },
  },

  score: {
    weights: { trend: 0.5, margin: 0.35, competition: 0.15 },
    /** Relevanz wirkt als Faktor: 1 = linear, > 1 bestraft unsichere Matches stärker */
    relevanceExponent: 1,
  },

  collect: {
    /** Parallele Requests je Quelle */
    concurrency: 3,
    /** Pause zwischen Requests je Quelle (ms), schont Rate-Limits */
    requestDelayMs: 400,
    /** Timeout je HTTP-Request (ms) */
    requestTimeoutMs: 20_000,
  },
};

export type RadarConfig = typeof radarConfig;
