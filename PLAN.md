# PLAN – nexana Trend-Radar (Phase 1)

Status: **Entwurf, wartet auf Freigabe.** Am Ende stehen vier offene Entscheidungen (E1–E4), die ich vor dem Start von Schritt 2 brauche.

---

## 1. Ziel und Datenfluss

```
                ┌──────────────────────── npm run collect (Railway Cron) ────────────────────────┐
                │                                                                                 │
 Config         │  1. Nachfrage          2. Angebot            3. Referenzpreis   4. Matching      │
 (Seeds,        │  TrendSource[]  ──►    SupplySource[]  ──►   PriceSource   ──►  Claude / Heur. │
 Gewichte,  ──► │  Google Trends         AliExpress            (siehe E1)         Relevanz +      │
 Steuern)       │  DE/AT/CH/GB           pro Keyword                              Kategorie       │
                │        │                     │                    │                 │           │
                │        ▼                     ▼                    ▼                 ▼           │
                │                     5. Scoring (reine Funktionen, keine KI)                     │
                │                     Trend-Dynamik · Marge · Wettbewerb → Gesamtscore            │
                │                                        │                                        │
                │                     6. Snapshot pro Lauf in PostgreSQL                          │
                └────────────────────────────────────────┼────────────────────────────────────────┘
                                                         ▼
                                      Dashboard (Next.js, passwortgeschützt)
                                      Rangliste · Filter · Detail mit Score-Aufschlüsselung
```

Leitprinzip: **Jeder Wert im Dashboard ist auf Rohdaten eines konkreten Laufs zurückführbar.** Rohantworten der APIs werden pro Lauf gespeichert, Scores werden deterministisch aus Rohdaten + Config berechnet und mit der verwendeten Config-Version abgelegt.

---

## 2. Ordnerstruktur

```
marktanalyse/
├── .env.example                     # alle ENV-Variablen, ohne Werte
├── .gitignore
├── README.md                        # Setup, ENV, Mock → Live
├── PLAN.md
├── package.json
├── tsconfig.json                    # strict: true, noUncheckedIndexedAccess: true
├── next.config.ts
├── postcss.config.mjs
├── components.json                  # shadcn/ui
├── eslint.config.mjs
├── vitest.config.ts
├── prisma.config.ts                 # Prisma 7: Schema-Pfad + DATABASE_URL
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── src/
    ├── config/
    │   └── radar.config.ts          # EINZIGE Stelle für Gewichte, Steuern, Zoll, Versand, FX, Seeds, Limits
    ├── lib/
    │   ├── env.ts                   # ENV einlesen + validieren (zod), Mock-Erkennung
    │   ├── db.ts                    # PrismaClient-Singleton (Adapter pg)
    │   ├── auth.ts                  # Cookie-Signatur (Web Crypto, Edge-kompatibel)
    │   └── utils.ts                 # cn() für shadcn
    ├── sources/
    │   ├── types.ts                 # TrendSource, SupplySource, PriceSource, normalisierte Datensätze
    │   ├── registry.ts              # welche Adapter aktiv sind (Phase 2: hier ergänzen)
    │   ├── http.ts                  # fetch mit Timeout, Retry, Rate-Limit-Pause
    │   ├── demand/
    │   │   ├── google-trends.serpapi.ts
    │   │   └── google-trends.mock.ts
    │   ├── supply/
    │   │   ├── aliexpress.ts
    │   │   ├── aliexpress.sign.ts   # HMAC-SHA256-Signatur der Open Platform
    │   │   └── aliexpress.mock.ts
    │   ├── price/                   # abhängig von E1
    │   │   ├── google-shopping.serpapi.ts
    │   │   └── google-shopping.mock.ts
    │   └── mock/
    │       ├── catalog.ts           # gemeinsamer, konsistenter Mock-Katalog (Keyword ↔ Produkte ↔ Preise)
    │       └── random.ts            # deterministischer Seed-RNG → reproduzierbare Demos
    ├── matching/
    │   ├── match.ts                 # Kandidatenpaare bilden, Cache prüfen, Judge aufrufen
    │   ├── claude-judge.ts          # Anthropic SDK, Structured Output (zod)
    │   └── heuristic-judge.ts       # Mock-Modus ohne ANTHROPIC_API_KEY
    ├── scoring/
    │   ├── trend.ts                 # Trend-Dynamik
    │   ├── margin.ts                # Landed Cost + Marge
    │   ├── competition.ts           # Wettbewerbs-Proxy
    │   ├── score.ts                 # Gesamtscore + Aufschlüsselung
    │   ├── trend.test.ts
    │   ├── margin.test.ts
    │   ├── competition.test.ts
    │   └── score.test.ts
    ├── jobs/
    │   └── collect.ts               # CLI-Einstieg für `npm run collect`
    ├── middleware.ts                # Passwortschutz für alles außer /login
    ├── app/
    │   ├── layout.tsx
    │   ├── globals.css              # Tailwind v4 + Design-Tokens
    │   ├── login/
    │   │   ├── page.tsx
    │   │   └── actions.ts           # Server Action: Passwort prüfen, Cookie setzen
    │   ├── page.tsx                 # Rangliste + Filter (Server Component, Filter via searchParams)
    │   └── produkt/[id]/page.tsx    # Detailansicht mit Score-Aufschlüsselung + Verlauf
    └── components/
        ├── ui/                      # shadcn-Komponenten (nur die genutzten)
        ├── candidate-table.tsx
        ├── filter-bar.tsx
        ├── sparkline.tsx            # kleine Trendkurve in der Tabelle
        ├── trend-chart.tsx          # große Kurve in der Detailansicht
        ├── score-breakdown.tsx
        ├── margin-breakdown.tsx
        └── run-status.tsx           # letzter Lauf, Mock/Live je Quelle
```

