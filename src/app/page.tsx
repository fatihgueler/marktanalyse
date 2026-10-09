import { Radar, SearchX } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { FilterBar } from "@/components/filter-bar";
import { ProductCard, VERDICT_TONE, type ProductCardData } from "@/components/product-card";
import { RunStatus, type RunNote } from "@/components/run-status";
import { CATEGORY_IDS, COUNTRIES, radarConfig, type CategoryId } from "@/config/radar.config";
import { groupCandidates, type CandidateGroup } from "@/lib/candidate-groups";
import { formatMoneyRounded, formatPercent } from "@/lib/format";
import { groupMovement, indexPrevious, type Movement } from "@/lib/movement";
import { offerLink } from "@/lib/offer-link";
import { STAGE_LABELS } from "@/lib/pipeline";
import {
  getCandidates,
  getCategoryCounts,
  getComparisonRun,
  getLatestRun,
  getRunStart,
  getPreviousCandidates,
  getProductChecks,
  hiddenDemoSources,
  parseFilters,
  type CandidateRow,
  type CheckRow,
  type SortKey,
} from "@/lib/queries";
import { sourceLabel } from "@/lib/labels";
import { displayTitle } from "@/lib/display-title";
import { shortTitle } from "@/lib/short-title";
import type { CheckVerdict } from "@/scoring/product-check";
import { SUPPLY_SOURCES } from "@/sources/readiness";
import { competitionLevel, deliveryWords, isSlowDelivery, rankingVerdict, trendSummary } from "@/scoring/ranking";

export const dynamic = "force-dynamic";

const SORT_OPTIONS = [
  { value: "score", label: "Empfehlung" },
  { value: "marge", label: "Marge" },
  { value: "trend", label: "Trend" },
];

function categoryLabel(id: string): string {
  return radarConfig.categories[id as CategoryId]?.label ?? id;
}

function marginText(abs: number, pct: number, currency: string): string {
  return `${formatMoneyRounded(abs, currency)} · ${formatPercent(pct)}`;
}

const SHORT_DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

function movementBadge(movement: Movement, since: Date): ProductCardData["movement"] {
  if (!movement) return null;
  const date = SHORT_DATE.format(since);
  return movement.kind === "neu"
    ? { label: "Neu", title: `nicht im Lauf vom ${date}` }
    : { label: `+${movement.delta} Punkte`, title: `gegenüber dem Lauf vom ${date}` };
}

function deliveryBadge(row: CandidateRow): ProductCardData["delivery"] {
  const label = deliveryWords(row.breakdown.delivery);
  if (!label) return null;
  const slow = isSlowDelivery(row.breakdown.delivery);
  const from = row.breakdown.delivery?.shipFrom ? ` aus ${row.breakdown.delivery.shipFrom}` : "";
  return {
    label,
    slow,
    title: slow ? `Lieferzeit${from} ${label} – länger als ${radarConfig.shipping.maxDeliveryDays} Tage` : `Lieferzeit${from} laut Anbieter`,
  };
}

function cardFromGroup(group: CandidateGroup<CandidateRow>, movement: ProductCardData["movement"], sourceModes: unknown): ProductCardData {
  const { best } = group;
  const verdict = rankingVerdict({
    trend: best.breakdown.trend,
    competition: best.breakdown.competition,
    total: best.totalScore,
    belowMinMargin: best.belowMinMargin,
  });
  return {
    href: `/produkt/${best.id}`,
    name: shortTitle(displayTitle(best.product.title, best.breakdown)),
    imageUrl: best.product.imageUrl ?? group.rows.find((r) => r.product.imageUrl)?.product.imageUrl ?? null,
    subtitle: [categoryLabel(best.category), group.offerCount > 1 ? `${group.offerCount} Angebote` : null].filter(Boolean).join(" · "),
    verdict: { label: verdict, tone: VERDICT_TONE[verdict] },
    facts: [
      { label: "Trend", value: trendSummary(best.breakdown.trend) },
      { label: "Marge pro Stück", value: marginText(best.marginAbs, best.marginPct, best.currency) },
      { label: "Konkurrenz", value: competitionLevel(best.breakdown.competition) },
    ],
    chips: group.countries.map((c) => `${c.country} ${c.score}`),
    delivery: deliveryBadge(best),
    movement,
    external: offerLink(best.product, sourceModes, best.keyword),
  };
}

