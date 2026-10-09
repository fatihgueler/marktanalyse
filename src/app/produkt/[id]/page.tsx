import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ChevronDown, FlaskConical, Truck } from "lucide-react";
import { AdActivity } from "@/components/ad-activity";
import { AppHeader } from "@/components/app-header";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DropFeedbackForm } from "@/components/drop-feedback-form";
import { MarginBreakdown } from "@/components/margin-breakdown";
import { ProductImage, VERDICT_TONE, VerdictBadge } from "@/components/product-card";
import { ResearchLinks } from "@/components/research-links";
import { ScoreBar, ScoreLegend } from "@/components/score-bar";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { ScoreHistoryChart } from "@/components/score-history-chart";
import { TrendChart } from "@/components/trend-chart";
import { radarConfig, type CategoryId, type Country } from "@/config/radar.config";
import { formatDateTime, formatMoney, formatMoneyRounded, formatNumber, formatPercent, formatWeek } from "@/lib/format";
import { demandMetric, judgeLabel, sourceLabel } from "@/lib/labels";
import { getCandidateDetail, getDropOutcomes, type CandidateDetail } from "@/lib/queries";
import { offerLink } from "@/lib/offer-link";
import { displayTitle } from "@/lib/display-title";
import { shortTitle } from "@/lib/short-title";
import { competitionLevel, deliveryWords, isSlowDelivery, rankingReason, rankingVerdict, trendSummary } from "@/scoring/ranking";
import { deleteDrop } from "./drop-actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const candidate = await getCandidateDetail(id);
  return { title: candidate ? `${shortTitle(displayTitle(candidate.product.title, candidate.breakdown))} · Trend-Radar` : "Nicht gefunden · Trend-Radar" };
}

/** Klartext-Zusammenfassung der wichtigsten Gründe – dieselben Zahlen wie in der Aufschlüsselung. */
function summarize(candidate: CandidateDetail): string[] {
  const { trend, margin, competition } = candidate.breakdown;
  const metric = demandMetric(candidate.demandSignal.source).label;
  const lines: string[] = [];
  if (trend.growth > 0) {
    const phase = trend.earlyComponent >= 0.5 ? "bei kaum Vorgeschichte – typisch für die Frühphase" : "auf bereits etabliertem Niveau";
    lines.push(`${metric} +${formatPercent(trend.growth)} gegenüber den 4 Wochen davor, ${phase}.`);
  } else {
    lines.push(`${metric} steigt aktuell nicht – der Trend-Anteil ist entsprechend niedrig.`);
  }
  lines.push(
    `Nach Versand, Zoll, Einfuhrumsatzsteuer und Gebühren bleiben ${formatMoney(margin.marginAbs, margin.currency)} je Stück (${formatPercent(margin.marginPct)} vom Nettoerlös).`,
  );
  const level = competition.score >= 0.5 ? "überschaubar" : "bereits hoch";
  const ads = candidate.breakdown.ads;
  const supplier = sourceLabel(candidate.product.source);
  const offersText = competition.resultCount !== null ? `${formatNumber(competition.resultCount)} Angebote auf ${supplier}` : null;
  if (ads?.covered) {
    const parts = [`${formatNumber(ads.advertisers ?? 0)} Shops werben im Land bereits dafür`, offersText].filter(Boolean);
    lines.push(`${parts.join(", ")} – Wettbewerb ${level}.`);
  } else if (offersText) {
    lines.push(`${offersText} – Wettbewerb ${level} (keine Werbedaten für dieses Land).`);
  }
  return lines;
}

