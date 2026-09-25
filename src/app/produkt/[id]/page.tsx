import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FlaskConical, TriangleAlert } from "lucide-react";
import { AdActivity } from "@/components/ad-activity";
import { AppHeader } from "@/components/app-header";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DropFeedbackForm } from "@/components/drop-feedback-form";
import { MarginBreakdown } from "@/components/margin-breakdown";
import { ScoreBar, ScoreLegend } from "@/components/score-bar";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { ScoreHistoryChart } from "@/components/score-history-chart";
import { TrendChart } from "@/components/trend-chart";
import { radarConfig, type CategoryId, type Country } from "@/config/radar.config";
import { formatDateTime, formatMoney, formatNumber, formatPercent, formatWeek } from "@/lib/format";
import { demandMetric, judgeLabel, sourceLabel } from "@/lib/labels";
import { getCandidateDetail, getDropOutcomes, type CandidateDetail } from "@/lib/queries";
import { deleteDrop } from "./drop-actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const candidate = await getCandidateDetail(id);
  return { title: candidate ? `${candidate.keyword} · Trend-Radar` : "Nicht gefunden · Trend-Radar" };
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
      ? `Schätzung: Einkauf × Faktor ${formatNumber(radarConfig.categories[candidate.category as CategoryId]?.retailMultiplier ?? 0, 1)} (keine Shopping-Treffer)`
      : `Median aus ${breakdown.referencePrice.sampleSize ?? "?"} Angeboten (${sourceLabel(candidate.referencePriceSource)})`;
  const historyPoints = candidate.history.map((h) => ({
    // Uhrzeit mit anzeigen: Mehrere Läufe am selben Tag sollen unterscheidbar bleiben.
    label: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(h.startedAt),
    score: Math.round(h.totalScore * 10) / 10,
  }));

  return (
    <>
      <AppHeader />
      <main id="inhalt" className="mx-auto grid max-w-[1200px] gap-10 px-4 pb-16 pt-6 sm:px-6">
        <Link href="/" className="flex w-fit items-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Zur Rangliste
        </Link>

        <section aria-labelledby="produkt-titel" className="animate-rise grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="grid content-start gap-3">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className="rounded border bg-muted/60 px-1.5 py-0.5 text-foreground">{candidate.keyword}</span>
              <span>via {sourceLabel(candidate.demandSignal.source)}{candidate.demandSignal.seedTerm?.startsWith("#") ? ` (${candidate.demandSignal.seedTerm})` : ""}</span>
              <span aria-hidden="true">·</span>
              <span>{radarConfig.countries[country].label}</span>
              <span aria-hidden="true">·</span>
              <span>{categoryLabel}</span>
            </div>
            <h1 id="produkt-titel" className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {candidate.product.title}
            </h1>
            <div className="flex flex-wrap gap-2 text-xs">
              <a
                href={candidate.product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 font-medium transition hover:bg-accent active:scale-[0.98]"
              >
                Auf {sourceLabel(candidate.product.source)} ansehen
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(neuer Tab)</span>
              </a>
              {candidate.belowMinMargin ? (
                <span className="flex items-center gap-1 rounded-md border border-status-warning/40 px-2.5 py-1.5 text-status-warning">
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                  Unter Mindestmarge
                </span>
              ) : null}
              {demoSources.length > 0 ? (
                <span className="flex items-center gap-1 rounded-md border border-status-warning/40 px-2.5 py-1.5 text-status-warning">
                  <FlaskConical className="size-3.5" aria-hidden="true" />
                  Demo-Daten: {demoSources.join(", ")}
                </span>
              ) : null}
            </div>
            <ul className="mt-2 grid gap-1.5 border-l-2 border-primary/60 pl-4 text-sm leading-relaxed text-foreground/90">
              {summarize(candidate).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <aside aria-label="Gesamtscore" className="rounded-xl border bg-card p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Gesamtscore</p>
            <p className="my-2 font-mono text-6xl font-semibold leading-none tracking-tight tabular">{formatNumber(candidate.totalScore, 1)}</p>
            <ScoreBar score={breakdown.score} className="mb-3 h-2.5" />
            <ScoreLegend />
            <dl className="mt-4 grid gap-1 border-t pt-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Match-Relevanz</dt>
                <dd className="font-mono tabular">{formatPercent(candidate.relevance)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Bewertet durch</dt>
                <dd className="text-right">{judgeLabel(candidate.matchJudge)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs italic leading-relaxed text-muted-foreground">„{candidate.matchReason}“</p>
          </aside>
        </section>

        <section aria-labelledby="warum-titel" className="grid gap-4">
          <h2 id="warum-titel" className="text-lg font-semibold">Warum steht es hier? Score-Aufschlüsselung</h2>
          <ScoreBreakdown breakdown={breakdown} supplierLabel={sourceLabel(candidate.product.source)} />
        </section>

        <section aria-labelledby="trend-titel" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="trend-titel" className="text-lg font-semibold">
              {demandMetric(candidate.demandSignal.source).label} „{candidate.keyword}“ · {country}
            </h2>
            <p className="text-xs text-muted-foreground">{demandMetric(candidate.demandSignal.source).note}</p>
          </div>
          <TrendChart
            series={candidate.series}
            metricLabel={demandMetric(candidate.demandSignal.source).label} recentWeeks={radarConfig.trend.recentWeeks} previousWeeks={radarConfig.trend.previousWeeks} />
        </section>

        <section aria-labelledby="werbung-titel" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="werbung-titel" className="text-lg font-semibold">Werbeaktivität · {country}</h2>
            <p className="text-xs text-muted-foreground">Meta Ad Library &amp; TikTok Ad Library, aktive Anzeigen zum Keyword</p>
          </div>
          <AdActivity ads={breakdown.ads} country={country} />
        </section>

        <section aria-labelledby="marge-block-titel" className="grid gap-4">
          <h2 id="marge-block-titel" className="text-lg font-semibold">Kalkulation</h2>
          <MarginBreakdown margin={breakdown.margin} referenceSourceLabel={referenceSourceLabel} />
        </section>

        <section aria-labelledby="verlauf-titel" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <h2 id="verlauf-titel" className="text-lg font-semibold">Score-Verlauf über alle Läufe</h2>
          {historyPoints.length >= 2 ? (
            <ScoreHistoryChart points={historyPoints} />
          ) : (
            <p className="text-sm text-muted-foreground">Erst ein Lauf vorhanden – der Verlauf erscheint ab dem zweiten Lauf.</p>
          )}
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
                    <span className="font-mono text-xs text-muted-foreground">{formatWeek(o.droppedAt.toISOString().slice(0, 10))}</span>
                    {o.unitsSold !== null ? <span className="font-mono text-xs">{formatNumber(o.unitsSold)} Stück</span> : null}
                    {o.returnRate !== null ? <span className="font-mono text-xs">{formatPercent(o.returnRate, 1)} Retouren</span> : null}
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

        <footer className="grid gap-1 border-t pt-4 font-mono text-[11px] text-subtle-foreground">
          <p>
            Nachfrage abgerufen: {formatDateTime(candidate.demandSignal.fetchedAt)} ({sourceLabel(candidate.demandSignal.source)}
            {candidate.demandSignal.source === "tiktok-trends" ? ", über Scraping-Dienst" : ""})
          </p>
          <p>Angebot abgerufen: {formatDateTime(candidate.supplyOffer.fetchedAt)} ({sourceLabel(candidate.product.source)}, Produkt-ID {candidate.product.externalId})</p>
          {candidate.referencePriceMeta ? <p>Referenzpreis abgerufen: {formatDateTime(candidate.referencePriceMeta.fetchedAt)}</p> : null}
          <p>
            Lauf {candidate.runId} vom {formatDateTime(candidate.run.startedAt)} · Config-Version {candidate.run.configVersion}
          </p>
        </footer>
      </main>
    </>
  );
}
