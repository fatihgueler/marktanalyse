# PLAN – Trend-Radar Phase 2

Status: **Freigegeben mit Entscheidungen F1–F4** (siehe Abschnitt 8).

---

## 1. Was die Recherche ergeben hat (Stand September 2026)

Grundregel aus Phase 1: nur offizielle APIs oder bezahlte Datendienste, kein Scraping.

| Quelle | Offizieller Zugang? | Voraussetzungen | Was wir bekommen | Einschränkung |
|---|---|---|---|---|
| **Meta Ad Library API** | ✅ ja (Graph API `ads_archive`) | Meta-Entwickler-App + Identitätsprüfung einer Person; Token läuft nach 60 Tagen ab | Anzeigen zu einem Suchbegriff je Land: Startdatum, Seite/Werbetreibender, Anzeigentexte, Link zur Vorschau, EU-Reichweite | Nicht-politische Anzeigen nur, wenn sie **die EU erreicht haben** → **DE, AT: ja; GB und CH: nein** |
| **TikTok Commercial Content API** | ⚠️ ja, aber mit Antrag | Entwickler-Account + Antrag, den TikTok prüft; offiziell „für Öffentlichkeit und Forschende“, laut Drittquellen werden kommerzielle Antragsteller abgelehnt | Anzeigen nach Suchbegriff, Land und Zeitraum; Reichweite; Veröffentlichungsdatum | Zurzeit nur EU-Anzeigen; ob nexana zugelassen wird, ist offen |
| **TikTok Creative Center** (Trends, Top Products) | ❌ keine API | – | – | Nur über Scraper erreichbar → **ausgeschlossen** |
| **1688 Open Platform** | ⚠️ ja, aber nur für Firmen mit chinesischer Gewerbeanmeldung (营业执照) | Chinesische Firma oder zugelassener Einkaufsagent (代采商) mit API-Zugang | Stichwort- und Bildsuche, Produktdetails mit Staffelpreisen | Für nexana als deutsche Firma nicht direkt zugänglich |
| **1688 über Datendienst** (z. B. OTCommerce/Otapi) | bezahlter Dienst | API-Key, ab ca. 150 $ | Suche, Details, Staffelpreise, Versandarten | **Woher der Dienst die Daten hat, legt er nicht offen** → Risiko: indirektes Scraping |

