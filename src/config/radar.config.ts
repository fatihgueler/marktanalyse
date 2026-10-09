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
  /** Pinterest-Trends-Region; kleinere Märkte gibt es nur zusammengefasst */
  pinterestRegion: string;
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
    // ANNAHME: Pinterest führt AT und CH nur als Region „DE+AT+CH“ – beide Länder teilen sich diese Trends.
    DE: { label: "Deutschland", currency: "EUR", serpGeo: "DE", serpLanguage: "de", aliexpressShipTo: "DE", aliexpressLanguage: "DE", pinterestRegion: "DE" },
    AT: { label: "Österreich", currency: "EUR", serpGeo: "AT", serpLanguage: "de", aliexpressShipTo: "AT", aliexpressLanguage: "DE", pinterestRegion: "DE+AT+CH" },
    CH: { label: "Schweiz", currency: "CHF", serpGeo: "CH", serpLanguage: "de", aliexpressShipTo: "CH", aliexpressLanguage: "DE", pinterestRegion: "DE+AT+CH" },
    GB: { label: "Vereinigtes Königreich", currency: "GBP", serpGeo: "GB", serpLanguage: "en", aliexpressShipTo: "UK", aliexpressLanguage: "EN", pinterestRegion: "GB+IE" },
  } satisfies Record<Country, CountryProfile>,

  /**
   * Wechselkurse: Einheiten der Währung pro 1 EUR.
   * Feste, gerundete Kurse (EZB, 25.09.2026). Sie gelten nur, wenn `fxUpdate.source` = "config"
   * ist oder die EZB nicht erreichbar ist.
   * USD nur als Sicherheitsnetz, falls eine Quelle nicht in EUR liefert; CNY für 1688.
   */
  fx: { EUR: 1, CHF: 0.94, GBP: 0.86, USD: 1.14, CNY: 7.66 } as Record<string, number> & Record<Currency | "USD" | "CNY", number>,

  /** Tageskurse der Europäischen Zentralbank vor jedem Lauf (kostenlos, ohne Konto) */
  fxUpdate: {
    source: "ezb" as "ezb" | "config",
    url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    /** Die EZB veröffentlicht werktags; ältere Kurse werden mit Warnung genutzt */
    maxAgeDays: 5,
  },

  demand: {
    /**
     * Seed-Begriffe für die Suche nach steigenden Keywords („rising related queries“).
     * Konkrete Produktkategorien statt Sammelbegriffen: „gadget“, „led“, „deko“ und „geschenkidee“ lieferten
     * im ersten Live-Lauf vor allem Marken, Saisonware und Bastelideen. Freigegeben am 09.10.2026.
     * CH und GB laufen nur, wenn eine Angebotsquelle dorthin liefert (heute nur AliExpress).
     */
    seeds: {
      DE: ["nachtlicht", "luftbefeuchter", "schreibtisch organizer", "massagegerät", "mini projektor", "handyhalterung", "küche aufbewahrung", "gesichtsroller"],
      AT: ["nachtlicht", "luftbefeuchter", "massagegerät", "mini projektor", "handyhalterung", "küche aufbewahrung"],
      CH: ["nachtlicht", "luftbefeuchter", "massagegerät", "mini projektor", "handyhalterung", "küche aufbewahrung"],
      GB: ["night light", "humidifier", "desk organiser", "massage gun", "mini projector", "phone holder", "kitchen storage", "face roller"],
    } satisfies Record<Country, string[]>,
    /** Kostenkontrolle SerpApi: je Seed 1 Request, je Keyword 1 Request */
    maxSeedsPerCountry: 8,
    /** 45 × 4 Länder = 180 Trendkurven je Lauf – passt mit Entdeckung und Preisabfragen ins SerpApi-Budget */
    maxKeywordsPerCountry: 45,
    /** Zeitraum der Zeitreihe (SerpApi `date`) */
    seriesTimeframe: "today 12-m",
    discoveryTimeframe: "today 3-m",
  },

  /**
   * Keyword-Filter VOR den Trendkurven: Jede Google-Trends-Kurve kostet eine SerpApi-Suche. Begriffe,
   * die kein importierbares Produkt sind, fliegen vorher raus – erst per Regel (kostenlos), dann per
   * Claude (ein gebündelter Aufruf je Land und Quelle). Begriffe werden als ganze Wörter verglichen;
   * chinesische Einträge (für 1688-Titel) als Teilstring.
   */
  keywordFilter: {
    /** ANNAHME: Händler und Marken, deren Suchbegriffe auf deren Sortiment zielen statt auf ein Produkt */
    brands: [
      "ikea", "lidl", "aldi", "dunelm", "m&s", "marks and spencer", "philips hue", "leroy merlin", "jysk", "tchibo", "kik", "primark",
      "temu", "shein", "amazon", "obi", "bauhaus", "hornbach", "depot", "xxxlutz", "rossmann", "h&m", "zara", "argos", "b&m",
      "the range", "tesco", "asda", "sainsbury", "wilko", "home bargains", "kmart", "walmart", "costco", "apple", "samsung", "dyson",
      "govee", "nanoleaf", "lego", "loberon", "pagro",
    ],
    /** Fragen – nur als erstes Wort */
    questionWords: ["how", "what", "why", "where", "when", "which", "who", "wie", "was", "warum", "wo", "wann", "welche", "welcher", "welches", "wer"],
    /** Selbermachen und Anleitungen statt fertiger Produkte */
    diy: ["basteln", "selber machen", "selbst machen", "selbermachen", "ideen", "idee", "diy", "anleitung", "tutorial", "vorlage", "ausmalbild", "craft", "crafts", "ideas", "template", "printable"],
    /** Tests, Vergleiche und Bestenlisten */
    reviewCompare: ["test", "testsieger", "vergleich", "erfahrungen", "bewertung", "review", "reviews", "vs", "versus", "compare", "comparison", "best", "beste", "bester", "bestes", "stiftung warentest", "worth it"],
    /** Filme, Serien, Spiele, Musik, Rätsel */
    media: [
      "film", "movie", "kinofilm", "serie", "series", "staffel", "episode", "trailer", "netflix", "crossword", "kreuzworträtsel", "lyrics", "songtext",
      "album", "konzert", "concert", "pokemon go", "videospiel", "video game", "playstation", "xbox", "nintendo switch", "besetzung",
    ],
    /** Lizenzware – ohne Lizenz nicht verkäuflich (Markenrecht). Gilt für Keywords und Angebotstitel. */
    licenses: [
      "star wars", "disney", "marvel", "pokémon", "pokemon", "harry potter", "barbie", "hello kitty", "minecraft", "fortnite", "super mario",
      "frozen", "paw patrol", "peppa", "spiderman", "spider-man", "batman", "avengers", "stranger things", "stitch", "sanrio", "kuromi",
      "naruto", "one piece", "dragon ball", "squishmallows", "labubu",
      "星球大战", "迪士尼", "漫威", "宝可梦", "精灵宝可梦", "哈利波特", "芭比", "凯蒂猫", "我的世界", "马里奥", "冰雪奇缘", "蜘蛛侠", "三丽鸥", "库洛米", "海贼王", "火影", "泡泡玛特",
    ],
    /** Quellen, deren Begriffe Claude zusätzlich prüft. TikTok und Pinterest prüft Claude schon beim Erkennen der Produkt-Hashtags. */
    claudeCheckSources: ["google-trends"],
    /** Begriffe je Claude-Aufruf */
    claudeBatchSize: 80,
    /** So viele verworfene Beispiele je Land und Quelle stehen im Log */
    logExamples: 5,
  },

  supply: {
    /**
     * Treffer je Keyword/Land und Angebotsquelle. AliExpress ist kostenlos – mehr Treffer bringen mehr
     * Kandidaten, ohne zusätzliche API-Kosten (nur etwas mehr Claude-Tokens im Matching).
     */
    resultsPerKeyword: 12,
    /**
     * Echte Versandkosten und Lieferzeit (AliExpress `aliexpress.affiliate.product.shipping.get`, kostenlos)
     * für die N meistverkauften Treffer je Suche; alle anderen rechnen mit der Pauschale `shipping.perItemEur`.
     * Eine Abfrage je Angebot, gedrosselt wie alle Requests (`collect.requestDelayMs`).
     */
    shippingLookupsPerSearch: 5,
    /** Nur Keywords mit Trend-Score ≥ diesem Wert werden auf der Angebotsseite gesucht */
    minTrendScoreForSupply: 0.2,
  },

  matching: {
    /** Paare darunter werden nicht gescort */
    minRelevance: 0.6,
    /**
     * Obergrenze Ausgabe-Tokens pro Claude-Request (Klassifikation der Treffer eines Keywords).
     * Enthält bei Haiku 5.5 auch die Denk-Tokens – daher mit Reserve.
     */
    maxOutputTokens: 8000,
    /**
     * Denktiefe für Claude (`output_config.effort`). Reine Klassifikation → "low".
     * Wird bei Modellen ohne Effort-Unterstützung automatisch weggelassen (siehe modelsWithoutEffort).
     */
    effort: "low" as "low" | "medium" | "high" | null,
    /** Modell-Präfixe, die `effort` mit einem Fehler ablehnen (ältere Modelle, nur bei ANTHROPIC_MODEL relevant) */
    modelsWithoutEffort: ["claude-haiku-4-5", "claude-sonnet-4-5"],
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
    /**
     * Längste noch brauchbare Lieferzeit in Tagen (Höchstwert laut Quelle). Langsamere Angebote werden markiert
     * und bei der Wahl des besten Angebots einer Produktgruppe nachrangig behandelt.
     * ANNAHME: Bei einem Drop warten Kundinnen und Kunden höchstens etwa drei Wochen.
     */
    maxDeliveryDays: 20,
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
    /**
     * Echte Shopping-Preise je Land: mindestens `minLookupsPerCountry` (aus dem SerpApi-Anteil des Landes
     * reserviert), höchstens `maxLookupsPerCountry`. Was die Trends vom Anteil übrig lassen – etwa weil der
     * Keyword-Filter Kurven spart –, geht an Shopping. Keywords ohne Preisabfrage nutzen den Kategorie-Faktor.
     */
    minLookupsPerCountry: 8,
    maxLookupsPerCountry: 45,
  },

  /**
   * Pinterest Trends API (kostenlos, App-Freigabe nötig): steigende Suchbegriffe je Region mit Wochenkurve.
   * Stark bei Wohnen, Deko und Geschenken; oft früher als Google.
   */
  pinterest: {
    /** "growing" = Begriffe mit dem stärksten Zuwachs – passt zur Früherkennung */
    trendType: "growing",
    /** ANNAHME: Interessen mit physischen Produkten aus nexanas Sortimentsrichtung */
    interests: ["home_decor", "electronics", "beauty", "diy_and_crafts", "gardening", "animals", "sport", "parenting", "health", "event_planning"],
    /** Begriffe je Abfrage (API-Maximum 50) */
    limit: 50,
    /** Allgemeine Begriffe ohne Produktbezug – werden vor der Klassifizierung verworfen */
    ignore: ["ideen", "ideas", "inspiration", "aesthetic", "wallpaper"],
  },

  // ANNAHME: Startparameter; nach einigen Wochen Historie an echten Drop-Erfolgen kalibrieren.
  trend: {
    recentWeeks: 4,
    previousWeeks: 4,
    /**
     * Saison-Erkennung im 12-Monats-Fenster („today 12-m“, 52 Wochen): Die ersten Wochen des Fensters
     * liegen ein Jahr vor den kommenden Wochen – also im gleichen Zeitraum des Vorjahres.
     * „Saison“ heißt: Es steigt jetzt, war vor einem Jahr zur gleichen Zeit ähnlich hoch, und dazwischen
     * lag ein deutliches Tief (z. B. Halloween, Weihnachtsdeko, Planschbecken).
     * ANNAHME: Die Vorjahresspanne ist um bis zu `windowWeeks` Wochen in die Zukunft verschoben – für
     * Saisonware vor dem Höhepunkt ist das genau der Vorjahres-Höhepunkt.
     */
    seasonality: {
      /** Wochen am Fensteranfang = Vorjahreszeitraum */
      windowWeeks: 6,
      /** Kürzere Reihen (z. B. TikTok, ~17 Wochen) lassen keinen Vorjahresvergleich zu */
      minSeriesWeeks: 48,
      /** Vorjahreszeitraum mindestens so hoch: Anteil am heutigen Niveau */
      yearAgoMinRatio: 0.5,
      /** Tiefster 4-Wochen-Schnitt dazwischen höchstens dieser Anteil vom Jahreshöchstwert */
      troughMaxRatio: 0.35,
    },
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
      /** harte Kostengrenze je Lauf in USD (Apify-Parameter maxTotalChargeUsd); 100 Hashtags ≈ 0,15 $ */
      maxChargeUsd: 0.2,
      /** ANNAHME: Preis laut Actor-Seite, nur für die Kostenschätzung vor Live-Läufen */
      usdPerThousandResults: 1.5,
      /** Allgemeine Hashtags ohne Produktbezug – werden vor der Klassifizierung verworfen */
      ignore: ["fyp", "foryou", "foryoupage", "fy", "viral", "trend", "trending", "tiktok", "tiktokmademebuyit", "tiktokshop", "explore", "xyzbca"],
      /** Heuristik: Anteil des Hashtags, der aus bekannten Produktwörtern bestehen muss */
      minCoverage: 0.8,
    },
    alibaba1688: {
      /** Abrechnung pro Ergebnis, keine Monatsmiete – passt ins Gratis-Guthaben von Apify */
      actorId: "memo23~1688-wholesale-scraper",
      /** Angebote, die je Keyword geladen und übernommen werden (bestimmt die Kosten) */
      resultsPerKeyword: 5,
      /** Kostenbremse: 1688-Suchen nur für die N Keywords mit dem höchsten Trend-Score je Land */
      maxSearchesPerCountry: 12,
      /** harte Kostengrenze je Suche in USD; 5 Angebote ≈ 0,01 $ */
      maxChargeUsd: 0.03,
      /** ANNAHME: Preis laut Actor-Seite („ab 2 $ / 1.000 Angebote“), nur für die Kostenschätzung; Proxy-Kosten kommen ggf. hinzu */
      usdPerThousandResults: 2,
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

  /**
   * Kostenrahmen – „so günstig wie möglich“. Die Config-Prüfung stellt sicher, dass ein Lauf im
   * ungünstigsten Fall nicht mehr verbraucht als Monatsbudget ÷ Läufe pro Monat; zur Laufzeit
   * begrenzt ein hartes Suchbudget die SerpApi-Aufrufe zusätzlich.
   */
  budget: {
    /** wöchentlicher Lauf */
    runsPerMonth: 4.33,
    /** SerpApi-Plan „Starter“ (25 $/Monat). Gratis-Plan: 250 – dann Keywords/Lookups deutlich senken. */
    serpApiMonthlySearches: 1000,
    /**
     * Mindestens so viele SerpApi-Suchen müssen im Kontingent übrig sein, sonst fällt der Lauf aus.
     * ANNAHME: Darunter reicht es nach der Keyword-Suche (Seeds) kaum noch für Kurven und Preise.
     */
    serpApiMinSearchesPerRun: 100,
    /** Apify-Gratis-Plan: 5 $ Guthaben pro Monat */
    apifyMonthlyUsd: 5,
  },

  /**
   * Produkt-Check (manuelle Prüfung ohne APIs). Das Urteil richtet sich nach der Marge pro Stück
   * nach Einkauf, Versand, Zoll, Einfuhrumsatzsteuer, ggf. USt und Zahlungsgebühren – vor Werbung.
   * „Lohnt sich“: beide Schwellen von `worthIt` erreicht; „Knapp“: beide von `tight`; sonst „Finger weg“.
   * ANNAHME: 35 % und 15 € lassen genug Luft für Werbekosten pro Verkauf, wie sie bei Impulsprodukten
   * in DACH üblich sind; 20 % und 8 € entsprechen der Mindestmarge der Rangliste (`margin`).
   */
  productCheck: {
    worthIt: { minMarginPct: 0.35, minMarginAbsEur: 15 },
    tight: { minMarginPct: 0.2, minMarginAbsEur: 8 },
    /** Trendphase aus der Google-Trends-CSV: ab diesem Frühphasen-Anteil (0..1) gilt ein Anstieg als „Frühphase“ */
    earlyPhaseMin: 0.5,
  },

  /**
   * Rangliste in Worten. Urteil je Produkt, in dieser Reihenfolge geprüft:
   * „Marge zu dünn“ (unter der Mindestmarge) → „Beobachten“ (Signal als Rauschen verworfen) →
   * „Zu spät“ (Interesse steigt nicht mehr oder Wettbewerb hoch) → „Jetzt testen“ (Gesamtscore ab
   * `testNowMinScore`) → sonst „Beobachten“.
   * ANNAHME: Startwerte; nach den ersten echten Drops mit der Kalibrierung abgleichen.
   */
  ranking: {
    testNowMinScore: 60,
    /** Wettbewerb-Teilscore (1 = wenig Wettbewerb): darunter „hoch“, ab `competitionLowMin` „niedrig“ */
    competitionHighBelow: 0.35,
    competitionLowMin: 0.6,
    /** Wachstum gegenüber der Vorperiode (1 = Verdopplung) für „stark steigend“ bzw. „steigend“; darunter „leicht steigend“ */
    growthStrongMin: 1,
    growthMin: 0.25,
    /**
     * „Neu diese Woche“: verglichen wird mit dem letzten Lauf, der mindestens so viele Tage vor dem aktuellen
     * gestartet ist – ein zweiter Lauf am selben Tag soll den Vergleich nicht aushebeln.
     * ANNAHME: 5 Tage, damit ein verschobener Wochenlauf (Dienstag statt Montag) trotzdem die Vorwoche trifft.
     */
    compareMinDaysBack: 5,
    /** ANNAHME: Ab 10 Punkten Plus gegenüber dem Vergleichslauf gilt ein Produkt als „deutlich gestiegen“. */
    risingMinPoints: 10,
  },

  /**
   * Rückblick-Test: Eine mehrjährige Google-Trends-CSV wird Woche für Woche so bewertet, als liefe der Radar damals.
   * Nur der Trend lässt sich rückwirkend nachstellen – Marge und Wettbewerb von damals sind unbekannt.
   */
  backtest: {
    /** Fenster je Bewertung wie im Echtbetrieb (SerpApi liefert 12 Monate), jeweils neu auf 100 normiert */
    windowWeeks: 52,
    /**
     * Ab diesem Trend-Score gilt eine Woche als Signal.
     * ANNAHME: 0,5 entspricht etwa „Jetzt testen“ (Gesamtscore ≥ 60) bei guter Marge und mittlerem Wettbewerb.
     */
    signalMinTrendScore: 0.5,
    /** Signale höchstens so viele Wochen vor dem Höhepunkt zählen als Treffer; frühere werden extra gezählt */
    leadWindowWeeks: 26,
    /** ANNAHME: Bestellen, Lieferung und Drop-Vorbereitung brauchen etwa 4 Wochen – weniger Vorlauf ist „knapp“ */
    goodLeadWeeks: 4,
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
