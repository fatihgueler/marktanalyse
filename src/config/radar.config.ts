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
  /** Referenzpreis-Fallback: typischer Endkundenpreis = Einkaufspreis × Faktor (ANNAHME: Erfahrungswerte Dropshipping DACH) */
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
   * ANNAHME: feste, gerundete Kurse (Stand September 2026) – regelmäßig manuell pflegen.
   * USD nur als Sicherheitsnetz, falls eine Quelle nicht in EUR liefert; CNY für 1688.
   */
  fx: { EUR: 1, CHF: 0.94, GBP: 0.86, USD: 1.17, CNY: 8.3 } as Record<string, number> & Record<Currency | "USD" | "CNY", number>,

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
    minRelevance: 0.6,
    /** Obergrenze Ausgabe-Tokens pro Claude-Request (Klassifikation von bis zu 8 Produkten) */
    maxOutputTokens: 4000,
    /**
     * Denktiefe für Claude (`output_config.effort`). Reine Klassifikation → "low".
     * Auf null setzen, falls ANTHROPIC_MODEL ein Modell ohne Effort-Unterstützung ist (z. B. Haiku 4.5).
     */
    effort: "low" as "low" | "medium" | "high" | null,
    /**
     * Heuristik: Zubehör-/Ersatzteil-Erkennung → Relevanz halbiert, wenn der Begriff nicht im Keyword steht.
     * `anywhere`: eindeutig, zählt überall im Titel. `leading`: zählt nur in der vorderen Titelhälfte
     * (AliExpress-Titel nennen dort das eigentliche Produkt; „… Automatic Filter“ am Ende ist ein Merkmal).
     */
    accessoryMarkers: {
      anywhere: ["replacement", "ersatz", "accessory", "zubehör"],
      leading: ["cover", "filter", "battery", "bracket", "rolls", "tablets", "cartridge", "sticker", "poster", "trap", "canvas"],
    },
    /** Heuristik: Füllwörter, die beim Abgleich ignoriert werden */
    stopwords: ["mit", "für", "und", "der", "die", "das", "for", "with", "and", "the"],
    /**
     * Heuristik: Wortbestandteil → Übersetzungen/Synonyme (DE → EN). Zusammengesetzte Wörter
     * („wolkenlampe“) werden in bekannte Bestandteile zerlegt („wolken“ + „lampe“).
     */
    synonyms: {
      mini: ["mini", "pocket", "portable", "small"],
      lampe: ["lamp", "light", "licht", "leuchte"],
      licht: ["light", "lamp"],
      sonnenuntergang: ["sunset"],
      wolken: ["cloud"],
      wolke: ["cloud"],
      mond: ["moon"],
      schwebend: ["floating", "levitating", "levitation"],
      sternen: ["star", "galaxy", "starry"],
      projektor: ["projector"],
      beamer: ["projector", "beamer"],
      pilz: ["mushroom"],
      waffeleisen: ["waffle"],
      faltbar: ["foldable", "folding", "collapsible"],
      tragbar: ["portable", "wearable"],
      wasserkocher: ["kettle"],
      mixer: ["blender", "mixer"],
      isolier: ["insulated", "vacuum"],
      becher: ["cup", "tumbler", "mug"],
      strohhalm: ["straw"],
      eisroller: ["ice roller"],
      eis: ["ice"],
      kugel: ["sphere", "ball", "round"],
      form: ["mold", "mould", "tray"],
      gesicht: ["face", "facial"],
      maske: ["mask"],
      kopfhaut: ["scalp", "head"],
      massage: ["massage", "massager"],
      pistole: ["gun"],
      stein: ["stone", "quartz", "jade"],
      magnetisch: ["magnetic", "magsafe"],
      powerbank: ["power bank", "powerbank", "battery pack"],
      nacken: ["neck"],
      ventilator: ["fan"],
      thermo: ["thermal", "inkless"],
      drucker: ["printer"],
      handy: ["phone"],
      halterung: ["holder", "mount"],
      auto: ["car", "vent", "dashboard"],
      kette: ["chain", "lanyard", "strap", "necklace"],
      schnecke: ["slug", "snail"],
      katzen: ["cat", "pet"],
      katze: ["cat", "pet"],
      trinkbrunnen: ["fountain"],
      pfoten: ["paw"],
      reiniger: ["cleaner", "washer", "cleaning"],
      hund: ["dog"],
      wellig: ["wavy", "wave"],
      spiegel: ["mirror"],
      kerzen: ["candle"],
      "wärmer": ["warmer"],
      perlen: ["beaded", "bead", "pearl"],
      tasche: ["bag", "handbag", "tote", "clutch"],
      // Englische Keywords (UK): Varianten, unter denen AliExpress-Titel dasselbe Produkt führen
      cat: ["cat", "pet", "kitten"],
      lamp: ["lamp", "light"],
      light: ["light", "lamp"],
      led: ["led", "light", "photon"],
      display: ["display", "frame", "matrix"],
      blender: ["blender", "juicer"],
      collapsible: ["collapsible", "foldable", "folding"],
      travel: ["travel", "portable", "camping"],
      electric: ["electric", "cordless", "rechargeable", "usb", "wireless"],
      scalp: ["scalp", "head"],
      massager: ["massager", "massage"],
      roller: ["roller", "globe"],
      face: ["face", "facial"],
      tumbler: ["tumbler", "cup", "mug"],
      insulated: ["insulated", "vacuum", "stainless"],
      fountain: ["fountain", "dispenser"],
      cleaner: ["cleaner", "washer", "cleaning", "plunger"],
      thermal: ["thermal", "inkless", "label"],
      projector: ["projector", "beamer"],
      mount: ["mount", "holder"],
      lanyard: ["lanyard", "strap", "chain", "necklace"],
      crossbody: ["crossbody", "lanyard", "strap"],
      mold: ["mold", "mould", "tray", "maker"],
      sphere: ["sphere", "ball", "round"],
      bag: ["bag", "handbag", "tote", "clutch"],
      beaded: ["beaded", "bead", "pearl"],
      stone: ["stone", "quartz", "jade", "board", "tool"],
      power: ["power", "battery"],
      bank: ["bank", "pack"],
      magnetic: ["magnetic", "magsafe"],
      galaxy: ["galaxy", "star", "nebula"],
      astronaut: ["astronaut", "spaceman"],
      art: ["art", "animation", "diy"],
      levitating: ["levitating", "levitation", "floating", "magnetic"],
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
    "technik-gadgets": { label: "Technik & Gadgets", dutyRate: { EU: 0.0, GB: 0.0, CH: 0 }, retailMultiplier: 2.6, keywords: ["gadget", "usb", "bluetooth", "powerbank", "power bank", "fan", "ventilator", "speaker", "lautsprecher", "keyboard", "tastatur", "smart", "printer", "drucker", "display", "pixel", "beamer"] },
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

  // ANNAHME: Startwerte für Drops mit Paid Social – unter 20 % Marge trägt ein Drop die Werbekosten kaum.
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

  // ANNAHME: Startparameter; nach einigen Wochen Historie an echten Drop-Erfolgen kalibrieren.
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
    /** Mindestlänge der Zeitreihe in Wochen (TikTok-Kurven decken nur ~17 Wochen ab) */
    minSeriesWeeks: 12,
    weights: { growth: 0.55, early: 0.35, level: 0.1 },
  },

  competition: {
    /** log10(1 + Trefferanzahl), bei dem die Anbieter-Sättigung 1 erreicht (5 ≈ 100.000 Treffer) */
    resultCountLogCap: 5,
    /** log10(1 + Σ Bestellungen/30 Tage der Top-Treffer), bei dem die Volumen-Sättigung 1 erreicht */
    ordersLogCap: 5,
    /**
     * log10(1 + Werbetreibende), bei dem der Werbedruck 1 erreicht (2 ≈ 100 Werbetreibende).
     * ANNAHME: Ab ~100 aktiven Werbetreibenden für einen Suchbegriff ist der Markt gesättigt.
     */
    advertisersLogCap: 2,
    // ANNAHME: Werbedruck ist der direkteste Beleg für westliche Konkurrenz und zählt daher am meisten.
    weights: { results: 0.25, orders: 0.25, advertisers: 0.5 },
  },

  // ANNAHME: Startgewichte – Früherkennung zählt am meisten, Wettbewerb ist in Phase 1 nur ein grober Proxy.
  score: {
    weights: { trend: 0.5, margin: 0.35, competition: 0.15 },
    /** Relevanz wirkt als Faktor: 1 = linear, > 1 bestraft unsichere Matches stärker */
    relevanceExponent: 1,
  },

  ads: {
    /**
     * Länder, für die Werbebibliotheken nicht-politische Anzeigen liefern.
     * Meta und TikTok zeigen diese nur für die EU (Transparenzpflicht nach DSA) → CH und GB fehlen.
     */
    coveredCountries: ["DE", "AT"] as Country[],
    /**
     * Höchstzahl Anzeigen, die je Keyword/Land gelesen werden (Kostengrenze, zugleich Zähl-Obergrenze).
     * Meta liefert 50 je Seite, TikTok nur 10 – TikTok daher niedriger, um das Tageskontingent zu schonen.
     */
    maxAdsPerKeyword: { meta: 100, tiktok: 30 },
    /** Wochen, für die neue Anzeigen je Woche gezählt werden (Marktdynamik) */
    momentumWeeks: 8,
    /** Zeitraum der TikTok-Abfrage nach Veröffentlichungsdatum */
    lookbackDays: 365,
    /** Beispiel-Anzeigen, die im Dashboard verlinkt werden */
    samplesPerKeyword: 5,
    /** ANNAHME: Graph-API-Version Stand September 2026 */
    metaGraphVersion: "v26.0",
  },

  /**
   * Scraping über den Datendienst Apify (Phase 2b). Actor-IDs sind austauschbar; ändert sich die
   * Ausgabe eines Actors, müssen die Adapter in src/sources/scraping/ angepasst werden.
   */
  scraping: {
    /** Maximale Laufzeit eines synchronen Apify-Laufs (Apify bricht nach 300 s mit HTTP 408 ab) */
    runTimeoutSeconds: 300,
    tiktokHashtags: {
      actorId: "memo23~tiktok-trending-hashtags-scraper",
      /** ANNAHME: Creative Center führt DE und GB; AT/CH sind dort keine eigenen Märkte */
      countries: ["DE", "GB"] as Country[],
      /** Zeitfenster der Popularitätskurve – 120 Tage ergeben ~17 Wochenwerte */
      days: "120",
      hashtagsPerCountry: 100,
      /** harte Kostengrenze je Lauf in USD (Apify-Parameter maxTotalChargeUsd) */
      maxChargeUsd: 0.5,
      /** ANNAHME: Preis laut Actor-Seite, nur für die Kostenschätzung vor Live-Läufen */
      usdPerThousandResults: 1.5,
      /** Allgemeine Hashtags ohne Produktbezug – werden vor der Klassifizierung verworfen */
      ignore: ["fyp", "foryou", "foryoupage", "fy", "viral", "trend", "trending", "tiktok", "tiktokmademebuyit", "tiktokshop", "explore", "xyzbca"],
      /** Heuristik: Anteil des Hashtags, der aus bekannten Produktwörtern bestehen muss */
      minCoverage: 0.8,
    },
    alibaba1688: {
      actorId: "songd~1688-search-scraper",
      /** Seiten je Suche (1 Seite ≈ 100 Produkte) */
      maxPages: 1,
      /** Angebote, die je Keyword übernommen werden */
      resultsPerKeyword: 8,
      maxChargeUsd: 0.5,
      /** ANNAHME: Mietpreis 30 $/Monat + Plattformkosten; je Suche grob geschätzt */
      usdPerSearchEstimate: 0.05,
    },
  },

  /**
   * Großhandels-Beschaffung (1688): Sammelbestellung über einen Einkaufsagenten, Luftfracht nach DE,
   * reguläre Verzollung, Lager in DE, Versand an Endkunden.
   */
  wholesale: {
    /** ANNAHME: nur aus einem Lager in DE belieferte Länder (CH/GB würden erneut verzollt) */
    countries: ["DE", "AT"] as Country[],
    /** ANNAHME: Stück je Drop-Bestellung; höhere Staffeln senken den Stückpreis */
    lotSize: 200,
    /** ANNAHME: Agentengebühr (Einkauf, Qualitätskontrolle, Konsolidierung) in % vom Warenwert */
    agentFeePct: 0.08,
    /** ANNAHME: Luftfracht China → DE inkl. Abholung, EUR je kg */
    freightPerKgEur: 6.5,
    /** ANNAHME: Verzollungspauschale des Spediteurs je Sendung (EUR), auf die Losgröße verteilt */
    clearanceFeePerShipmentEur: 60,
    /** ANNAHME: Versand vom Lager in DE an Endkunden, EUR je Stück */
    lastMileEur: { DE: 4.5, AT: 6.9 } as Partial<Record<Country, number>>,
    /** ANNAHME: Versandgewicht je Stück, wenn die Quelle keins liefert (kg) */
    defaultWeightKg: {
      beleuchtung: 0.6,
      "wohnen-deko": 0.8,
      "kueche-haushalt": 0.9,
      "beauty-pflege": 0.3,
      "technik-gadgets": 0.4,
      "handy-zubehoer": 0.2,
      "spielzeug-fun": 0.2,
      "sport-outdoor": 0.7,
      haustier: 0.8,
      "mode-accessoires": 0.3,
      "buero-schreibwaren": 0.3,
      sonstiges: 0.5,
    } satisfies Record<CategoryId, number>,
  },

  calibration: {
    /** Mindestanzahl Drops je Gruppe (Top und Flop), bevor eine Aussage angezeigt wird */
    minPerGroup: 3,
    /** Mittelwert-Abstand Top − Flop (0..1-Skala), ab dem eine Komponente „gut trennt“ */
    strongDifference: 0.15,
    /** darunter gilt eine Komponente als „trennt nicht“ */
    weakDifference: 0.05,
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
