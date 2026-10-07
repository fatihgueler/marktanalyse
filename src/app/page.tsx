import { Radar, SearchX } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { FilterBar } from "@/components/filter-bar";
import { ProductCard, VERDICT_TONE, type ProductCardData } from "@/components/product-card";
import { RunStatus, type RunNote } from "@/components/run-status";
import { CATEGORY_IDS, COUNTRIES, radarConfig, type CategoryId } from "@/config/radar.config";
import { groupCandidates, type CandidateGroup } from "@/lib/candidate-groups";
import { formatMoneyRounded, formatPercent } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/pipeline";
import { getCandidates, getCategoryCounts, getLatestRun, getProductChecks, parseFilters, type CandidateRow, type CheckRow, type SortKey } from "@/lib/queries";
import { shortTitle } from "@/lib/short-title";
import type { CheckVerdict } from "@/scoring/product-check";
import { competitionLevel, rankingVerdict, trendSummary } from "@/scoring/ranking";

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

function cardFromGroup(group: CandidateGroup<CandidateRow>): ProductCardData {
  const { best } = group;
  const verdict = rankingVerdict({
    trend: best.breakdown.trend,
    competition: best.breakdown.competition,
    total: best.totalScore,
    belowMinMargin: best.belowMinMargin,
  });
  return {
    href: `/produkt/${best.id}`,
    name: shortTitle(best.product.title),
    imageUrl: best.product.imageUrl ?? group.rows.find((r) => r.product.imageUrl)?.product.imageUrl ?? null,
    subtitle: [categoryLabel(best.category), group.offerCount > 1 ? `${group.offerCount} Angebote` : null].filter(Boolean).join(" · "),
    verdict: { label: verdict, tone: VERDICT_TONE[verdict] },
    facts: [
      { label: "Trend", value: trendSummary(best.breakdown.trend) },
      { label: "Marge pro Stück", value: marginText(best.marginAbs, best.marginPct, best.currency) },
      { label: "Konkurrenz", value: competitionLevel(best.breakdown.competition) },
    ],
    chips: group.countries.map((c) => `${c.country} ${c.score}`),
    externalUrl: best.product.url,
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
    externalUrl: check.url,
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
  const manual = sortManual(
    manualInCountry.filter((c) => !filters.category || c.category === filters.category),
    filters.sort,
  );
  const [rows, categoryCounts] = run
    ? await Promise.all([getCandidates(run.id, filters), getCategoryCounts(run.id, filters.country)])
    : [[] as CandidateRow[], new Map<string, number>()];
  for (const check of manualInCountry) categoryCounts.set(check.category, (categoryCounts.get(check.category) ?? 0) + 1);
  const groups = groupCandidates(rows, filters.sort);
  const notes = run && Array.isArray(run.errors) ? (run.errors as unknown as RunNote[]) : [];

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
              {groups.length} Produkte{manual.length > 0 ? ` · ${manual.length} eigene` : ""}
            </p>
          </div>
          {run ? (
            <RunStatus startedAt={run.startedAt} status={run.status} sourceModes={run.sourceModes as Record<string, string>} notes={notes} />
          ) : (
            <p className="text-sm text-muted-foreground">Noch kein Datenlauf. Eigene Produkte prüfst du im Produkt-Check.</p>
          )}
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
        />

        {manual.length > 0 ? (
          <section aria-labelledby="eigene-titel" className="grid gap-3">
            <h2 id="eigene-titel" className="text-lg font-semibold">
              Eigene Produkte
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {manual.map((check) => (
                <ProductCard key={check.id} data={cardFromCheck(check)} />
              ))}
            </ul>
          </section>
        ) : null}

        {groups.length > 0 ? (
          <section aria-labelledby="auto-titel" className="grid gap-3">
            {manual.length > 0 ? (
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
                <ProductCard key={group.best.id} data={cardFromGroup(group)} />
              ))}
            </ul>
          </section>
        ) : null}

        {groups.length === 0 && manual.length === 0 ? (
          run ? (
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