Kein `docker-compose.yml`, kein Login-System, keine API-Routen außer dem Nötigsten (Filter laufen über `searchParams` + Server Components, Login über Server Action).

---

## 3. Prisma-Schema

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum RunStatus {
  RUNNING
  SUCCEEDED
  PARTIAL      // mind. eine Quelle fehlgeschlagen, Rest gespeichert
  FAILED
}

enum Country {
  DE
  AT
  CH
  GB
}

/// Ein Durchlauf von `npm run collect`. Jeder Lauf ist ein Snapshot.
model Run {
  id            String      @id @default(cuid())
  startedAt     DateTime    @default(now())
  finishedAt    DateTime?
  status        RunStatus   @default(RUNNING)
  sourceModes   Json        // { "google-trends": "mock" | "live", "aliexpress": ..., "claude": ... }
  configVersion String      // Hash der radar.config.ts-Werte → Scores bleiben nachvollziehbar
  errors        Json?       // gesammelte Adapter-Fehler

  demandSignals   DemandSignal[]
  supplyOffers    SupplyOffer[]
  referencePrices ReferencePrice[]
  candidates      CandidateSnapshot[]

  @@index([startedAt])
}

/// Normalisiertes Nachfrage-Signal: ein Keyword in einem Land, Zeitreihe in Wochen.
model DemandSignal {
  id        String   @id @default(cuid())
  runId     String
  run       Run      @relation(fields: [runId], references: [id], onDelete: Cascade)
  source    String   // "google-trends"
  country   Country
  keyword   String   // normalisiert (lowercase, getrimmt)
  seedTerm  String?  // aus welchem Seed das Keyword entdeckt wurde
  series    Json     // [{ weekStart: "2026-06-01", value: 0..100 }, ...]
  fetchedAt DateTime
  raw       Json     // unveränderte API-Antwort bzw. Mock-Rohdaten

  candidates CandidateSnapshot[]

  @@unique([runId, source, country, keyword])
  @@index([keyword, country])
}

/// Stabile Identität eines Produkts über Läufe hinweg.
model SupplyProduct {
  id          String   @id @default(cuid())
  source      String   // "aliexpress"
  externalId  String
  title       String
  url         String
  imageUrl    String?
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @updatedAt

  offers     SupplyOffer[]
  candidates CandidateSnapshot[]
  judgments  MatchJudgment[]

  @@unique([source, externalId])
}