export default async function ProductDetailPage({ params }: Params) {
  const { id } = await params;
  const candidate = await getCandidateDetail(id);
  if (!candidate) notFound();

  const { breakdown } = candidate;
  const dropOutcomes = await getDropOutcomes(candidate.productId, candidate.country, candidate.keyword);
  const today = new Date().toISOString().slice(0, 10);
  const country = candidate.country as Country;
  const categoryLabel = radarConfig.categories[candidate.category as CategoryId]?.label ?? candidate.category;
  const demoSources = Object.entries(candidate.sourceModes).filter(([, mode]) => mode === "mock").map(([s]) => sourceLabel(s));
  const referenceSourceLabel =
    candidate.referencePriceSource === "config-multiplikator"
      ? `Schätzung: Einkauf × Faktor ${formatNumber(radarConfig.categories[candidate.category as CategoryId]?.retailMultiplier ?? 0, 1)} (keine Shopping-Preise)`
      : `Median aus ${breakdown.referencePrice.sampleSize ?? "?"} Angeboten (${sourceLabel(candidate.referencePriceSource)}${breakdown.offer?.productQuery ? `, Suche „${breakdown.offer.productQuery}“` : ""})`;
  const ranking = { trend: breakdown.trend, competition: breakdown.competition, total: candidate.totalScore, belowMinMargin: candidate.belowMinMargin };
  const verdict = rankingVerdict(ranking);
  const { margin } = breakdown;
  const priceEstimated = candidate.referencePriceSource === "config-multiplikator";
  const metric = demandMetric(candidate.demandSignal.source);
  const delivery = deliveryWords(breakdown.delivery);
  const link = offerLink(candidate.product, candidate.sourceModes, candidate.keyword);
  const slowDelivery = isSlowDelivery(breakdown.delivery);
  const historyPoints = candidate.history.map((h) => ({
    // Uhrzeit mit anzeigen: Mehrere Läufe am selben Tag sollen unterscheidbar bleiben.
    label: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(h.startedAt),
    score: Math.round(h.totalScore * 10) / 10,
  }));

  return (
    <>
      <AppHeader />
      <main id="inhalt" className="mx-auto grid max-w-[960px] gap-6 px-4 pb-16 pt-6 sm:px-6">
        <Link href="/" className="flex w-fit items-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Zur Rangliste
        </Link>

        <section aria-labelledby="produkt-titel" className="grid gap-5">
          <div className="flex gap-4">
            <ProductImage src={candidate.product.imageUrl} name={candidate.product.title} className="size-20 shrink-0 rounded-xl sm:size-28" />
            <div className="grid min-w-0 content-start gap-1.5">
              <h1 id="produkt-titel" className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
                {shortTitle(displayTitle(candidate.product.title, breakdown))}
              </h1>
              <p className="text-sm text-muted-foreground">
                {radarConfig.countries[country].label} · {categoryLabel}
              </p>
              <p className="line-clamp-2 text-xs text-subtle-foreground" title={candidate.product.title}>
                Originaltitel: {candidate.product.title}
              </p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {link ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-md border bg-card px-2.5 py-1.5 font-medium transition hover:bg-accent active:scale-[0.98]"
                  >
                    {link.demo
                      ? `Demo-Angebot – ähnliche auf ${sourceLabel(candidate.product.source)} suchen`
                      : `Auf ${sourceLabel(candidate.product.source)} ansehen`}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">(neuer Tab)</span>
                  </a>
                ) : null}
                {demoSources.length > 0 ? (
                  <span className="flex items-center gap-1 rounded-md border border-status-warning/40 px-2.5 py-1.5 text-status-warning">
                    <FlaskConical className="size-3.5" aria-hidden="true" />
                    Demo-Daten: {demoSources.join(", ")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div aria-label="Antwort" className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6">
            <div className="grid gap-2">
              <VerdictBadge label={verdict} tone={VERDICT_TONE[verdict]} className="w-fit px-3 py-1 text-base" />
              <p className="text-base leading-relaxed">{rankingReason(ranking)}</p>
              {slowDelivery ? (
                <p className="flex items-start gap-1.5 text-sm text-status-warning">
                  <Truck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Lieferzeit {delivery} – länger als {radarConfig.shipping.maxDeliveryDays} Tage, für einen Drop eigentlich zu lang. Ein Angebot mit Lager in Europa suchen.
                </p>
              ) : null}
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/60 p-3">
                <dt className="text-sm text-muted-foreground">Kaufen für</dt>
                <dd className="text-2xl font-semibold tabular">{formatMoneyRounded(margin.purchase, margin.currency)}</dd>
                <dd className="text-xs text-muted-foreground">
                  mit Versand, Zoll &amp; Steuern {formatMoneyRounded(margin.landedCost, margin.currency)}
                  {margin.shippingSource === "config" ? " (Versand geschätzt)" : ""}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <dt className="text-sm text-muted-foreground">Verkaufen für</dt>
                <dd className="text-2xl font-semibold tabular">{formatMoneyRounded(margin.referencePrice, margin.currency)}</dd>
                <dd className="text-xs text-muted-foreground">{priceEstimated ? "geschätzt – kein Marktpreis gefunden" : "üblicher Marktpreis"}</dd>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <dt className="text-sm text-muted-foreground">Bleibt pro Stück</dt>
                <dd className={`text-2xl font-semibold tabular ${candidate.belowMinMargin ? "text-status-critical" : "text-status-good"}`}>
                  {formatMoneyRounded(margin.marginAbs, margin.currency)}
                </dd>
                <dd className="text-xs text-muted-foreground">{formatPercent(margin.marginPct)} vom Nettoerlös</dd>
              </div>
            </dl>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Trend:</dt>
                <dd className="font-medium">{trendSummary(breakdown.trend)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Konkurrenz:</dt>
                <dd className="font-medium">{competitionLevel(breakdown.competition)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Lieferzeit:</dt>
                <dd className={slowDelivery ? "font-medium text-status-warning" : "font-medium"}>
                  {delivery ? `${delivery}${breakdown.delivery?.shipFrom ? ` aus ${breakdown.delivery.shipFrom}` : ""}` : "keine Angabe"}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section aria-labelledby="trend-titel" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <div className="grid gap-0.5">
            <h2 id="trend-titel" className="text-lg font-semibold">
              {metric.label} „{candidate.keyword}“ · {country}
            </h2>
            <p className="text-xs text-muted-foreground">{metric.note}</p>
          </div>
          <TrendChart series={candidate.series} metricLabel={metric.label} recentWeeks={radarConfig.trend.recentWeeks} previousWeeks={radarConfig.trend.previousWeeks} />
        </section>

        <section aria-labelledby="verlauf-titel" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <h2 id="verlauf-titel" className="text-lg font-semibold">Bewertung über alle Läufe</h2>
          {historyPoints.length >= 2 ? (
            <ScoreHistoryChart points={historyPoints} />
          ) : (
            <p className="text-sm text-muted-foreground">Erst ein Lauf vorhanden – der Verlauf erscheint ab dem zweiten Lauf.</p>
          )}
        </section>

        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
            <span className="grid gap-0.5">
              <span className="font-display text-lg font-semibold">Technische Aufschlüsselung</span>
              <span className="text-sm text-muted-foreground">Score, Rechenweg der Marge, Datenquellen</span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="grid gap-8 border-t p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <ul className="grid content-start gap-1.5 border-l-2 border-primary/60 pl-4 text-sm leading-relaxed">
                {summarize(candidate).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Gesamtscore</p>
                <p className="my-1 text-4xl leading-none font-semibold tabular">{formatNumber(candidate.totalScore, 1)}</p>
                <ScoreBar score={breakdown.score} className="my-3 h-2.5" />
                <ScoreLegend />
                <dl className="mt-4 grid gap-1 border-t pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Match-Relevanz</dt>
                    <dd className="tabular">{formatPercent(candidate.relevance)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Bewertet durch</dt>
                    <dd className="text-right">{judgeLabel(candidate.matchJudge)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground italic">„{candidate.matchReason}“</p>
              </div>
            </div>
            <div className="grid gap-3">
              <h3 className="text-base font-semibold">Score-Aufschlüsselung</h3>
              <ScoreBreakdown breakdown={breakdown} supplierLabel={sourceLabel(candidate.product.source)} />
            </div>
            <div className="grid gap-3">
              <h3 className="text-base font-semibold">Kalkulation</h3>
              <MarginBreakdown margin={breakdown.margin} referenceSourceLabel={referenceSourceLabel} />
            </div>
            <div className="grid gap-1 text-xs text-subtle-foreground">
              <p>
                Nachfrage: {sourceLabel(candidate.demandSignal.source)}
                {candidate.demandSignal.seedTerm?.startsWith("#") ? ` (${candidate.demandSignal.seedTerm})` : ""}, abgerufen {formatDateTime(candidate.demandSignal.fetchedAt)}
                {candidate.demandSignal.source === "tiktok-trends" ? " über Scraping-Dienst" : ""}
              </p>
              <p>Angebot abgerufen: {formatDateTime(candidate.supplyOffer.fetchedAt)} ({sourceLabel(candidate.product.source)}, Produkt-ID {candidate.product.externalId})</p>
              {candidate.referencePriceMeta ? <p>Referenzpreis abgerufen: {formatDateTime(candidate.referencePriceMeta.fetchedAt)}</p> : null}
              <p>
                Wechselkurse:{" "}
                {breakdown.fx?.source === "ezb" && breakdown.fx.date
                  ? `EZB-Referenzkurse vom ${new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${breakdown.fx.date}T00:00:00Z`))}`
                  : "feste Werte aus der Config"}
              </p>
              <p>
                Lauf {candidate.runId} vom {formatDateTime(candidate.run.startedAt)} · Config-Version {candidate.run.configVersion}
              </p>
            </div>
          </div>
        </details>

        <section aria-labelledby="recherche-titel" className="grid gap-3">
          <h2 id="recherche-titel" className="text-lg font-semibold">Recherche zu „{candidate.keyword}“</h2>
          <ResearchLinks name={candidate.keyword} country={country} />
        </section>

        <section aria-labelledby="werbung-titel" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <div className="grid gap-0.5">
            <h2 id="werbung-titel" className="text-lg font-semibold">Werbeaktivität · {country}</h2>
            <p className="text-xs text-muted-foreground">Meta Ad Library &amp; TikTok Ad Library, aktive Anzeigen zum Keyword</p>
          </div>
          <AdActivity ads={breakdown.ads} country={country} />
        </section>

        <section aria-labelledby="drop-titel" className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
          <div>
            <h2 id="drop-titel" className="text-lg font-semibold">Drop-Ergebnis</h2>
            <p className="text-sm text-muted-foreground">
              Habt ihr das Produkt gedroppt? Das Ergebnis fließt in die{" "}
              <Link href="/kalibrierung" className="text-primary underline-offset-4 hover:underline">
                Kalibrierung
              </Link>{" "}
              ein – verglichen mit den Scores dieses Laufs.
            </p>
          </div>
          {dropOutcomes.length > 0 ? (
            <ul className="grid gap-2" aria-label="Erfasste Ergebnisse">
              {dropOutcomes.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{o.verdict === "TOP" ? "Top" : o.verdict === "OK" ? "Okay" : "Flop"}</span>
                    <span className="text-xs text-muted-foreground tabular">{formatWeek(o.droppedAt.toISOString().slice(0, 10))}</span>
                    {o.unitsSold !== null ? <span className="text-xs tabular">{formatNumber(o.unitsSold)} Stück</span> : null}
                    {o.returnRate !== null ? <span className="text-xs tabular">{formatPercent(o.returnRate, 1)} Retouren</span> : null}
                    {o.note ? <span className="text-xs text-muted-foreground">„{o.note}“</span> : null}
                  </span>
                  <form action={deleteDrop}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="snapshotId" value={candidate.id} />
                    <ConfirmSubmitButton
                      message="Dieses Drop-Ergebnis wirklich löschen?"
                      className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                    >
                      Löschen
                    </ConfirmSubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <DropFeedbackForm candidateSnapshotId={candidate.id} today={today} />
        </section>

      </main>
    </>
  );
}
