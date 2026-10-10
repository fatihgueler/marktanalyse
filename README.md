# nexana Trend-Radar

Internes Werkzeug zur **Früherkennung von Drop-Kandidaten**: sammelt regelmäßig Nachfrage-Signale aus DACH und UK, gleicht sie mit Einkaufsquellen in Asien ab und zeigt eine Rangliste mit Margenschätzung. Jeder Score lässt sich in der Detailansicht bis auf die Rohdaten zurückverfolgen.

```
Google Trends (DE/AT/CH/GB) ──► AliExpress ──► Google Shopping ──► Claude-Matching ──► Scoring ──► PostgreSQL ──► Dashboard
   steigende Keywords          Angebote       Referenzpreis       Relevanz+Kategorie   (reine Funktionen)   Snapshot je Lauf
```

**Phase 2** ergänzt Werbedaten aus der **Meta Ad Library** und der **TikTok Ad Library** (wie viele Shops ein Produkt im Zielland schon bewerben) sowie ein **Drop-Feedback** mit Kalibrierungsseite, die zeigt, welche Signale eure echten Erfolge vorhergesagt haben.

**Kostenlose Zusatzquellen:** **Pinterest Trends** als weitere Trendquelle und die **EZB-Tageskurse** für alle Umrechnungen.

**Ohne einen einzigen API-Key vollständig lauffähig:** Fehlt ein Key, läuft die jeweilige Quelle automatisch mit realistischen Demo-Daten. Das Dashboard kennzeichnet Demo-Daten deutlich.

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · shadcn/ui · PostgreSQL + Prisma 7 · Anthropic SDK · Vitest · Deployment auf Railway

## Schnellstart (lokal, Demo-Modus)