/// Angebotsdaten eines Produkts in einem Lauf (Preise ändern sich → pro Lauf speichern).
model SupplyOffer {
  id             String        @id @default(cuid())
  runId          String
  run            Run           @relation(fields: [runId], references: [id], onDelete: Cascade)
  productId      String
  product        SupplyProduct @relation(fields: [productId], references: [id])
  keyword        String        // Suchbegriff, über den das Angebot gefunden wurde
  shipTo         Country
  price          Decimal       @db.Decimal(10, 2)
  currency       String        // ISO 4217
  shippingCost   Decimal?      @db.Decimal(10, 2) // null → Config-Annahme greift
  orders30d      Int?
  rating         Float?        // 0..100 (AliExpress evaluate_rate)
  resultCount    Int?          // Trefferanzahl der Suche = Anbieter-Proxy
  fetchedAt      DateTime
  raw            Json

  candidates CandidateSnapshot[]

  @@unique([runId, productId, keyword, shipTo])
  @@index([keyword])
}

/// Westlicher Referenz-Verkaufspreis je Keyword und Land (Quelle: siehe E1).
model ReferencePrice {
  id          String   @id @default(cuid())
  runId       String
  run         Run      @relation(fields: [runId], references: [id], onDelete: Cascade)
  source      String   // "google-shopping" | "config-multiplier"
  country     Country
  keyword     String
  medianPrice Decimal  @db.Decimal(10, 2) // brutto, inkl. USt
  currency    String
  sampleSize  Int
  fetchedAt   DateTime
  raw         Json

  @@unique([runId, source, country, keyword])
}

/// Cache der KI-Bewertung: gleiches Paar Keyword ↔ Produkt wird nicht erneut bezahlt.
model MatchJudgment {
  id         String        @id @default(cuid())
  keyword    String
  productId  String
  product    SupplyProduct @relation(fields: [productId], references: [id])
  judge      String        // "claude:<modell>" | "heuristic"
  relevance  Float         // 0..1
  category   String        // aus der festen Kategorieliste der Config
  reason     String        // Begründung auf Deutsch
  createdAt  DateTime      @default(now())

  @@unique([keyword, productId, judge])
}

/// Ergebnis eines Laufs: ein Drop-Kandidat mit allen Teil-Scores.
model CandidateSnapshot {
  id              String        @id @default(cuid())
  runId           String
  run             Run           @relation(fields: [runId], references: [id], onDelete: Cascade)
  productId       String
  product         SupplyProduct @relation(fields: [productId], references: [id])
  demandSignalId  String
  demandSignal    DemandSignal  @relation(fields: [demandSignalId], references: [id])
  supplyOfferId   String
  supplyOffer     SupplyOffer   @relation(fields: [supplyOfferId], references: [id])
  country         Country
  keyword         String
  category        String
  relevance       Float

  trendScore       Float   // 0..1
  marginScore      Float   // 0..1
  competitionScore Float   // 0..1 (1 = wenig Wettbewerb)
  totalScore       Float   // 0..100

  landedCost      Decimal @db.Decimal(10, 2) // in Landeswährung
  referencePrice  Decimal @db.Decimal(10, 2)
  marginAbs       Decimal @db.Decimal(10, 2)
  marginPct       Float
  currency        String

  breakdown       Json    // vollständige Rechenwege aller Teil-Scores (für die Detailansicht)

  @@unique([runId, productId, country, keyword])
  @@index([runId, totalScore])
  @@index([productId, country])
}
```

Verlauf über Wochen = alle `CandidateSnapshot` eines Produkts/Landes über alle Läufe (Score-Historie) plus die `DemandSignal.series` des letzten Laufs (Trendkurve).

---

## 4. Adapter-Interfaces (`src/sources/types.ts`)

```ts
export type Country = "DE" | "AT" | "CH" | "GB";
export type SourceMode = "live" | "mock";

/** Gemeinsame Hülle jedes normalisierten Datensatzes. */
export interface SourceRecord<TRaw = unknown> {
  source: string;        // z. B. "google-trends"
  country: Country;
  fetchedAt: Date;
  raw: TRaw;             // unverändert, für Nachvollziehbarkeit
}

interface SourceBase {
  readonly id: string;            // stabil, landet in der DB
  readonly label: string;         // deutsch, fürs Dashboard
  readonly mode: SourceMode;      // "mock", sobald der Key fehlt – automatisch
}