function cardFromCheck(check: CheckRow): ProductCardData {
  const verdict = check.verdict as CheckVerdict;
  const margin = check.view.result.margin;
  return {
    href: `/merkliste/${check.id}`,
    name: check.name,
    imageUrl: null,
    subtitle: categoryLabel(check.category),
    verdict: { label: verdict, tone: VERDICT_TONE[verdict] ?? "watch" },
    facts: [
      { label: "Trend", value: check.trendPhase ?? "keine Kurve" },
      { label: "Marge pro Stück", value: marginText(check.marginAbs, check.marginPct, margin.currency) },
      { label: "Konkurrenz", value: "nicht erfasst" },
    ],
    chips: [check.country],
    badge: `Merkliste: ${STAGE_LABELS[check.stage]}`,
    external: check.url ? { url: check.url, label: "Angebot" } : null,
  };
}

/** Eigene Produkte nach der gewählten Sortierung: Trend nach Trend-Score, sonst nach Marge. */
function sortManual(rows: CheckRow[], sort: SortKey): CheckRow[] {
  const key = (r: CheckRow) => (sort === "trend" ? (r.trendScore ?? -1) : r.marginPct);
  return [...rows].sort((a, b) => key(b) - key(a));
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);
  const [run, manualInCountry] = await Promise.all([getLatestRun(), getProductChecks({ country: filters.country })]);
  // Echter Lauf: Angebote aus Demo-Quellen (erfundene Produkte) ausblenden
  const hidden = run ? hiddenDemoSources(run.sourceModes) : [];
  const hiddenSupply = hidden.filter((id) => SUPPLY_SOURCES.includes(id));
  const manual = sortManual(
    manualInCountry.filter((c) => !filters.category || c.category === filters.category),
    filters.sort,
  );
  const [rows, categoryCounts] = run
    ? await Promise.all([getCandidates(run.id, filters, hidden), getCategoryCounts(run.id, filters.country, hidden)])
    : [[] as CandidateRow[], new Map<string, number>()];
  for (const check of manualInCountry) categoryCounts.set(check.category, (categoryCounts.get(check.category) ?? 0) + 1);
  // Saisonware: ein Produkt gilt als saisonal, wenn es in irgendeinem Land als „Saison“ erkannt wurde.
  const groupedAll = groupCandidates(
    rows.map((row) => ({ ...row, slowDelivery: isSlowDelivery(row.breakdown.delivery) })),
    filters.sort,
  );
  const isSeasonalGroup = (g: (typeof groupedAll)[number]) => g.rows.some((r) => r.breakdown.trend.seasonal);
  const seasonalGroups = groupedAll.filter(isSeasonalGroup).length;
  const allGroups = filters.hideSeasonal ? groupedAll.filter((g) => !isSeasonalGroup(g)) : groupedAll;

  // „Neu diese Woche“: Vergleich mit dem Lauf von vor mindestens `compareMinDaysBack` Tagen.
  const comparison = run ? await getComparisonRun(run) : null;
  const previous = comparison ? indexPrevious(await getPreviousCandidates(comparison.id, filters.country, hiddenDemoSources(comparison.sourceModes))) : null;
  const movements = new Map(allGroups.map((g) => [g.best.id, previous ? groupMovement(g.rows, previous) : null]));
  const moved = allGroups.filter((g) => movements.get(g.best.id));
  const newCount = moved.filter((g) => movements.get(g.best.id)?.kind === "neu").length;
  const onlyNew = filters.onlyNew && comparison !== null;
  const groups = onlyNew ? moved : allGroups;
  const shownManual = onlyNew ? [] : manual;
  const notes = run && Array.isArray(run.errors) ? (run.errors as unknown as RunNote[]) : [];
  const rescoreOf = run?.rescoreOf ? { startedAt: await getRunStart(run.rescoreOf) } : null;

  return (
    <>
      <AppHeader active="rangliste" />
      <main id="inhalt" className="mx-auto grid max-w-[1400px] gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <section aria-labelledby="titel" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h1 id="titel" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Drop-Kandidaten
            </h1>
            <p className="text-sm text-muted-foreground tabular">
              {groups.length} {groups.length === 1 ? "Produkt" : "Produkte"}{shownManual.length > 0 ? ` · ${shownManual.length} eigene` : ""}
            </p>
          </div>
          {run ? (
            <RunStatus startedAt={run.startedAt} status={run.status} sourceModes={run.sourceModes as Record<string, string>} notes={notes} rescoreOf={rescoreOf} />
          ) : (
            <p className="text-sm text-muted-foreground">Noch kein Datenlauf. Eigene Produkte prüfst du im Produkt-Check.</p>
          )}
          {hiddenSupply.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Ausgeblendet: Demo-Angebote von {hiddenSupply.map((id) => sourceLabel(id)).join(" und ")} – diese Produkte gibt es nicht. Sie erscheinen echt, sobald die Zugänge
              eingetragen sind.
            </p>
          ) : null}
          {run ? (
            <p className="text-sm text-muted-foreground">
              {comparison
                ? `Seit dem Lauf vom ${SHORT_DATE.format(comparison.startedAt)}: ${newCount} neu, ${moved.length - newCount} deutlich gestiegen.` +
                  (comparison.configVersion !== run.configVersion ? " Die Bewertungsregeln wurden seitdem geändert, Punktsprünge können auch daher kommen." : "")
                : `„Neu diese Woche“ erscheint, sobald es einen Lauf gibt, der mindestens ${radarConfig.ranking.compareMinDaysBack} Tage älter ist.`}
            </p>
          ) : null}
        </section>

        <FilterBar
          countries={COUNTRIES.map((c) => ({ value: c, label: c }))}
          categories={CATEGORY_IDS.filter((id) => categoryCounts.has(id)).map((id) => ({
            value: id,
            label: radarConfig.categories[id].label,
            count: categoryCounts.get(id),
          }))}
          sorts={SORT_OPTIONS}
          current={{ country: filters.country, category: filters.category, sort: filters.sort }}
          newToggle={comparison ? { count: moved.length, active: onlyNew } : undefined}
          seasonToggle={seasonalGroups > 0 || filters.hideSeasonal ? { count: seasonalGroups, active: filters.hideSeasonal } : undefined}
        />

        {shownManual.length > 0 ? (
          <section aria-labelledby="eigene-titel" className="grid gap-3">
            <h2 id="eigene-titel" className="text-lg font-semibold">
              Eigene Produkte
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {shownManual.map((check) => (
                <ProductCard key={check.id} data={cardFromCheck(check)} />
              ))}
            </ul>
          </section>
        ) : null}

        {groups.length > 0 ? (
          <section aria-labelledby="auto-titel" className="grid gap-3">
            {shownManual.length > 0 ? (
              <h2 id="auto-titel" className="text-lg font-semibold">
                Automatisch gefunden
              </h2>
            ) : (
              <h2 id="auto-titel" className="sr-only">
                Automatisch gefunden
              </h2>
            )}
            <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {groups.map((group) => (
                <ProductCard
                  key={group.best.id}
                  data={cardFromGroup(group, comparison ? movementBadge(movements.get(group.best.id) ?? null, comparison.startedAt) : null, run?.sourceModes)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {groups.length === 0 && shownManual.length === 0 ? (
          onlyNew ? (
            <EmptyState
              icon={<SearchX className="size-10" strokeWidth={1.5} aria-hidden="true" />}
              title="Diese Woche nichts Neues"
              text="Kein neues oder deutlich gestiegenes Produkt für diese Filter. Schalte „Neu diese Woche“ aus, um alle zu sehen."
            />
          ) : run && hiddenSupply.length > 0 && !filters.country && !filters.category ? (
            <EmptyState
              icon={<SearchX className="size-10" strokeWidth={1.5} aria-hidden="true" />}
              title="Noch keine echten Angebote"
              text={`Der letzte echte Lauf hat keine Angebote aus echten Quellen gefunden. Demo-Angebote (${hiddenSupply.map((id) => sourceLabel(id)).join(", ")}) werden ausgeblendet, weil es diese Produkte nicht gibt. Sobald die AliExpress-Keys eingetragen sind, füllt der nächste Lauf die Liste.`}
            />
          ) : run ? (
            <EmptyState icon={<SearchX className="size-10" strokeWidth={1.5} aria-hidden="true" />} title="Keine Produkte für diese Filter" text="Wähle ein anderes Land oder eine andere Kategorie." />
          ) : (
            <EmptyState
              icon={<Radar className="size-10" strokeWidth={1.5} aria-hidden="true" />}
              title="Noch nichts zu sehen"
              text="Sobald ein Datenlauf da ist, erscheinen hier die Kandidaten. Bis dahin: Produkte im Produkt-Check durchrechnen."
            />
          )
        ) : null}
      </main>
    </>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-16 text-center text-muted-foreground">
      {icon}
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-sm">{text}</p>
    </div>
  );
}