Quellen: [TikTok Commercial Content API](https://developers.tiktok.com/products/commercial-content-api), [TikTok Getting Started](https://developers.tiktok.com/docs/en/commercial-content-api-getting-started), [Meta ads_archive](https://developers.facebook.com/docs/graph-api/reference/ads_archive/), [Meta ArchivedAd](https://developers.facebook.com/docs/marketing-api/reference/archived-ad/), [1688 Open Platform](https://open.1688.com/), [1688 Cross-Border-Lösung](https://open.1688.com/solution/solutionDetail.htm?solutionKey=1697014160788), [OTCommerce](https://otcommerce.com/1688-com/)

**Folgerung:** Werbebibliotheken (Meta, TikTok) liefern keine Suchinteresse-Kurve wie Google Trends, sondern **Werbeaktivität**. Die ist ein starkes Signal in zwei Richtungen:
- **Wettbewerb:** Wie viele westliche Shops bewerben das Produkt schon? Das ist ein viel besserer Proxy als die Trefferzahl auf AliExpress.
- **Marktdynamik:** Wie viele *neue* Anzeigen sind in den letzten 4 Wochen gestartet? Steigt das, erhitzt sich der Markt.

In Phase 1 hatte ich geschrieben, TikTok und Meta würden als `TrendSource` angebunden. Das wäre fachlich falsch: Anzeigenzahlen in die Trend-Formel zu pressen, würde den Trend-Score verzerren. Deshalb gibt es ein **eigenes Interface `AdSignalSource`**. Das ist die einzige Stelle, an der Collect-Job und Dashboard erweitert werden müssen.

---

## 2. Umfang Phase 2 (Vorschlag)

| # | Baustein | Live-fähig ohne weitere Klärung? |
|---|---|---|
| 2a | **Meta Ad Library** als `AdSignalSource` (DE, AT) | ja, sobald ein Token vorliegt |
| 2b | **TikTok Commercial Content API** als `AdSignalSource` | Code und Mock fertig, live erst nach Zulassung durch TikTok |
| 2c | **1688** als zweite `SupplySource` mit Großhandels-Kalkulation | hängt von **F1** ab |
| 2d | **Bildähnlichkeit** zum Verknüpfen gleicher Produkte über Quellen hinweg | ja (über Claude, keine neue Abhängigkeit) |
| 2e | **Drop-Feedback + Kalibrierung**: Ergebnisse echter Drops erfassen, mit Scores vergleichen | ja |

Jede neue Quelle bekommt wie in Phase 1 einen Mock-Modus, der ohne Key automatisch greift, und den `--live`-Kostenschutz.

---

## 3. Architektur-Erweiterungen

### 3.1 Neues Interface (`src/sources/types.ts`)

```ts
export interface AdRecord extends SourceRecord {
  keyword: string;
  /** aktive Anzeigen zum Suchbegriff (gedeckelt durch maxAdsPerKeyword) */
  activeAds: number;
  /** verschiedene Werbetreibende (Seiten/Accounts) */
  advertisers: number;
  /** neu gestartete Anzeigen je Woche, älteste zuerst (für Marktdynamik) */
  newAdsPerWeek: { weekStart: string; count: number }[];
  /** frühestes Startdatum einer aktiven Anzeige */
  firstSeen: Date | null;
  /** bis zu 5 Beispiel-Anzeigen (Werbetreibender, Link zur Vorschau) */
  samples: { advertiser: string; startedAt: Date; previewUrl: string | null }[];
  /** false = Quelle deckt dieses Land nicht ab (z. B. Meta in GB/CH) */
  coverage: boolean;
}

export interface AdSignalSource extends SourceBase {
  adActivity(keyword: string, country: Country): Promise<AdRecord>;
}
```

### 3.2 1688 als `SupplySource` (falls F1 = a oder b)

1688 ist Großhandel, nicht Einzelversand an Endkunden. Die Kalkulation unterscheidet deshalb zwei **Beschaffungsmodelle**:

- **Direkt** (AliExpress, wie bisher): Einzelversand an den Kunden, Kleinsendungsregeln.
- **Großhandel** (1688): Sammelbestellung über einen Einkaufsagenten → Agentengebühr + Fracht nach Gewicht + regulärer Zoll (die Sendung liegt über 150 €, keine Kleinsendungspauschale) + EUSt, dann Lager in DE und Versand an den Kunden.

Neue Config-Werte (alle als `// ANNAHME:`): Agentengebühr in %, Frachtkosten je kg nach DE, angenommene Losgröße je Drop, Versand Lager → Kunde je Land, Standardgewicht, falls die Quelle keins liefert.

`SupplyRecord` bekommt optionale Felder: `sourcingModel: "direct" | "wholesale"`, `moq`, `priceTiers`, `weightKg`. AliExpress bleibt unverändert.

### 3.3 Produkte über Quellen verknüpfen (2d)

Für jedes gescorte AliExpress-Produkt wird gesucht, ob es auf 1688 **dasselbe Produkt** gibt:
1. Vorfilter über Keyword und Kategorie (kostenlos)
2. **Claude mit Bildern**: das AliExpress-Hauptbild und bis zu 5 Kandidaten-Bilder von 1688 in einem Request → „dasselbe Produkt? 0–1 + Begründung“. Das läuft über das vorhandene Anthropic SDK, also **keine neue Abhängigkeit**.
3. Ergebnis wird gecacht (Tabelle `ProductLink`), ein Paar wird nie zweimal bezahlt.
4. Im Mock-Modus (ohne Bilder, ohne Key): Titel-Heuristik wie beim Matching.

Nutzen: Die Detailansicht zeigt „Bei 1688 ab X € (Losgröße N)“ und die Marge für beide Beschaffungswege nebeneinander.

### 3.4 Scoring-Änderungen

- **Wettbewerb** bekommt eine dritte Komponente **Werbedruck** = log(Anzahl Werbetreibende), gedeckelt. Gewichte als Startwerte: Anbieter 0,25 · Bestellungen 0,25 · Werbedruck 0,50. Ohne Werbedaten (GB, CH, keine Abdeckung) wird die Komponente neutral gewertet, wie in Phase 1 bei fehlenden Angaben.
- **Marktdynamik** (neue Anzeigen der letzten 4 Wochen ggü. den 4 davor) wird zunächst **nur angezeigt, nicht gewichtet**. Ob sie ein positives Signal ist (Nachfrage bestätigt) oder ein negatives (Konkurrenz rückt an), zeigen erst echte Drop-Ergebnisse → Kalibrierung (2e).
- Alle neuen Gewichte und Deckel stehen in `radar.config.ts`, mit Tests wie in Phase 1.

### 3.5 Drop-Feedback und Kalibrierung (2e)

- In der Detailansicht ein kleines Formular: „Gedroppt am …, verkaufte Stück, Retourenquote, Urteil (Top / okay / Flop), Notiz“ (Server Action, kein Nutzerkonzept).
- Neue Seite `/kalibrierung`: Tabelle aller erfassten Drops mit ihrem Score zum Drop-Zeitpunkt und den Teil-Scores, dazu pro Komponente eine einfache Kennzahl, wie gut sie Top von Flop trennt (Mittelwert-Differenz). **Keine automatische Gewichtsanpassung**: Die Seite zeigt Empfehlungen, die Gewichte ändert ihr bewusst in der Config.

### 3.6 Datenbank (nur additive Migration)

Neue Tabellen, **keine Änderung an bestehenden Tabellen oder Daten**:

```prisma
model AdSignal {            // Werbeaktivität je Lauf, Quelle, Land, Keyword
  id, runId → Run, source, country, keyword,
  activeAds Int, advertisers Int, newAdsPerWeek Json, firstSeen DateTime?,
  samples Json, coverage Boolean, fetchedAt DateTime, raw Json
  @@unique([runId, source, country, keyword])
}

model WholesaleTerms {      // Großhandelsdaten zu einem Angebot (1688)
  id, supplyOfferId → SupplyOffer @unique, moq Int?, priceTiers Json, weightKg Float?
}

model ProductLink {         // „dasselbe Produkt“ über Quellen hinweg, gecacht
  id, productAId → SupplyProduct, productBId → SupplyProduct,
  similarity Float, method String, reason String, createdAt
  @@unique([productAId, productBId, method])
}

model DropOutcome {         // echtes Drop-Ergebnis für die Kalibrierung
  id, productId → SupplyProduct, country, keyword, candidateSnapshotId → CandidateSnapshot?,
  droppedAt DateTime, unitsSold Int?, returnRate Float?, verdict String, note String?, createdAt
}
```

Hinweis: Prisma ergänzt an den bestehenden Modellen nur die Rückbeziehungen im Schema. Die erzeugen **keine Spalten** in bestehenden Tabellen; die Migration enthält ausschließlich `CREATE TABLE` und Fremdschlüssel auf den neuen Tabellen. Ich zeige dir die generierte SQL-Datei vor dem Anwenden.

Neue Werte im Snapshot landen im bestehenden JSON-Feld `breakdown` (Werbedruck, Marktdynamik, 1688-Alternative), dafür ist keine Spaltenänderung nötig.

### 3.7 Dashboard

- **Rangliste:** neue Spalte „Werbung“ (Werbetreibende + Pfeil für Marktdynamik), Hinweis-Badge „auch bei 1688“.
- **Detail:** Abschnitt „Werbeaktivität“ (Anzahl, Werbetreibende, erste Anzeige, Mini-Kurve neuer Anzeigen je Woche, Links zu den Vorschauen der Anzeigen); Abschnitt „Beschaffung“ mit AliExpress und 1688 nebeneinander; Formular fürs Drop-Ergebnis.
- **Neu:** `/kalibrierung`.

---

## 4. ENV-Variablen (neu, alle optional)

| Variable | Zweck |
|---|---|
| `META_ACCESS_TOKEN` | Langlebiger Token für die Ad Library API (60 Tage gültig). Leer → Mock. |
| `META_APP_ID`, `META_APP_SECRET` | Optional: damit `collect` vor Ablauf warnt und den Token verlängern kann |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Commercial Content API nach Zulassung. Leer → Mock. |
| je nach F1: `SUPPLY_1688_…` | Zugangsdaten zum gewählten 1688-Weg |

## 5. Abhängigkeiten

**Keine neuen Pakete.** Meta und TikTok laufen über `fetch` (wie SerpApi), die Bildähnlichkeit über das vorhandene `@anthropic-ai/sdk`.

## 6. Meilensteine

1. Interface `AdSignalSource`, additive Migration, Mock-Werbedaten im Katalog
2. Meta Ad Library (live + Mock), TikTok Commercial Content API (live + Mock)
3. Scoring: Werbedruck im Wettbewerb, Marktdynamik als Info, Tests
4. 1688-Adapter + Großhandels-Kalkulation + Bildähnlichkeit (je nach F1), Tests
5. Drop-Feedback + `/kalibrierung`
6. Dashboard-Erweiterungen, README, Liste der neuen `// ANNAHME:`-Stellen

Nach jedem Meilenstein: Commit, Push, „✅ …“.

---

## 7. Offene Entscheidungen

**F1 – 1688: Welcher Weg?**
- (a) **Über einen Einkaufsagenten mit offiziellem 1688-Zugang.** Ihr bräuchtet einen Agenten, der euch API-Zugang gibt oder Daten liefert. Ich baue den Adapter gegen die offizielle 1688-Schnittstelle, live, sobald Zugangsdaten da sind. Sauberste Lösung, aber ihr müsst einen Agenten finden.
- (b) **Bezahlter Datendienst wie OTCommerce** (ab ca. 150 $). Sofort nutzbar, aber die Datenherkunft ist nicht offengelegt, sodass wir womöglich indirekt Scraping nutzen, was eure Grenzen ausschließen. Nur mit eurer ausdrücklichen Zustimmung.
- (c) **1688 vorerst weglassen**, nur Adapter-Schnittstelle vorbereiten, Rest von Phase 2 umsetzen. Bildähnlichkeit (2d) entfällt dann, weil es noch keine zweite Quelle gibt.

**F2 – TikTok:** Soll ich den Adapter trotz unsicherer Zulassung bauen (Mock sofort, live nach Zulassung), oder weglassen, bis ihr den Antrag gestellt und eine Antwort habt?

**F3 – Werbedruck im Score:** Einverstanden, dass Werbedruck mit Gewicht in den Wettbewerbs-Score eingeht, die Marktdynamik aber erst nur angezeigt wird, bis Kalibrierungsdaten vorliegen?

**F4 – Drop-Feedback (2e):** Mit umsetzen? Es ist die Grundlage dafür, dass die Gewichte irgendwann auf euren echten Ergebnissen beruhen statt auf meinen Startwerten.

---

## 8. Entscheidungen (freigegeben)

- **F1 → (c):** 1688 vorerst weglassen. Die Schnittstelle `SupplySource` ist bereits vorhanden; es entstehen **keine** Tabellen `WholesaleTerms`/`ProductLink` und keine Bildähnlichkeit, bis es eine zweite Einkaufsquelle gibt.
- **F2:** TikTok-Adapter bauen, Mock sofort, live nach Zulassung.
- **F3:** Werbedruck gewichtet im Wettbewerb, Marktdynamik nur anzeigen.
- **F4:** Drop-Feedback und `/kalibrierung` umsetzen.

Damit reduziert sich die Migration auf die neuen Tabellen `AdSignal` und `DropOutcome`. Meilenstein 4 (1688) entfällt.

Technische Details aus der Doku:
- Meta: `GET https://graph.facebook.com/v26.0/ads_archive` mit `search_terms`, `ad_reached_countries=["DE"]`, `ad_type=ALL`, `ad_active_status=ACTIVE`, `search_type=KEYWORD_EXACT_PHRASE`, Feldern `id,page_id,page_name,ad_delivery_start_time,ad_snapshot_url`.
- TikTok: Client-Token über `POST https://open.tiktokapis.com/v2/oauth/token/` (`grant_type=client_credentials`, 2 h gültig); Anzeigen über `POST https://open.tiktokapis.com/v2/research/adlib/ad/query/` mit `filters` (Zeitraum, Länder, Status), `search_term`, `search_type`, `max_count` ≤ 10, Paging über `search_id`.
- Beide Bibliotheken decken nicht-politische Anzeigen nur für die **EU** ab → Werbedaten gibt es für **DE und AT**, nicht für CH und GB.

---

## 9. Phase 2b – Scraping über Datendienst (Wunsch: 25.09.2026)

**Entscheidung des Auftraggebers:** Weil viele offizielle APIs nicht zu bekommen sind, wird Scraping eingebunden. Das hebt die Phase-1-Grenze „kein Scraping von TikTok, 1688 …“ bewusst auf.

**Umsetzung:** über den Datendienst **Apify** (REST-API, keine neue Abhängigkeit), nicht mit eigenen Scrapern.
- Eigene Scraper müssten den Bot-Schutz von TikTok und 1688 aktiv umgehen (CAPTCHAs, Fingerprinting, Proxy-Rotation). Solchen Umgehungscode baue ich nicht.
- Apify-Actors sind austauschbar (Actor-ID in der Config) und haben Mock-Modus und `--live`-Schutz wie alle Quellen.
- Harte Kostengrenze je Aufruf über `maxTotalChargeUsd`; **keine automatischen Wiederholungen** (jeder Versuch kostet).

**Quellen:**
| Quelle | Actor (Config) | Rolle | Länder |
|---|---|---|---|
| TikTok Creative Center, Trend-Hashtags | `memo23~tiktok-trending-hashtags-scraper` | `TrendSource`: Hashtags mit Popularitätskurve (120 Tage, 0–100) | laut Actor 27 Märkte; konfiguriert DE, GB |
| 1688 Produktsuche | `songd~1688-search-scraper` | `SupplySource` mit **Großhandels-Kalkulation** (Staffelpreise, Losgröße, Agent, Fracht, regulärer Zoll) | nur DE, AT (Lager in DE) |

**Hashtag → Suchbegriff:** Trend-Hashtags sind oft keine Produkte (#fyp, #fußball). Claude entscheidet, ob ein Hashtag ein Produkt ist, und leitet einen Suchbegriff ab. Im Mock-Modus übernimmt eine Heuristik (Zerlegung in bekannte Produktwörter).

**1688-Suchbegriffe:** 1688 findet nur mit chinesischen Suchbegriffen etwas. Claude übersetzt das Keyword. Ohne Claude-Key wird 1688 im Live-Modus übersprungen.

**Risiken, die ihr bewusst tragt:**
- Die Nutzungsbedingungen von TikTok und 1688 untersagen automatisiertes Auslesen. Das Scraping führt Apify aus, die Daten nutzt ihr. Das Risiko ist vor allem vertraglich (Sperre, Unterlassung). Wir greifen nur auf öffentliche Seiten ohne Login zu.
- **Datenschutz:** Die Hashtag-Daten enthalten Creator-Namen (personenbezogen). Diese werden **vor dem Speichern entfernt**.
- Actor-Ausgaben können sich ohne Vorwarnung ändern. Die Adapter lesen die Felder tolerant und melden Strukturfehler im Lauf.

**Nicht in diesem Schritt:** Bildähnlichkeit (1688 ↔ AliExpress verknüpfen), TikTok-Top-Ads als Werbedaten für GB. Beides steht als nächster Ausbauschritt an.