// ── Nachfrage ─────────────────────────────────────────
export interface TrendPoint { weekStart: string; value: number } // 0..100

export interface DemandRecord extends SourceRecord {
  keyword: string;
  seedTerm: string | null;
  series: TrendPoint[];            // wöchentlich, älteste zuerst
}

export interface TrendSource extends SourceBase {
  /** Neue, steigende Keywords rund um die Seeds finden (z. B. "rising related queries"). */
  discoverKeywords(seeds: string[], country: Country): Promise<{ keyword: string; seedTerm: string }[]>;
  /** Zeitreihen für konkrete Keywords laden. */
  fetchSeries(keywords: string[], country: Country): Promise<DemandRecord[]>;
}

// ── Angebot ───────────────────────────────────────────
export interface SupplyRecord extends SourceRecord {
  externalId: string;
  keyword: string;
  title: string;
  url: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  shippingCost: number | null;
  orders30d: number | null;
  rating: number | null;
  resultCount: number | null;
}

export interface SupplySource extends SourceBase {
  search(keyword: string, shipTo: Country, limit: number): Promise<SupplyRecord[]>;
}

// ── Referenzpreis (abhängig von E1) ──────────────────
export interface PriceRecord extends SourceRecord {
  keyword: string;
  medianPrice: number;  // brutto
  currency: string;
  sampleSize: number;
}

export interface PriceSource extends SourceBase {
  referencePrice(keyword: string, country: Country): Promise<PriceRecord | null>;
}
```

Jeder Adapter wird über eine Factory erzeugt: `createGoogleTrendsSource(env)` gibt die Live-Implementierung zurück, wenn `SERPAPI_API_KEY` gesetzt ist, sonst die Mock-Implementierung mit identischem Interface. Der Collect-Job kennt nur die Interfaces.

**Phase-2-Vorbereitung:** 1688 → weitere `SupplySource`; TikTok Creative Center / Meta Ad Library → weitere `TrendSource`; Bildähnlichkeit → zweiter Judge neben `claude-judge.ts`. In Phase 1 wird dafür **kein** Code angelegt, nur die Stelle in `registry.ts` dokumentiert.

### 4.1 Google Trends via SerpApi
- `discoverKeywords`: `engine=google_trends`, `data_type=RELATED_QUERIES`, `geo=<Land>`, `date=today 3-m` → nur der Block **„rising“** (inkl. „Breakout“). Das ist der eigentliche Frühindikator.
- `fetchSeries`: `engine=google_trends`, `data_type=TIMESERIES`, `date=today 12-m`, bis zu 5 Keywords pro Request → 52 Wochenwerte.
- Hinweis: Trends-Werte sind **relativ je Request** (0–100). Darum vergleicht die Trend-Dynamik jedes Keyword nur mit seiner eigenen Vergangenheit, nie Keywords untereinander. Jedes Keyword wird einzeln abgefragt, damit die Normierung nicht von Nachbar-Keywords abhängt (kostet mehr Requests, ist aber korrekt; Limit in der Config).
- Kostenkontrolle: `maxSeedsPerCountry`, `maxKeywordsPerCountry` in der Config.

### 4.2 AliExpress Open Platform
- Methode `aliexpress.affiliate.product.query` über `https://api-sg.aliexpress.com/sync`, HMAC-SHA256-Signatur, Parameter `keywords`, `target_currency=EUR|GBP`, `target_language=DE|EN`, `ship_to_country`, `sort=LAST_VOLUME_DESC`, `page_size`.
- ENV: `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID`.
- Genutzte Felder: `product_id`, `product_title`, `product_detail_url`, `product_main_image_url`, `target_sale_price`, `lastest_volume`, `evaluate_rate`, Gesamttrefferzahl.
- Versandkosten liefert die Affiliate-API nicht verlässlich → Config-Annahme (siehe 5.2).

