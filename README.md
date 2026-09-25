# nexana Trend-Radar

Internes Werkzeug zur **Früherkennung von Drop-Kandidaten**: sammelt regelmäßig Nachfrage-Signale aus DACH und UK, gleicht sie mit Einkaufsquellen in Asien ab und zeigt eine Rangliste mit Margenschätzung. Jeder Score lässt sich in der Detailansicht bis auf die Rohdaten zurückverfolgen.

```
Google Trends (DE/AT/CH/GB) ──► AliExpress ──► Google Shopping ──► Claude-Matching ──► Scoring ──► PostgreSQL ──► Dashboard
   steigende Keywords          Angebote       Referenzpreis       Relevanz+Kategorie   (reine Funktionen)   Snapshot je Lauf
```

**Phase 2** ergänzt Werbedaten aus der **Meta Ad Library** und der **TikTok Ad Library** (wie viele Shops ein Produkt im Zielland schon bewerben) sowie ein **Drop-Feedback** mit Kalibrierungsseite, die zeigt, welche Signale eure echten Erfolge vorhergesagt haben.

**Ohne einen einzigen API-Key vollständig lauffähig:** Fehlt ein Key, läuft die jeweilige Quelle automatisch mit realistischen Demo-Daten. Das Dashboard kennzeichnet Demo-Daten deutlich.

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · shadcn/ui · PostgreSQL + Prisma 7 · Anthropic SDK · Vitest · Deployment auf Railway

## Schnellstart (lokal, Demo-Modus)

Voraussetzungen: Node.js ≥ 20.19 und eine PostgreSQL-Datenbank (≥ 14).

```bash
# 1. Abhängigkeiten (generiert auch den Prisma Client)
npm install

# 2. Umgebungsvariablen
cp .env.example .env
#    In .env mindestens setzen:
#      DATABASE_URL        z. B. postgresql://postgres:postgres@localhost:5432/trend_radar
#      DASHBOARD_PASSWORD  beliebiges Passwort
#      SESSION_SECRET      z. B. Ausgabe von: openssl rand -hex 32

# 3. Datenbank-Schema anlegen
npm run db:migrate

# 4. Einen Datenlauf starten (Demo-Daten, ~3 Sekunden)
npm run collect

# 5. Dashboard starten → http://localhost:3000
npm run dev
```

Noch keine lokale Datenbank? Mit Docker zum Beispiel so:
`docker run -d --name trend-radar-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=trend_radar -p 5432:5432 postgres:16`

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Dashboard im Entwicklungsmodus |
| `npm run build` / `npm run start` | Production-Build / -Server |
| `npm run collect` | Ein kompletter Datenlauf (Snapshot). Mit echten Keys: `npm run collect -- --live` |
| `npm test` | Unit-Tests (Scoring, Marge, Wettbewerb, Matching, Signatur) |
| `npm run db:migrate` | Migrationen lokal anwenden/erstellen |
| `npm run db:deploy` | Migrationen in Produktion anwenden |
| `npm run lint` | ESLint |