Voraussetzungen: Node.js 22 und eine PostgreSQL-Datenbank (≥ 14).

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
| `npm run collect -- --live --countries=DE --max-searches=100` | Kleiner Probelauf: nur die genannten Länder (`DE,AT,CH,GB`) und höchstens so viele SerpApi-Suchen. Senkt das Budget laut Config nur, erhöht es nie. Der Lauf erscheint wie ein normaler Lauf im Dashboard. |
| `npm run rescore -- --run <id>` | Nachbewertung eines gespeicherten Laufs mit den aktuellen Filtern und Regeln, **ohne** neue SerpApi- oder Apify-Abfragen (siehe [Nachbewertung](#nachbewertung-eines-laufs)). Mit Claude-Key: `-- --run <id> --live` |
| `npm run check` | Verbindungstest: prüft jeden gesetzten Key kostenlos (SerpApi-Kontingent, Apify-Guthaben, Ablauf des Meta-Tokens …). Mit `-- --probe` zusätzlich je eine echte Abfrage der kostenpflichtigen Quellen (3 SerpApi-Suchen, höchstens ~0,35 $ Apify). |
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
| `ANTHROPIC_MODEL` | nein | Modell für Matching, Hashtag-Auswahl und Übersetzung. Standard `claude-haiku-5-5` (am günstigsten); bei schwacher Match-Qualität `claude-sonnet-5-5`. |
| `META_ACCESS_TOKEN` | nein | Meta Ad Library API, langlebiger Token (60 Tage). Leer → Demo-Modus. |
| `META_APP_ID`, `META_APP_SECRET` | nein | Nur für die Warnung, bevor der Meta-Token abläuft |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | nein | TikTok Commercial Content API, nach Zulassung durch TikTok. Leer → Demo-Modus. |
| `APIFY_TOKEN` | nein | Scraping-Dienst [Apify](https://apify.com) für TikTok Creative Center und 1688. Leer → Demo-Modus. **Siehe Abschnitt „Scraping“.** |
| `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | nein | [Pinterest Trends API](https://developers.pinterest.com), kostenlos. Danach im Dashboard unter „Quellen“ auf „Mit Pinterest verbinden“ klicken; der Radar erneuert den Zugang dann selbst. |
| `PINTEREST_REFRESH_TOKEN`, `PINTEREST_ACCESS_TOKEN` | nein | Nur für Sonderfälle: Refresh-Token von Hand statt über den Button bzw. ein Access-Token ohne Erneuerung (läuft ab). |

Secrets stehen ausschließlich in `.env` (per `.gitignore` ausgeschlossen) bzw. in den Railway-Variablen.

## Go-live: Was noch fehlt, sind Keys und Zahlungen

Der Code ist fertig. Für echte Marktdaten fehlen nur Konten, Keys und bei zwei Diensten eine Zahlung.

| Schritt | Dienst | Kosten | Vorlauf | Variable(n) |
|---|---|---|---|---|
| 1 | [SerpApi](https://serpapi.com/pricing) Starter | 25 $/Monat | sofort | `SERPAPI_API_KEY` |
| 2 | [Anthropic Console](https://console.anthropic.com), Guthaben aufladen (z. B. 10 $) | unter 1 $/Monat | sofort | `ANTHROPIC_API_KEY` |
| 3 | [AliExpress Open Platform](https://openservice.aliexpress.com), Affiliate-App | kostenlos | einige Tage (Prüfung der App) | `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID` |
| 4 | [Apify](https://apify.com), Gratis-Plan | 0 $ (5 $ Guthaben/Monat) | sofort | `APIFY_TOKEN` |
| 5 | Meta Ad Library (Identitätsprüfung + App) | kostenlos | 1–3 Tage (Ausweisprüfung) | `META_ACCESS_TOKEN`, `META_APP_ID`, `META_APP_SECRET` |
| 6 | TikTok Commercial Content API | kostenlos | Wochen, Zulassung unsicher | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| 7 | [Pinterest Developers](https://developers.pinterest.com), App mit Trends-Zugriff, dann „Mit Pinterest verbinden“ im Dashboard | kostenlos | einige Tage (App-Prüfung) | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` |
| – | EZB-Wechselkurse | kostenlos | keiner, läuft automatisch | – |

- **Minimum für verwertbare Ergebnisse: 1 + 2 + 3.** Werbedaten (5, 6), Scraping (4) und Pinterest (7) verbessern den Score, sind aber optional.
- **SerpApi-Kontingent:** Vor jedem Lauf fragt `collect` kostenlos das Restkontingent ab. Reicht es nicht für einen vollen Lauf, wird das Budget gekappt. Unter 100 Suchen (`budget.serpApiMinSearchesPerRun`) fällt der Lauf aus. Im Gratis-Plan (250 Suchen) ist damit ein Lauf pro Monat möglich: Cron dann monatlich, 1–2 Tage nach der Erneuerung des Kontingents (Datum im SerpApi-Dashboard). Mit Starter (1.000 Suchen) wöchentlich: `45 4 * * 1`.
- **Länder ohne Angebotsquelle laufen nicht:** 1688 liefert nur nach DE und AT. Solange AliExpress fehlt, überspringt `collect` CH und GB komplett (Hinweis im Log und unter dem Lauf-Status) – im ersten Live-Lauf hatten die beiden 104 von 216 Suchen verbraucht, ohne ein einziges Angebot.
- **SerpApi-Anteil je Land:** Jedes Land bekommt Rest ÷ verbleibende Länder. Darin reservieren die Trends mindestens `referencePrice.minLookupsPerCountry` (8) Suchen für Google Shopping; was der Keyword-Filter an Kurven spart, geht ebenfalls an Shopping (höchstens eine Abfrage je Keyword), der Rest an die folgenden Länder. Das Log zeigt je Land „Anteil … – Trends …, Shopping …“.
- **Kein Lauf ohne Aussicht auf Kandidaten:** Sind Trends live, aber keine brauchbare Angebotsquelle (AliExpress, oder 1688 zusammen mit Claude), bricht `collect -- --live` vor der ersten bezahlten Suche ab (Exit-Code 3) und nennt den fehlenden Schlüssel.
- **Echtbetrieb ohne Demo-Daten:** Sobald eine Trend- oder Angebotsquelle live ist, laufen die übrigen Demo-Quellen nicht mehr mit (im Dashboard „aus“). Ihre Signale zählen dann neutral, statt erfundene Werte in die Rangliste zu mischen. Was dadurch fehlt, steht als Hinweis unter dem Lauf-Status. Das Dashboard zeigt außerdem den letzten echten Lauf (ein neuerer Demo-Lauf verdrängt ihn nicht) und blendet darin Angebote aus Quellen aus, die im Demo-Modus liefen – das betrifft Läufe von vor dieser Regel. Demo-Angebote verlinken nie auf erfundene Artikelseiten, sondern auf die Suche beim Anbieter („Ähnliche suchen“).
- **Gratis-Variante zum Ausprobieren:** Pinterest statt SerpApi als Trendquelle (7 + 2 + 3) kostet nur den Claude-Verbrauch. Sie deckt aber nur, was auf Pinterest gesucht wird, und die Kurven sind weniger fein als bei Google Trends. Ohne SerpApi gibt es keine echten Verkaufspreise, die Marge ist dann über den Kategorie-Faktor geschätzt.
- Anträge mit Vorlauf (3, 5, 6, 7) **zuerst** stellen.
- Nach jedem neuen Key: `npm run check`. Vor dem ersten echten Lauf einmal `npm run check -- --probe`.
- Dann `npm run collect -- --live`. Auf Railway beides über den Service „collect“, siehe [Deployment](#deployment-auf-railway).

## Von Demo-Daten auf echte APIs umstellen

Jede Quelle schaltet **einzeln** um, sobald ihr Key gesetzt ist. Man kann also schrittweise vorgehen, z. B. erst nur Google Trends live.

1. **Google Trends + Google Shopping:** Account bei SerpApi anlegen, `SERPAPI_API_KEY` setzen. Genutzt werden `engine=google_trends` (steigende verwandte Suchanfragen und 12-Monats-Zeitreihe je Keyword) und `engine=google_shopping` (Median der Endkundenpreise).
2. **AliExpress:** Auf der AliExpress Open Platform eine App mit Zugriff auf die **Affiliate API** anlegen (Methoden `aliexpress.affiliate.product.query` und `aliexpress.affiliate.product.shipping.get`), dann `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` und `ALIEXPRESS_TRACKING_ID` setzen. Für die 5 meistverkauften Treffer je Suche (`supply.shippingLookupsPerSearch`) holt der Radar kostenlos die echten Versandkosten und die Lieferzeit ins Zielland; alle anderen rechnen mit der Pauschale `shipping.perItemEur`. Schlägt die Versandabfrage fehl, gilt ebenfalls die Pauschale, und der Lauf meldet es als Hinweis. `npm run check` prüft eine Versandabfrage mit.
3. **Claude:** `ANTHROPIC_API_KEY` setzen, optional `ANTHROPIC_MODEL`. Standard ist Haiku 5.5 (0,10 $ / 0,50 $ je Million Token bei Prompts bis 100.000 Token) mit `effort` „low“ – es denkt kurz mit, die Denk-Tokens zählen zu den Ausgabe-Grenzen. Bei Modellen, die `effort` nicht kennen (z. B. Haiku 4.5), wird der Parameter automatisch weggelassen.
4. **Meta Ad Library (kostenlos, aber mit Rate-Limit):**
   1. Auf [facebook.com/ID](https://www.facebook.com/ID) die Identität bestätigen (Pflicht für den Zugriff auf die Ad Library API).
   2. Auf [developers.facebook.com](https://developers.facebook.com) eine App anlegen.
   3. Im [Graph API Explorer](https://developers.facebook.com/tools/explorer/) einen User-Token für die App erzeugen und ihn in einen **langlebigen Token (60 Tage)** tauschen, etwa über den [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) („Extend Access Token“).
   4. `META_ACCESS_TOKEN` setzen. Optional `META_APP_ID` und `META_APP_SECRET`, dann warnt `collect` 10 Tage vor Ablauf. Einen abgelaufenen Token meldet der Lauf als Fehler bei „meta-ad-library“.
5. **TikTok Ad Library:** Auf [developers.tiktok.com](https://developers.tiktok.com/products/commercial-content-api) die **Commercial Content API** beantragen. TikTok prüft jeden Antrag, und ob kommerzielle Antragsteller zugelassen werden, ist nicht garantiert. Nach der Zulassung `TIKTOK_CLIENT_KEY` und `TIKTOK_CLIENT_SECRET` setzen.
6. **Pinterest Trends (kostenlos):**
   1. Auf [developers.pinterest.com](https://developers.pinterest.com) mit einem Pinterest-Unternehmenskonto eine App anlegen und Zugriff beantragen. Pinterest prüft die App.
   2. In der App als Redirect-URI `https://<eure-railway-domain>/api/pinterest/callback` eintragen. Die genaue Adresse steht im Dashboard unter „Quellen“.
   3. `PINTEREST_APP_ID` und `PINTEREST_APP_SECRET` in Railway eintragen (Web-Service und „collect“), deployen, dann im Dashboard unter „Quellen“ auf **„Mit Pinterest verbinden“** klicken und bei Pinterest zustimmen. Test-Tokens aus dem Entwicklerportal taugen nicht, sie laufen nach 24 Stunden ab.
   4. Der Radar holt sich vor jedem Lauf ein frisches Access-Token. Den neuen Refresh-Token, den Pinterest dabei ausgibt (60 Tage gültig), speichert er in der Datenbank (Tabelle `ApiToken`). Solange mindestens alle 60 Tage ein Lauf stattfindet, bleibt der Zugang also dauerhaft gültig. 10 Tage vor Ablauf warnt das Dashboard.
   5. Abgefragt werden je Region die am stärksten wachsenden Suchbegriffe („growing“) aus den Interessen in `pinterest.interests`. AT und CH führt Pinterest nur gemeinsam als „DE+AT+CH“. Claude wählt die Produktbegriffe aus, wie bei den TikTok-Hashtags.
   6. `npm run check` erneuert den Token dabei ebenfalls. Deshalb auf Railway prüfen (Pre-Deploy-Log) und nicht lokal mit denselben Zugangsdaten, sonst landet der neue Refresh-Token in der falschen Datenbank.
7. **EZB-Wechselkurse (automatisch):** Vor jedem Lauf lädt der Radar die Referenzkurse der Europäischen Zentralbank (USD, CNY, GBP, CHF). Ist die EZB nicht erreichbar, gelten die festen Werte aus `fx` in der Config, mit Warnung im Dashboard. Abschalten: `fxUpdate.source = "config"`. Welche Kurse ein Kandidat nutzt, steht unten in der Detailansicht.
8. **Abdeckung der Werbedaten:** Beide Bibliotheken zeigen nicht-politische Anzeigen nur für die **EU**. Werbedaten gibt es daher für **DE und AT**. Für CH und GB wird der Werbedruck neutral gewertet und im Dashboard als „–“ angezeigt.
9. **Kostenschutz:** Sobald mindestens eine Quelle live wäre, bricht `npm run collect` ab und zeigt die Obergrenze der kostenpflichtigen Aufrufe:

   ```
   Kostenpflichtige Aufrufe in diesem Lauf (Obergrenze laut Config):
     • SerpApi (Trends + Shopping): bis zu 230 Suchen – hartes Budget 230 je Lauf (1000 Suchen/Monat ÷ 4.33 Läufe)
   Abbruch: Mindestens eine Quelle läuft live. Zum Bestätigen mit `npm run collect -- --live` starten.
   ```

   Erst `npm run collect -- --live` ruft die APIs tatsächlich auf. Die Mengen steuern `demand.maxSeedsPerCountry` und `demand.maxKeywordsPerCountry` in der Config.
10. **Claude-Kosten:** Pro Keyword und Land gibt es genau einen Request für alle Treffer. Bewertungen werden in `MatchJudgment` gecacht, das gleiche Paar aus Keyword und Produkt wird also nie zweimal bezahlt. Schlägt Claude fehl (Rate-Limit, Ablehnung), springt für dieses Keyword die Heuristik ein. Der Fehler steht dann im Lauf-Status.

Hinweis zur Live-Anbindung: Die Adapter sind nach der jeweiligen API-Dokumentation gebaut, wurden aber mangels Keys **nicht gegen die echten APIs getestet** (nur die Fehlerfälle mit ungültigen Keys). Deshalb vor dem ersten Lauf `npm run check -- --probe`: Es ruft jede Quelle einmal über denselben Code wie der Lauf auf und zeigt, ob die Antworten passen. Fehler und Warnungen eines Laufs stehen im Dashboard unter dem Lauf-Status.

## Scraping (Phase 2b)

Weil viele offizielle APIs nicht zu bekommen sind, bindet der Radar zwei Quellen per **Scraping** ein. Das war eine bewusste Entscheidung und hebt die ursprüngliche Grenze „kein Scraping“ auf.

| Quelle | Rolle | Länder | Apify-Actor (Config `scraping.*.actorId`) |
|---|---|---|---|
| TikTok Creative Center, Top-Anzeigen | Trendquelle: Produkte, die gerade mit Shop-Link beworben werden (letzte 30 Tage) | DE, GB | `datapeak~tiktok-creative-center` |
| 1688.com Produktsuche | Einkaufsquelle mit Großhandels-Kalkulation | DE, AT (Lager in DE) | `memo23~1688-wholesale-scraper` |

**So funktioniert es**
- Das Scraping führt der Datendienst **Apify** aus. Es gibt keine eigenen Scraper und keinen Code, der Bot-Schutz umgeht. Aufruf über die Apify-REST-API, keine zusätzliche Abhängigkeit.
- **TikTok (seit 10/2026 Top-Anzeigen statt Hashtags):** Der frühere Hashtag-Actor lieferte ohne Login nur rund 3 Hashtags je Land. Jetzt holt der Radar je Land bis zu 100 Top-Anzeigen der letzten 30 Tage und behält nur die mit Shop-Link (Produktseite). Claude macht aus Anzeigentext und Shop-Pfad einen Suchbegriff („Foundation stick … | foundation-stick“ → „foundation stick“); ohne Claude gibt es keine TikTok-Keywords. Die Trendkurve kommt von Google Trends (eine SerpApi-Suche je Begriff, höchstens `scraping.tiktokTopAds.maxKeywordsPerCountry` = 20 je Land), damit alle Keywords nach derselben Regel bewertet werden. TikTok läuft vor Google Trends; Google bekommt den Rest des SerpApi-Anteils. Liefern Google und TikTok dasselbe Keyword, wird es nur einmal verarbeitet.
- **1688:** Claude übersetzt das Keyword ins Chinesische; ohne `ANTHROPIC_API_KEY` wird 1688 im Live-Modus übersprungen. Die Marge rechnet mit **Großhandel**: Staffelpreis bei der Losgröße (Config `wholesale.lotSize`, mindestens die Mindestbestellmenge), Agentengebühr, Luftfracht nach Gewicht, regulärer Zoll (die Sammelsendung liegt über 150 €), EUSt bei Einfuhr nach DE, anteilige Verzollung und Versand vom Lager an den Kunden. Alle Werte stehen in `radar.config.ts` unter `wholesale`.
- In der Rangliste erscheint dasselbe Produkt pro Land nur einmal, auch wenn es über mehrere Keywords gefunden wurde.

**Kosten**
- Jeder Actor-Lauf hat eine **harte Kostengrenze** (`maxTotalChargeUsd`, Config `scraping.*.maxChargeUsd`). Es gibt **keine automatischen Wiederholungen**, weil jeder Versuch kostet.
- Beide Actors rechnen **pro Ergebnis** ab, ohne Monatsmiete: TikTok ca. 1,50 $ je 1.000 Hashtags, 1688 ab 2 $ je 1.000 Angebote. Der 1688-Actor braucht Residential-Proxys, deren Datenverbrauch zusätzlich vom Guthaben abgeht.
- **Gratis-Plan von Apify:** laut Konto 10 $ Guthaben pro Monat (`budget.apifyMonthlyUsd`). Ein wöchentlicher Lauf kostet grob 0,45 $ (TikTok-Top-Anzeigen, 2 Länder × 100 Anzeigen) plus ca. 0,24 $ (1688, 24 Suchen × 5 Angebote), also etwa 3 $ im Monat. Die Obergrenzen je Lauf sind so gesetzt, dass selbst der ungünstigste Fall (1,32 $ je Lauf) unter dem Monatsguthaben bleibt. Im Gratis-Plan kann ohnehin nichts nachberechnet werden; ist das Guthaben leer, schlagen die Läufe fehl. Nächster Plan: Starter für 19 $/Monat.
- Der `--live`-Schutz gilt auch hier: `npm run collect` zeigt vor dem Start die geschätzten Kosten.

**Risiken, die ihr bewusst tragt**
- Die **Nutzungsbedingungen** von TikTok und 1688 untersagen automatisiertes Auslesen. Das Risiko ist vor allem vertraglich (Sperre, Abmahnung). Genutzt werden nur öffentliche Seiten ohne Login.
- **Datenschutz:** Die TikTok-Daten enthalten Creator-Namen. Diese werden **vor dem Speichern entfernt**; gespeichert werden nur Hashtag, Rang, Reichweite und Kurve.
- **Stabilität:** Actor-Ausgaben können sich ohne Vorwarnung ändern. Die Adapter lesen tolerant und melden „Ausgabeformat hat sich geändert“ als Fehler im Lauf. Die Adapter wurden **nicht gegen echte Actor-Ausgaben getestet**, weil kein Token vorhanden war. Beim ersten Live-Lauf also die Fehlerliste prüfen.

## Kosten (Sparvariante, Standard)

Die Config ist auf die günstigste Variante eingestellt, die rund 500 Kandidaten pro Woche erreichen kann (wöchentlicher Lauf):

| Dienst | Plan | Monatlich |
|---|---|---|
| SerpApi (Google Trends + Shopping) | Starter, 1.000 Suchen | 25 $ |
| Claude | `claude-haiku-5-5`, nach Verbrauch | unter 1 $ |
| Apify (TikTok Creative Center, 1688) | Gratis-Plan, 5 $ Guthaben | 0 $ |
| Railway (Dashboard, Datenbank, Cron) | Hobby | ca. 5–10 $ |
| AliExpress, Pinterest, EZB-Kurse, Meta Ad Library, TikTok Ad Library | kostenlos | 0 $ |
| **Summe** | | **ca. 33–38 $** |

So wird das Budget eingehalten:
- **Config-Prüfung:** `budget` in `radar.config.ts` legt die Tarife fest. Vor jedem Lauf wird geprüft, dass ein Lauf im ungünstigsten Fall höchstens Monatsbudget ÷ Läufe pro Monat verbraucht (SerpApi 230 Suchen, Apify 1,15 $). Passt eine Änderung nicht dazu, bricht `collect` mit Erklärung ab.
- **Hartes SerpApi-Budget zur Laufzeit:** Ist es erschöpft, arbeitet der Lauf mit dem weiter, was er hat, statt mehr Suchen zu verbrauchen.
- **Keyword-Filter vor den Trendkurven:** Jede Kurve kostet eine Suche. Begriffe ohne importierbares Produkt fliegen vorher raus (siehe [Keyword-Filter](#keyword-filter)).
- **Priorisierung:** Echte Shopping-Preise (mindestens 8, höchstens 45 je Land, siehe SerpApi-Anteil oben) und 1688-Suchen (12 je Land) bekommen die Keywords mit dem höchsten Trend-Score. Die übrigen nutzen die Preisschätzung, im Dashboard als „Schätzung“ markiert.
- **AliExpress ist kostenlos:** Deshalb 12 Treffer pro Keyword statt 8, das bringt mehr Kandidaten ohne API-Kosten.

Hochskalieren: `budget.serpApiMonthlySearches` auf den nächsten SerpApi-Plan setzen (Developer, 5.000 Suchen, 75 $) und `demand.maxKeywordsPerCountry` / `referencePrice.maxLookupsPerCountry` erhöhen; die Prüfung sagt, ob es passt. Railway: Für den Web-Service „Serverless“ (App Sleeping) aktivieren, dann läuft das Dashboard nur, wenn jemand es aufruft.

## Zentrale Config: `src/config/radar.config.ts`

**Alle** Gewichte, Steuersätze, Zoll- und Versandannahmen, Wechselkurse, Seeds und Limits stehen in dieser Datei, nirgends sonst im Code. Jede Änderung ändert die `configVersion`, die mit jedem Lauf gespeichert wird. So bleibt nachvollziehbar, mit welchen Annahmen ein alter Score entstanden ist. Die Config wird vor jedem Lauf geprüft (z. B. ob sich Gewichte zu 1 summieren).

Wichtige Stellschrauben:

- `tax.vatMode`: `"kleinunternehmer"` (Standard) oder `"regelbesteuert"`. Beim Wechsel in die Regelbesteuerung wird die Einfuhrumsatzsteuer als Vorsteuer abgezogen und die USt aus dem Verkaufspreis herausgerechnet.
- `score.weights`, `trend.weights`, `competition.weights`: Gewichtung der Komponenten
- `margin.*`: Mindest- und Zielmarge, Mindest-Rohertrag je Stück
- `demand.seeds`: Suchbegriffe je Land, rund um die steigende Keywords gesucht werden – seit 09.10.2026 konkrete Produktkategorien (Nachtlicht, Luftbefeuchter, Massagegerät …) statt „gadget“, „led“, „deko“. Der Vorrat ist größer als `demand.maxSeedsPerCountry` (10); jeder Lauf nimmt 10 davon, rotierend nach Kalenderwoche, sodass DE und GB (24 Begriffe) nach drei Wochen komplett abgefragt sind.
- `keywordFilter`: Marken/Händler, Fragewörter, Selbermachen, Tests/Vergleiche, Filme/Spiele, Lizenzware (auch chinesisch)
- `trend.seasonality`: Schwellen der Saison-Erkennung
- `referencePrice.minLookupsPerCountry` / `maxLookupsPerCountry`: reservierte bzw. höchstens mögliche Shopping-Preise je Land
- `customs`, `tax.countries`, `shipping`, `fees`, `fx`: Zoll, Steuern, Versand, Gebühren, Kurse

## So entsteht der Score

Alle Scoring-Funktionen sind reine Funktionen ohne KI (`src/scoring/`) und durch Tests abgedeckt.

- **Trend-Dynamik T (0–1):** vergleicht die letzten 4 Wochen mit den 4 Wochen davor. Das Wachstum geht sättigend ein (Verdopplung ≈ 0,5). Wenig Vorgeschichte im restlichen Jahr ergibt einen **Frühphasen-Bonus**, aber nur bei steigendem Interesse. Das absolute Niveau zählt bewusst wenig. Lückenhafte Reihen mit Nullwerten in den letzten Wochen gelten als Rauschen (T = 0). Jedes Keyword wird nur mit sich selbst verglichen, weil Google-Trends-Werte je Abfrage normiert sind.
- **Saison:** Steigt ein Begriff, war er im gleichen Zeitraum des Vorjahres (die ersten Wochen des 12-Monats-Fensters) ähnlich hoch und lag dazwischen ein deutliches Tief, heißt die Phase „Saison“ statt „Frühphase“ (Halloween, Weihnachtsdeko …). Der Score ändert sich dadurch nicht; in der Rangliste blendet „Saisonware ausblenden“ solche Produkte aus.
- **Marge M (0–1):** Landed Cost = Einkauf + Versand (laut AliExpress, sonst Pauschale) + Zoll + Einfuhrumsatzsteuer (+ ggf. Abfertigung), je Land, umgerechnet mit den EZB-Tageskursen. Verkaufspreis: Google Shopping, gesucht mit einem von Claude gebildeten Produkt-Suchbegriff des passendsten Angebots (nicht mit dem allgemeinen Keyword), sonst Kategorie-Faktor. 1688 liefert in der Suche keine Preisstaffeln; gerechnet wird dann mit dem Stückpreis laut Suche („Staffel unbekannt“). Großhandelsangebote, deren Einkaufspreis schon über dem Verkaufspreis liegt, werden verworfen (Platzhalterpreise, Ladeninstallationen). Marge = Nettoerlös − Kosten − Zahlungsgebühren. M läuft linear von der Mindest- bis zur Zielmarge.
- **Wettbewerb W (0–1, 1 = wenig):** logarithmisch aus drei Signalen: Trefferzahl auf AliExpress (Gewicht 0,25), Bestellvolumen der Top-Treffer (0,25) und **Werbedruck** = Zahl der Shops, die das Keyword im Zielland auf Meta/TikTok bewerben (0,50). Fehlende Signale (z. B. keine Werbedaten für CH und GB) zählen neutral.
- **Marktdynamik der Werbung** (neue Anzeigen der letzten 4 Wochen gegenüber den 4 davor) wird **nur angezeigt, nicht gewichtet**. Ob steigende Werbung Nachfrage oder Konkurrenz anzeigt, zeigt erst die Kalibrierung.
- **Gesamtscore:** `100 × Relevanz × (0,50·T + 0,35·M + 0,15·W)`. Kandidaten unter dem Mindest-Rohertrag werden gespeichert, aber markiert und ans Ende sortiert.

## Keyword-Filter

Google listet unter „steigende verwandte Suchanfragen“ viel, was kein Produkt ist („ikea fado lamp“, „inspector gadget“, „herbst deko basteln“, „hulled wheat“). Bevor eine Trendkurve (= eine SerpApi-Suche) angefragt wird, prüft `collect` jeden Begriff:

1. **Regeln** (kostenlos, Listen in `keywordFilter`): Marken und Händler, Fragen am Anfang, Selbermachen/Ideen, Tests/Vergleiche/Bestenlisten, Filme/Serien/Spiele, Lizenzware. Verglichen werden ganze Wörter.
2. **Claude** (ein gebündelter Aufruf je Land): „konkretes, physisches, importierbares Produkt – ja/nein“. Nur für Google Trends; TikTok- und Pinterest-Begriffe prüft Claude schon beim Erkennen. Schlägt der Aufruf fehl, bleiben alle regelkonformen Begriffe drin.

Das Log zeigt je Land und Quelle „gefunden → nach Regeln → nach Claude → abgefragt“ und einige verworfene Beispiele mit Grund. Lizenzware (Star Wars, Disney, Pokémon … auch chinesisch) wird zusätzlich bei den Angebotstiteln aussortiert.

Am Ende jedes Laufs stehen im Log immer: der **Trichter** (Keywords → nach Filter → mit Trend-Dynamik → Angebote → Kandidaten → Karten), die **aussortierten Angebote**, die **Meldungen** und die **Top 10** (auch Kandidaten mit „Marge zu dünn“, markiert).

## Nachbewertung eines Laufs

`npm run rescore -- --run <id>` wendet die aktuellen Regeln auf die gespeicherten Rohdaten eines Laufs an: Keyword-Filter, Saison-Erkennung, Lizenz- und Plausibilitätsfilter, Titel-Übersetzung und Staffel-Angabe. Es werden **keine** SerpApi-Suchen und **keine** Apify-Läufe gemacht; nur Claude wird aufgerufen (bereits bewertete Angebote kommen aus dem Cache). Mit `ANTHROPIC_API_KEY` startet die Nachbewertung deshalb erst mit `--live`.

- Das Ergebnis wird als **neuer Lauf** gespeichert (`Run.rescoreOf` = Original-ID), der Originallauf bleibt unverändert. Das Dashboard zeigt dann „Nachbewertung vom … · Daten vom …“.
- Referenzpreise kommen aus dem Originallauf (dort noch zum allgemeinen Keyword). Produktgenaue Shopping-Preise gibt es erst beim nächsten echten Lauf.
- Der SerpApi-Kontostand wird vorher und nachher gelesen (kostenlos); sinkt er, meldet das Skript einen Fehler.
- **Auf Railway:** im Service „collect“ den Start Command vorübergehend auf `npm run rescore -- --run <id> --live` setzen, „Run now“, Log lesen, danach zurück auf `npm run collect -- --live`.

## Dashboard

- `/`: Rangliste des letzten erfolgreichen Laufs als Karten: Bild (oder Platzhalter), kurzer Name, Urteil „Jetzt testen“ / „Beobachten“ / „Zu spät“ / „Marge zu dünn“ und drei Angaben in Worten (Trendphase, Marge in € und %, Konkurrenz niedrig/mittel/hoch). Dasselbe Produkt erscheint einmal, die Länder stehen als Chips daran („DE 88 · AT 87“). Schwellen: `ranking` in der Config. Filter für Land und Kategorie sowie Sortierung stehen in der URL. Darüber eine Statuszeile (Demo/Live, wie viele Quellen live sind); Einzelheiten unter „Quellen“. **Lieferzeit** laut AliExpress steht als Chip auf der Karte; über `shipping.maxDeliveryDays` (20 Tage) ist sie gelb markiert, und innerhalb einer Produktgruppe wird ein schnelleres Angebot bevorzugt. **Neu diese Woche:** Verglichen wird mit dem letzten Lauf, der mindestens 5 Tage älter ist und von derselben Art (echt bzw. Demo). Karten zeigen „Neu“ (Produkt bzw. Keyword gab es im Land damals nicht) oder „+N Punkte“ (ab 10 Punkten Plus), der Schalter „Neu diese Woche“ zeigt nur diese. Schwellen: `ranking.compareMinDaysBack` und `ranking.risingMinPoints`. Haben sich die Bewertungsregeln seitdem geändert, steht ein Hinweis dabei. Helles und dunkles Thema, umschaltbar im Kopf.
- `/produkt/[id]`: Oben der Antwortkasten (kaufen für, verkaufen für, bleibt pro Stück, Urteil mit Begründung), darunter die 52-Wochen-Trendkurve (Vergleichsfenster als dezente Linien) und der Score-Verlauf über alle Läufe. Eingeklappt: Kurzfassung in Klartext, Aufschlüsselung aller Teil-Scores, Kalkulation (Landed Cost und Marge) und Zeitstempel der Rohdaten. Der Originaltitel des Angebots steht unter dem kurzen Namen.
- In der Detailansicht außerdem: Werbeaktivität (Werbetreibende, aktive Anzeigen, neue Anzeigen je Woche, Links zu Beispiel-Anzeigen) und das Formular **Drop-Ergebnis** (Datum, Stück, Retourenquote, Urteil Top/Okay/Flop).
- `/check` (**Produkt-Check**, ohne APIs nutzbar): Name, Link, Einkaufspreis, Versand, Gewicht, Kategorie, Zielland und geplanter Verkaufspreis. Ergebnis sofort mit der Kalkulation der Rangliste (EZB-Kurse): Stückkosten, Marge in € und %, maximales Werbebudget pro Verkauf und das Urteil „Lohnt sich“ / „Knapp“ / „Finger weg“. Schwellen: `productCheck` in der Config. Ohne Verkaufspreis wird er über den Kategorie-Faktor geschätzt und so gekennzeichnet. 1688-Links werden als Sammelbestellung gerechnet (nur DE/AT).
- `/merkliste`: geprüfte Produkte in den Stufen Idee → Geprüft → Test-Drop → Ergebnis, verschiebbar. Je Produkt Recherche-Knöpfe (nur Links, kein Abruf durch den Radar), Upload einer Google-Trends-CSV (Phase Frühphase / Wachstum / Kein Anstieg / Rauschen) und das Drop-Ergebnis, das in die Kalibrierung einfließt. Eigene Produkte erscheinen auch oben in der Rangliste.
- `/rueckblick` (**Rückblick-Test**, ohne APIs): Google-Trends-CSVs vergangener Hypes laden (Deutschland, „Letzte 5 Jahre“, mehrere Dateien auf einmal). Der Radar bewertet jede Woche nur das Jahr davor, neu auf 100 normiert wie im Echtbetrieb, und zeigt, wann er zum ersten Mal angeschlagen hätte (Trend-Score ab 0,5), den Höhepunkt und den Vorlauf: „rechtzeitig“ ab 4 Wochen, sonst „knapp“ oder „verpasst“. Kontrollen (Dauerbrenner, Saisonware) zählen nur ihre Signalwochen. Bewertet wird nur der Trend; Marge, Wettbewerb und ob das Keyword damals entdeckt worden wäre, lassen sich nicht nachstellen. Eine Vorschlagsliste mit Links zu Google Trends steht auf der Seite. Die Dateien bleiben im Browser. Schwellen: `backtest` in der Config.
- `/quellen`: Status jeder Quelle im letzten Lauf (Live, Demo, aus), die zugehörigen Railway-Variablen und der Button „Mit Pinterest verbinden“.
- `/kalibrierung`: vergleicht die Scores zum Zeitpunkt der Drop-Entscheidung zwischen Top- und Flop-Drops, je Signal mit Bewertung („trennt gut“ … „umgekehrt“) und Empfehlung. Ab 3 Top- und 3 Flop-Drops (Config `calibration.minPerGroup`). Es wird **nichts automatisch** geändert; Gewichte passt ihr bewusst in der Config an.
- Einfacher Passwortschutz über `DASHBOARD_PASSWORD`, sonst keine Nutzerverwaltung.

## Deployment auf Railway

Bewusst ohne `railway.json`: Eine Konfigurationsdatei im Repo würde die Dashboard-Einstellungen aller Dienste aus diesem Repo überschreiben, also auch die des wöchentlichen Laufs. Build- und Start-Befehl erkennt Railway selbst (`npm run build`, `npm run start`), Node 22 kommt aus `engines` in `package.json`.

1. Neues Projekt aus dem GitHub-Repository anlegen und eine **PostgreSQL**-Datenbank hinzufügen.
2. **Service „web“** (das Repository):
   - Settings → Source: Branch wählen, auf dem der Code liegt.
   - Settings → Deploy → Pre-Deploy Command: `npm run db:deploy && npm run collect -- --if-empty && (npm run check || true)`. Das spielt die Migrationen ein und füllt eine **leere** Datenbank einmalig mit Demo-Daten. Sobald ein echter API-Key gesetzt ist, startet es beim Deploy keinen Lauf mehr (Kostenschutz) und bricht den Deploy auch nicht ab. Danach steht der kostenlose Verbindungstest im Deploy-Log (Deployments → Pre-Deploy-Logs). Ein falscher Key blockiert den Deploy nicht.
   - Variables: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `DASHBOARD_PASSWORD`, `SESSION_SECRET` (mind. 32 Zeichen). Die API-Keys hier ebenfalls eintragen, damit der Verbindungstest sie beim Deploy prüft. Am einfachsten über „Raw Editor“: den Inhalt der `.env`-Zeilen einfügen.
   - Settings → Networking → „Generate Domain“.
3. **Service „collect“** (optional, erst mit echten API-Keys sinnvoll; gleiches Repository): Start Command `npm run collect -- --live`, Cron Schedule z. B. `45 4 * * 1` (montags 04:45 UTC, die Google-Trends-Wochenwerte der Vorwoche sind dann vollständig), Restart Policy „Never“. Variablen: `DATABASE_URL` wie oben sowie die API-Keys (per „Raw Editor“ dieselben Zeilen wie beim Web-Service). Vor dem ersten Lauf einmalig den Start Command auf `npm run check -- --probe` setzen, „Run now“, Log prüfen, dann zurück auf `npm run collect -- --live` und erneut „Run now“. Der Exit-Code ist ≠ 0, wenn der Lauf fehlschlägt.

## Projektstruktur

```
src/
├── config/        radar.config.ts (alle Annahmen), Validierung + Config-Version
├── sources/       Adapter-Interfaces, Registry, Google Trends, Pinterest Trends, AliExpress,
│                  Google Shopping, EZB-Kurse (fx/), Werbebibliotheken
│                  (ads/: Meta, TikTok), Scraping (scraping/: Apify, TikTok Creative Center,
│                  1688), Mock-Katalog
├── matching/      Claude-Judge (Structured Output), Heuristik, Cache-Logik,
│                  Hashtag-Klassifizierung, Keyword-Prüfung, Übersetzung für 1688 und der Angebotstitel
├── scoring/       trend, margin, competition, ads, score, calibration (+ Tests)
├── jobs/          collect.ts (Datenlauf), rescore.ts (Nachbewertung), keyword-scoring.ts
│                  (Bewertung je Keyword, gemeinsam), run-report.ts (Log), check.ts (Verbindungstest)
├── lib/           db, env, auth, Formatierung, Queries
├── components/    Dashboard-Komponenten (+ shadcn/ui unter ui/)
└── app/           Seiten: / (Rangliste), /produkt/[id], /kalibrierung, /login
prisma/            schema.prisma, Migrationen
```

Eine neue Quelle implementiert `TrendSource`, `SupplySource`, `PriceSource`, `MarketSource` oder `AdSignalSource` aus `src/sources/types.ts` und wird in `src/sources/registry.ts` eingetragen.

**Offen:** Bildähnlichkeit, um dasselbe Produkt auf 1688 und AliExpress zu verknüpfen (Beschaffungswege nebeneinander), und TikTok-Top-Ads als Werbedaten auch für GB. Beides ist in `PLAN-PHASE2.md` beschrieben.

## Bekannte Punkte

- `npm audit` meldet Schwachstellen im **PostCSS, das Next.js 15 mitbringt** (nur zur Build-Zeit genutzt). Behoben ist das erst in Next 16; der Stack ist auf Next 15 festgelegt.
- Bewusst **keine `loading.tsx` auf Root-Ebene**: Damit blieben in Next 15.5 (Production) Filter-Navigationen hängen, die auf derselben Seite nur URL-Parameter ändern. Ein Skeleton gibt es nur für die Detailseite; beim Filtern zeigt die Filterleiste „Aktualisiere …“.
- Die festen Wechselkurse in der Config sind nur noch Rückfallwerte, falls die EZB nicht erreichbar ist.
- Der Adapter für Pinterest ist nach der offiziellen Doku bzw. OpenAPI-Beschreibung gebaut und nur mit ungültigen Keys gegen die echten Endpunkte getestet (Anmeldung und Pfade stimmen). Beim ersten echten Key zeigt `npm run check`, ob die Antworten passen.