### 4.3 Mock-Modus
- Greift pro Adapter automatisch, wenn der jeweilige Key fehlt; der Modus wird im `Run.sourceModes` gespeichert und im Dashboard als Badge angezeigt („Demo-Daten“).
- Ein gemeinsamer, konsistenter Mock-Katalog (~30 realistische Trendprodukte, z. B. Sonnenuntergangslampe, Mini-Waffeleisen, magnetische Powerbank, Eisroller, Astronauten-Projektor, Wolkenlampe, faltbarer Wasserkocher …) mit unterschiedlichen Kurvenformen: früher Anstieg, Breakout, Plateau, Abschwung, saisonal, Rauschen. So zeigt die Demo, dass das Scoring Frühphase von Sättigung unterscheidet.
- Deterministischer Seed-RNG (Seed = Kalenderwoche) → wiederholte Läufe in derselben Woche sind stabil, über Wochen entsteht echte Historie.

---

## 5. Matching mit Claude

1. Für jedes Keyword (pro Land) die Top-N AliExpress-Treffer holen (`supplyResultsPerKeyword`, Default 8).
2. Pro Keyword **ein** Claude-Request mit allen N Produkttiteln (statt N Requests) → Antwort als Structured Output (zod-Schema via `client.messages.parse` + `zodOutputFormat`):
   `{ matches: [{ externalId, relevance: 0..1, category: <Enum aus Config>, reason: string }] }`
3. Modell aus `ANTHROPIC_MODEL`, `output_config.effort: "low"` (reine Klassifikation). `stop_reason === "refusal"` oder API-Fehler → Heuristik für dieses Keyword, Fehler im `Run.errors`.
4. Ergebnis landet im `MatchJudgment`-Cache (Schlüssel Keyword + Produkt + Modell) → gleiche Paare werden in späteren Läufen nicht erneut bezahlt.
5. Nur Paare mit `relevance >= minRelevance` (Config) werden gescort.
6. **Mock-Modus** ohne `ANTHROPIC_API_KEY`: Heuristik aus Token-Überlappung (Keyword ↔ Titel, mit einfacher DE/EN-Synonymliste aus der Config) + Kategorie per Schlüsselwort-Mapping aus der Config.

---

## 6. Scoring-Formel (reine Funktionen, alle Parameter aus `radar.config.ts`)

### 6.1 Trend-Dynamik `T ∈ [0,1]`
Eingabe: 52 Wochenwerte `v₁…v₅₂` (älteste zuerst).

```
recent   = mean(v₄₉…v₅₂)                    // letzte 4 Wochen
previous = mean(v₄₅…v₄₈)                    // 4 Wochen davor
baseline = mean(v₁…v₄₄)                     // Rest des Jahres

growth   = (recent − previous) / max(previous, growthFloor)     // growthFloor z. B. 5
G        = growth ≤ 0 ? 0 : growth / (growth + growthHalfSat)   // sättigend, 0..1
E        = 1 − min(1, baseline / earlyBaselineCap)             // Frühphase: kaum Vorgeschichte → hoch
L        = recent / 100                                        // absolutes Niveau (bewusst schwach gewichtet)

T = wGrowth·G + wEarly·E + wLevel·L      mit wGrowth + wEarly + wLevel = 1
    Default: wGrowth 0.55, wEarly 0.35, wLevel 0.10
```
Zusätzlich `T = 0`, wenn `recent < minRecentInterest` (Rauschen bei Mini-Suchvolumen).

Warum so: Ein Produkt, das von fast null auf 40 steigt, bekommt einen hohen Score (G hoch, E hoch). Ein Produkt, das seit Monaten bei 100 steht (Bestseller, „zu spät“), bekommt G ≈ 0, E ≈ 0 und nur den kleinen L-Anteil.

### 6.2 Marge `M ∈ [0,1]`
Alle Beträge werden zuerst per Config-FX in die Landeswährung umgerechnet (EUR für DE/AT, CHF für CH, GBP für GB).

```
einkauf    = AliExpress-Preis
versand    = shippingCost aus API  ??  config.shipping[land].perItem
zollwert   = einkauf + versand
zoll       = customsDuty(zollwert, kategorie, land)   // Satz je Kategorie + Freigrenze/Pauschale aus Config
eust       = (zollwert + zoll) · vatRate[land]        // DE 19 %, AT 20 %, CH 8,1 %, GB 20 %
landed     = zollwert + zoll + eust + handling        // „Landed Cost“ wie gefordert, inkl. EUSt
```