## Umgebungsvariablen

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `DATABASE_URL` | ja | PostgreSQL-Verbindung |
| `DASHBOARD_PASSWORD` | ja | Passwort für das Dashboard |
| `SESSION_SECRET` | ja | Signiert das Login-Cookie, mindestens 32 Zeichen. Wer es ändert, meldet alle ab. |
| `SERPAPI_API_KEY` | nein | [SerpApi](https://serpapi.com) für Google Trends **und** Google Shopping. Leer → beide im Demo-Modus. |
| `ALIEXPRESS_APP_KEY` | nein | [AliExpress Open Platform](https://openservice.aliexpress.com), App Key |
| `ALIEXPRESS_APP_SECRET` | nein | App Secret |
| `ALIEXPRESS_TRACKING_ID` | nein | Affiliate-Tracking-ID. Alle drei AliExpress-Werte nötig, sonst Demo-Modus. |
| `ANTHROPIC_API_KEY` | nein | Claude für das Matching. Leer → heuristisches Matching. |
| `ANTHROPIC_MODEL` | nein | Modell für das Matching, Standard `claude-opus-5`. Günstiger: `claude-sonnet-5`. |
| `META_ACCESS_TOKEN` | nein | Meta Ad Library API, langlebiger Token (60 Tage). Leer → Demo-Modus. |
| `META_APP_ID`, `META_APP_SECRET` | nein | Nur für die Warnung, bevor der Meta-Token abläuft |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | nein | TikTok Commercial Content API, nach Zulassung durch TikTok. Leer → Demo-Modus. |
| `APIFY_TOKEN` | nein | Scraping-Dienst [Apify](https://apify.com) für TikTok Creative Center und 1688. Leer → Demo-Modus. **Siehe Abschnitt „Scraping“.** |

Secrets stehen ausschließlich in `.env` (per `.gitignore` ausgeschlossen) bzw. in den Railway-Variablen.

## Von Demo-Daten auf echte APIs umstellen

Jede Quelle schaltet **einzeln** um, sobald ihr Key gesetzt ist. Man kann also schrittweise vorgehen, z. B. erst nur Google Trends live.

1. **Google Trends + Google Shopping:** Account bei SerpApi anlegen, `SERPAPI_API_KEY` setzen. Genutzt werden `engine=google_trends` (steigende verwandte Suchanfragen und 12-Monats-Zeitreihe je Keyword) und `engine=google_shopping` (Median der Endkundenpreise).
2. **AliExpress:** Auf der AliExpress Open Platform eine App mit Zugriff auf die **Affiliate API** anlegen (Methode `aliexpress.affiliate.product.query`), dann `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` und `ALIEXPRESS_TRACKING_ID` setzen.
3. **Claude:** `ANTHROPIC_API_KEY` setzen, optional `ANTHROPIC_MODEL`. Wer ein Modell ohne Effort-Unterstützung nutzt (z. B. Haiku 4.5), setzt in der Config `matching.effort` auf `null`.
4. **Meta Ad Library (kostenlos, aber mit Rate-Limit):**
   1. Auf [facebook.com/ID](https://www.facebook.com/ID) die Identität bestätigen (Pflicht für den Zugriff auf die Ad Library API).
   2. Auf [developers.facebook.com](https://developers.facebook.com) eine App anlegen.
   3. Im [Graph API Explorer](https://developers.facebook.com/tools/explorer/) einen User-Token für die App erzeugen und ihn in einen **langlebigen Token (60 Tage)** tauschen, etwa über den [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) („Extend Access Token“).
   4. `META_ACCESS_TOKEN` setzen. Optional `META_APP_ID` und `META_APP_SECRET`, dann warnt `collect` 10 Tage vor Ablauf. Einen abgelaufenen Token meldet der Lauf als Fehler bei „meta-ad-library“.
5. **TikTok Ad Library:** Auf [developers.tiktok.com](https://developers.tiktok.com/products/commercial-content-api) die **Commercial Content API** beantragen. TikTok prüft jeden Antrag, und ob kommerzielle Antragsteller zugelassen werden, ist nicht garantiert. Nach der Zulassung `TIKTOK_CLIENT_KEY` und `TIKTOK_CLIENT_SECRET` setzen.
6. **Abdeckung der Werbedaten:** Beide Bibliotheken zeigen nicht-politische Anzeigen nur für die **EU**. Werbedaten gibt es daher für **DE und AT**. Für CH und GB wird der Werbedruck neutral gewertet und im Dashboard als „–“ angezeigt.
7. **Kostenschutz:** Sobald mindestens eine Quelle live wäre, bricht `npm run collect` ab und zeigt die Obergrenze der kostenpflichtigen Aufrufe:

   ```
   Kostenpflichtige Aufrufe in diesem Lauf (Obergrenze laut Config):
     • SerpApi Google Trends: bis zu 132 Suchen
     • SerpApi Google Shopping: bis zu 100 Suchen
   Abbruch: Mindestens eine Quelle läuft live. Zum Bestätigen mit `npm run collect -- --live` starten.
   ```

   Erst `npm run collect -- --live` ruft die APIs tatsächlich auf. Die Mengen steuern `demand.maxSeedsPerCountry` und `demand.maxKeywordsPerCountry` in der Config.
8. **Claude-Kosten:** Pro Keyword und Land gibt es genau einen Request für alle Treffer. Bewertungen werden in `MatchJudgment` gecacht, das gleiche Paar aus Keyword und Produkt wird also nie zweimal bezahlt. Schlägt Claude fehl (Rate-Limit, Ablehnung), springt für dieses Keyword die Heuristik ein. Der Fehler steht dann im Lauf-Status.

Hinweis zur Live-Anbindung: Die Adapter für SerpApi und AliExpress sind nach der jeweiligen API-Dokumentation gebaut, wurden aber mangels Keys **nicht gegen die echten APIs getestet**. Beim ersten Live-Lauf lohnt ein Blick in die Fehlerliste des Laufs (Ausgabe von `collect` und `Run.errors`).

## Scraping (Phase 2b)

Weil viele offizielle APIs nicht zu bekommen sind, bindet der Radar zwei Quellen per **Scraping** ein. Das war eine bewusste Entscheidung und hebt die ursprüngliche Grenze „kein Scraping“ auf.

| Quelle | Rolle | Länder | Apify-Actor (Config `scraping.*.actorId`) |
|---|---|---|---|
| TikTok Creative Center, Trend-Hashtags | Trendquelle: Hashtag-Popularität der letzten 120 Tage | DE, GB | `memo23~tiktok-trending-hashtags-scraper` |
| 1688.com Produktsuche | Einkaufsquelle mit Großhandels-Kalkulation | DE, AT (Lager in DE) | `songd~1688-search-scraper` |

**So funktioniert es**
- Das Scraping führt der Datendienst **Apify** aus. Es gibt keine eigenen Scraper und keinen Code, der Bot-Schutz umgeht. Aufruf über die Apify-REST-API, keine zusätzliche Abhängigkeit.
- **TikTok:** Viele Trend-Hashtags sind keine Produkte (#fyp, #fußball). Claude wählt die Produkt-Hashtags aus und macht daraus einen Suchbegriff (#cloudlamp → „cloud lamp“). Ohne Claude übernimmt eine Heuristik. Die Popularitätskurve wird zu Wochenwerten verdichtet und wie Google Trends bewertet. Liefern Google und TikTok dasselbe Keyword, wird es nur einmal verarbeitet.
- **1688:** Claude übersetzt das Keyword ins Chinesische; ohne `ANTHROPIC_API_KEY` wird 1688 im Live-Modus übersprungen. Die Marge rechnet mit **Großhandel**: Staffelpreis bei der Losgröße (Config `wholesale.lotSize`, mindestens die Mindestbestellmenge), Agentengebühr, Luftfracht nach Gewicht, regulärer Zoll (die Sammelsendung liegt über 150 €), EUSt bei Einfuhr nach DE, anteilige Verzollung und Versand vom Lager an den Kunden. Alle Werte stehen in `radar.config.ts` unter `wholesale`.
- In der Rangliste erscheint dasselbe Produkt pro Land nur einmal, auch wenn es über mehrere Keywords gefunden wurde.

**Kosten**
- Jeder Actor-Lauf hat eine **harte Kostengrenze** (`maxTotalChargeUsd`, Config `scraping.*.maxChargeUsd`). Es gibt **keine automatischen Wiederholungen**, weil jeder Versuch kostet.
- Der 1688-Actor verlangt zusätzlich eine Monatsmiete (laut Actor-Seite ca. 30 $). Beide Actors müsst ihr in Apify einmal abonnieren.
- Der `--live`-Schutz gilt auch hier: `npm run collect` zeigt vor dem Start die geschätzten Kosten.

**Risiken, die ihr bewusst tragt**
- Die **Nutzungsbedingungen** von TikTok und 1688 untersagen automatisiertes Auslesen. Das Risiko ist vor allem vertraglich (Sperre, Abmahnung). Genutzt werden nur öffentliche Seiten ohne Login.
- **Datenschutz:** Die TikTok-Daten enthalten Creator-Namen. Diese werden **vor dem Speichern entfernt**; gespeichert werden nur Hashtag, Rang, Reichweite und Kurve.
- **Stabilität:** Actor-Ausgaben können sich ohne Vorwarnung ändern. Die Adapter lesen tolerant und melden „Ausgabeformat hat sich geändert“ als Fehler im Lauf. Die Adapter wurden **nicht gegen echte Actor-Ausgaben getestet**, weil kein Token vorhanden war. Beim ersten Live-Lauf also die Fehlerliste prüfen.

## Zentrale Config: `src/config/radar.config.ts`

**Alle** Gewichte, Steuersätze, Zoll- und Versandannahmen, Wechselkurse, Seeds und Limits stehen in dieser Datei, nirgends sonst im Code. Jede Änderung ändert die `configVersion`, die mit jedem Lauf gespeichert wird. So bleibt nachvollziehbar, mit welchen Annahmen ein alter Score entstanden ist. Die Config wird vor jedem Lauf geprüft (z. B. ob sich Gewichte zu 1 summieren).

Wichtige Stellschrauben:

- `tax.vatMode`: `"kleinunternehmer"` (Standard) oder `"regelbesteuert"`. Beim Wechsel in die Regelbesteuerung wird die Einfuhrumsatzsteuer als Vorsteuer abgezogen und die USt aus dem Verkaufspreis herausgerechnet.
- `score.weights`, `trend.weights`, `competition.weights`: Gewichtung der Komponenten
- `margin.*`: Mindest- und Zielmarge, Mindest-Rohertrag je Stück
- `demand.seeds`: Suchbegriffe je Land, rund um die steigende Keywords gesucht werden
- `customs`, `tax.countries`, `shipping`, `fees`, `fx`: Zoll, Steuern, Versand, Gebühren, Kurse

## So entsteht der Score

Alle Scoring-Funktionen sind reine Funktionen ohne KI (`src/scoring/`) und durch Tests abgedeckt.

- **Trend-Dynamik T (0–1):** vergleicht die letzten 4 Wochen mit den 4 Wochen davor. Das Wachstum geht sättigend ein (Verdopplung ≈ 0,5). Wenig Vorgeschichte im restlichen Jahr ergibt einen **Frühphasen-Bonus**, aber nur bei steigendem Interesse. Das absolute Niveau zählt bewusst wenig. Lückenhafte Reihen mit Nullwerten in den letzten Wochen gelten als Rauschen (T = 0). Jedes Keyword wird nur mit sich selbst verglichen, weil Google-Trends-Werte je Abfrage normiert sind.
- **Marge M (0–1):** Landed Cost = Einkauf + Versand + Zoll + Einfuhrumsatzsteuer (+ ggf. Abfertigung), je Land. Marge = Nettoerlös − Kosten − Zahlungsgebühren. M läuft linear von der Mindest- bis zur Zielmarge.
- **Wettbewerb W (0–1, 1 = wenig):** logarithmisch aus drei Signalen: Trefferzahl auf AliExpress (Gewicht 0,25), Bestellvolumen der Top-Treffer (0,25) und **Werbedruck** = Zahl der Shops, die das Keyword im Zielland auf Meta/TikTok bewerben (0,50). Ohne Werbedaten (CH, GB) zählt der Werbedruck neutral.
- **Marktdynamik der Werbung** (neue Anzeigen der letzten 4 Wochen gegenüber den 4 davor) wird **nur angezeigt, nicht gewichtet**. Ob steigende Werbung Nachfrage oder Konkurrenz anzeigt, zeigt erst die Kalibrierung.
- **Gesamtscore:** `100 × Relevanz × (0,50·T + 0,35·M + 0,15·W)`. Kandidaten unter dem Mindest-Rohertrag werden gespeichert, aber markiert und ans Ende sortiert.

## Dashboard

- `/`: Rangliste des letzten erfolgreichen Laufs mit Filtern für Land und Kategorie sowie wählbarer Sortierung. Die Filter stehen in der URL und lassen sich teilen. Der Score-Balken jeder Zeile ist in Trend, Marge und Wettbewerb zerlegt (Tooltip mit Punkten).
- `/produkt/[id]`: Detailansicht mit einer Kurzfassung in Klartext, der Aufschlüsselung aller Teil-Scores samt Zwischenwerten, der 52-Wochen-Trendkurve (Vergleichsfenster markiert), der Kalkulation (Landed Cost und Marge), dem Score-Verlauf über alle Läufe und den Zeitstempeln der Rohdaten.
- In der Detailansicht außerdem: Werbeaktivität (Werbetreibende, aktive Anzeigen, neue Anzeigen je Woche, Links zu Beispiel-Anzeigen) und das Formular **Drop-Ergebnis** (Datum, Stück, Retourenquote, Urteil Top/Okay/Flop).
- `/kalibrierung`: vergleicht die Scores zum Zeitpunkt der Drop-Entscheidung zwischen Top- und Flop-Drops, je Signal mit Bewertung („trennt gut“ … „umgekehrt“) und Empfehlung. Ab 3 Top- und 3 Flop-Drops (Config `calibration.minPerGroup`). Es wird **nichts automatisch** geändert; Gewichte passt ihr bewusst in der Config an.
- Einfacher Passwortschutz über `DASHBOARD_PASSWORD`, sonst keine Nutzerverwaltung.

## Deployment auf Railway

1. Neues Projekt aus dem Repository anlegen und das **PostgreSQL**-Plugin hinzufügen.
2. **Service „web“:** Build `npm run build`, Start `npm run start`, Pre-Deploy-Command `npm run db:deploy`. Variablen: `DATABASE_URL` (Referenz auf das Plugin), `DASHBOARD_PASSWORD`, `SESSION_SECRET`.
3. **Service „collect“** (gleiches Repository): Start-Command `npm run collect -- --live`, Cron-Schedule z. B. `0 5 * * 1` (montags 05:00 UTC, dann sind die Google-Trends-Wochenwerte der Vorwoche vollständig). Variablen: `DATABASE_URL` sowie die API-Keys. Der Exit-Code ist ≠ 0, wenn der Lauf fehlschlägt.

## Projektstruktur

```
src/
├── config/        radar.config.ts (alle Annahmen), Validierung + Config-Version
├── sources/       Adapter-Interfaces, Registry, Google Trends, AliExpress, Google Shopping,
│                  Werbebibliotheken (ads/: Meta, TikTok), Scraping (scraping/: Apify,
│                  TikTok Creative Center, 1688), Mock-Katalog
├── matching/      Claude-Judge (Structured Output), Heuristik, Cache-Logik,
│                  Hashtag-Klassifizierung, Übersetzung für 1688
├── scoring/       trend, margin, competition, ads, score, calibration (+ Tests)
├── jobs/          collect.ts
├── lib/           db, env, auth, Formatierung, Queries
├── components/    Dashboard-Komponenten (+ shadcn/ui unter ui/)
└── app/           Seiten: / (Rangliste), /produkt/[id], /kalibrierung, /login
prisma/            schema.prisma, Migrationen
```

Eine neue Quelle implementiert `TrendSource`, `SupplySource`, `PriceSource` oder `AdSignalSource` aus `src/sources/types.ts` und wird in `src/sources/registry.ts` eingetragen.

**Offen:** Bildähnlichkeit, um dasselbe Produkt auf 1688 und AliExpress zu verknüpfen (Beschaffungswege nebeneinander), und TikTok-Top-Ads als Werbedaten auch für GB. Beides ist in `PLAN-PHASE2.md` beschrieben.

## Bekannte Punkte

- `npm audit` meldet Schwachstellen im **PostCSS, das Next.js 15 mitbringt** (nur zur Build-Zeit genutzt). Behoben ist das erst in Next 16; der Stack ist auf Next 15 festgelegt.
- Bewusst **keine `loading.tsx` auf Root-Ebene**: Damit blieben in Next 15.5 (Production) Filter-Navigationen hängen, die auf derselben Seite nur URL-Parameter ändern. Ein Skeleton gibt es nur für die Detailseite; beim Filtern zeigt die Filterleiste „Aktualisiere …“.
- Wechselkurse sind feste Config-Werte und müssen von Hand gepflegt werden.