Marge (siehe E2 zur USt-Behandlung):
```
Regelbesteuert (Default):    netVK = refPreis / (1 + vatRate);  kosten = landed − eust
Kleinunternehmer:            netVK = refPreis;                  kosten = landed
gebühren = netVK · paymentFeePct + paymentFeeFixed
marginAbs = netVK − kosten − gebühren
marginPct = marginAbs / netVK
M = clamp((marginPct − minMarginPct) / (targetMarginPct − minMarginPct), 0, 1)
```

### 6.3 Wettbewerb `C ∈ [0,1]` (1 = wenig Wettbewerb)
Phase-1-Proxy aus AliExpress:
```
anbieter  = log10(1 + resultCount)       normiert an config.competition.resultCountCap
volumen   = log10(1 + Σ orders30d TopN)  normiert an config.competition.ordersCap
sättigung = wResults·anbieter + wOrders·volumen
C = 1 − clamp(sättigung, 0, 1)
```

### 6.4 Gesamtscore
```
score = 100 · relevance^relevanceExponent · (wT·T + wM·M + wC·C)
Default: wT 0.50, wM 0.35, wC 0.15, relevanceExponent 1
Hartfilter: marginAbs < minMarginAbs → Kandidat wird gespeichert, aber als „unter Mindestmarge“ markiert und nach unten sortiert.
```

`breakdown` (JSON) speichert jeden Zwischenwert (recent, previous, baseline, G, E, L, alle Kostenposten, Satz-Quellen, Gewichte), damit die Detailansicht Zeile für Zeile zeigt, **warum** ein Produkt oben steht.

### 6.5 Tests (Vitest)
- Trend: steigendes Frühphase-Keyword > gesättigtes Hoch-Plateau; fallend → G = 0; Division durch ~0 abgesichert; unter `minRecentInterest` → 0; zu kurze Serie → Fehler.
- Marge: exakte Beispielrechnung DE (19 %) und GB (20 %) von Hand nachgerechnet; Zoll-Freigrenze/Pauschale; FX-Umrechnung; regelbesteuert vs. Kleinunternehmer; fehlende Versandkosten → Config-Wert.
- Wettbewerb: Monotonie (mehr Anbieter → kleineres C), Grenzen 0/1.
- Score: Gewichte summieren sich zu 1 (Config-Validierung), Mindestmarge-Markierung, Aufschlüsselung vollständig.

---

## 7. Collect-Skript (`npm run collect`)

1. ENV validieren, Adapter per Factory erzeugen (live/mock), `Run` anlegen.
2. Pro Land: Keywords entdecken (Seeds aus Config) → Zeitreihen laden → `DemandSignal`.
3. Vorfilter: nur Keywords mit `T > minTrendScoreForSupply` gehen weiter (spart AliExpress- und Claude-Aufrufe).
4. Pro Keyword/Land: AliExpress-Suche → `SupplyProduct` upsert + `SupplyOffer`; Referenzpreis → `ReferencePrice`.
5. Matching (Cache → Claude oder Heuristik) → `MatchJudgment`.
6. Scoring → `CandidateSnapshot`.
7. `Run` abschließen (SUCCEEDED / PARTIAL / FAILED), kompakte Zusammenfassung auf stdout, Exit-Code ≠ 0 bei FAILED (für Railway-Cron-Monitoring).

Fehler einer Quelle brechen den Lauf nicht ab; sie landen in `Run.errors`. Nebenläufigkeit pro Quelle begrenzt (Config), mit Pausen gegen Rate-Limits.

**Kostenschutz:** Wenn mindestens ein Adapter im Live-Modus ist, gibt das Skript vorher aus, welche kostenpflichtigen Quellen mit wie vielen geschätzten Requests aufgerufen werden, und verlangt `--live` als Flag. Ohne `--live` bricht es ab. So kann nichts versehentlich Geld kosten.

---

## 8. Dashboard

- **Passwortschutz:** `middleware.ts` prüft ein HMAC-signiertes Cookie (`DASHBOARD_PASSWORD` + `SESSION_SECRET`); `/login` mit einem Passwortfeld. Kein Nutzerkonzept.
- **Rangliste (`/`):** Tabelle mit Rang, Produktbild, Titel, Keyword, Land, Kategorie, Score (Balken), Sparkline der Trendkurve, Marge € / %, Quelle(n), Link zu AliExpress. Sortierbar nach Score, Marge, Trend. Filter Land und Kategorie über URL-Parameter (teilbar, Zurück-Taste funktioniert). Leer-, Lade- und Fehlerzustände. Badge „Demo-Daten“ je Quelle im Mock-Modus. Standardansicht: letzter erfolgreicher Lauf.
- **Detail (`/produkt/[id]?land=DE`):** große Trendkurve (52 Wochen, Markierung der 4+4 Vergleichswochen), Score-Aufschlüsselung (T, M, C mit Gewichten und Rechenweg), Kostenwasserfall der Landed Cost, Claude-Begründung + Relevanz, Score-Verlauf über alle Läufe, Rohdaten-Zeitstempel.
- **Gestaltung:** frontend-design-Skill beim Dashboard-Meilenstein; Richtung „internes Analyse-Werkzeug“: dunkel, hohe Informationsdichte, Tabellenzahlen in Monospace/tabular-nums, eine Akzentfarbe für Trend-Momentum. Alle UI-Texte Deutsch, Zahlen/Währungen mit `Intl` in `de-DE`.

---

## 9. ENV-Variablen (`.env.example`)

| Variable | Pflicht | Zweck |
|---|---|---|
| `DATABASE_URL` | ja | PostgreSQL (lokal oder Railway) |
| `DASHBOARD_PASSWORD` | ja | Passwort fürs Dashboard |
| `SESSION_SECRET` | ja | Signatur des Login-Cookies (≥ 32 Zeichen) |
| `SERPAPI_API_KEY` | nein | leer → Google Trends (und ggf. Shopping) im Mock-Modus |
| `ALIEXPRESS_APP_KEY` | nein | leer → AliExpress im Mock-Modus |
| `ALIEXPRESS_APP_SECRET` | nein | dito |
| `ALIEXPRESS_TRACKING_ID` | nein | dito |
| `ANTHROPIC_API_KEY` | nein | leer → heuristisches Matching |
| `ANTHROPIC_MODEL` | nein | Default `claude-opus-5`; für geringere Kosten z. B. `claude-sonnet-5` |

---

## 10. Abhängigkeiten

Laufzeit:
| Paket | Version | Zweck |
|---|---|---|
| `next` | 15.5.x | App Router |
| `react`, `react-dom` | 19.x | |
| `@prisma/client` | 7.10.x | ORM |
| `@prisma/adapter-pg`, `pg` | 7.10.x / 8.x | Prisma 7 benötigt einen Treiber-Adapter |
| `@anthropic-ai/sdk` | aktuell (0.128.x) | Claude-Matching |
| `zod` | 4.x | ENV-Validierung, Structured Output-Schema |
| `recharts` | 3.x | Trendkurven (über shadcn `chart`) |
| `lucide-react` | aktuell | Icons |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` | aktuell | shadcn/ui-Grundlage |
| `@radix-ui/*` | nur für tatsächlich genutzte shadcn-Komponenten (Select, Tooltip, Slot, …) | |

Entwicklung:
| Paket | Zweck |
|---|---|
| `typescript` 5.x, `@types/node`, `@types/react`, `@types/react-dom`, `@types/pg` | |
| `prisma` 7.10.x | CLI, Migrationen |
| `tailwindcss` 4.x, `@tailwindcss/postcss` | |
| `eslint`, `eslint-config-next` | `next build` Linting |
| `vitest` | Unit-Tests |
| `tsx` | Collect-Skript ohne Build ausführen |
| `dotenv` | ENV für Skript und `prisma.config.ts` |

Keine weiteren Pakete ohne Rückfrage.

`package.json`-Skripte: `dev`, `build` (`prisma generate && next build`), `start`, `collect` (`tsx src/jobs/collect.ts`), `test` (`vitest run`), `db:migrate` (`prisma migrate dev`), `db:deploy` (`prisma migrate deploy`), `lint`.

---

## 11. Railway

- Service 1 „web“: `npm run build` / `npm run start`, `db:deploy` als Pre-Deploy-Command.
- Service 2 „collect“: gleiches Repo, Start-Command `npm run collect -- --live`, Cron-Schedule z. B. `0 5 * * 1` (montags 05:00 UTC, Google-Trends-Wochenwerte sind dann vollständig).
- PostgreSQL-Plugin, `DATABASE_URL` in beide Services referenzieren.

---

## 12. Meilensteine (Schritt 2)

1. **Grundgerüst + DB:** Next.js 15, Tailwind 4, shadcn init, Prisma-Schema + erste Migration, `env.ts`, `radar.config.ts` (mit Validierung), `.env.example`, `.gitignore`.
2. **Adapter mit Mock-Modus:** Interfaces, Registry, Google Trends (live + mock), AliExpress (live + mock, Signatur), Referenzpreis (gemäß E1).
3. **Matching + Scoring mit Tests:** Claude-Judge + Heuristik + Cache; trend/margin/competition/score + Vitest grün.
4. **Collect-Skript:** kompletter Lauf im Mock-Modus gegen lokale PostgreSQL, `--live`-Schutz.
5. **Dashboard:** Login, Rangliste, Filter, Detailansicht, README.

Nach jedem Meilenstein: Commit + „✅ …“. Echte APIs werden von mir **nicht** aufgerufen (keine Keys vorhanden, und nur nach Rückfrage).

---

## 13. Offene Entscheidungen – bitte vor Freigabe beantworten

**E1 – Woher kommt der westliche Referenz-Verkaufspreis?**
Die Architektur verlangt ihn, nennt aber keine Quelle; Amazon-Scraping ist ausgeschlossen.
- **(a) Empfehlung:** SerpApi `google_shopping` (gleicher Key wie Trends, offizieller bezahlter Datendienst) → Median der Preise der Top-Treffer je Land. Echte Marktpreise, +1 Request pro Keyword/Land. Mock-Modus analog.
- (b) Kein externer Preis: `Einkaufspreis × Kategorie-Multiplikator` aus der Config. Kostenlos, aber die Marge ist dann eine Annahme, keine Messung.
- Mit (a) baue ich (b) als Fallback ein, wenn Shopping keine Treffer liefert (im Dashboard sichtbar markiert).

**E2 – Umsatzsteuer-Behandlung in der Marge.**
Ihr habt „Landed Cost inkl. EUSt 19 % / UK VAT 20 %“ vorgegeben. Wenn nexana regelbesteuert ist, ist die EUSt als Vorsteuer abziehbar; korrekt ist dann „Netto-VK minus Netto-Kosten“. Rechnet man EUSt in die Kosten und vergleicht mit dem Brutto-VK, wird die Marge falsch (zu hoch).
- **Empfehlung:** Landed Cost inkl. EUSt wird wie gefordert berechnet und angezeigt; die Marge rechnet per Config-Schalter `vatMode: "regelbesteuert" | "kleinunternehmer"` korrekt. Default regelbesteuert.

**E3 – Prisma 7.** Aktuelle stabile Version ist 7.10 (npm `latest` zeigt gerade einen 8.0-Release-Candidate, den ich bewusst nicht nehme). Prisma 7 braucht `@prisma/adapter-pg` + `pg` und eine `prisma.config.ts`. Einverstanden, oder lieber Prisma 6?

**E4 – Zoll-Annahmen EU.** Ich lege Zollsätze pro Kategorie und die Behandlung von Kleinsendungen in die Config. Für EU-Kleinsendungen gehe ich von der seit 1. Juli 2026 geplanten Pauschale von 3 € je Artikel statt der früheren 150-€-Zollfreigrenze aus, für UK von der 135-£-Grenze (darunter kein Zoll, VAT beim Verkauf). Beides wird als `// ANNAHME:` markiert und ist ein Config-Wert. Bitte bestätigen oder korrigieren, falls euer Versandmodell (z. B. Sammelimport statt Einzelversand an Endkunden) anders aussieht.

Weitere Annahmen (Seeds, Versandpauschalen, FX-Kurse, Gebühren) treffe ich selbst, markiere sie mit `// ANNAHME:` und liste sie am Ende auf.
