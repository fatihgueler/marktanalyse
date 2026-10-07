import { Radar, SearchX } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { CandidateTable } from "@/components/candidate-table";
import { FilterBar } from "@/components/filter-bar";
import { RunStatus, type RunNote } from "@/components/run-status";
import { ScoreLegend } from "@/components/score-bar";
import { CATEGORY_IDS, COUNTRIES, radarConfig } from "@/config/radar.config";
import { getCandidates, getCategoryCounts, getLatestRun, getProductChecks, parseFilters, type CheckRow, type SortKey } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SORT_OPTIONS = [
  { value: "score", label: "Gesamtscore" },
  { value: "marge", label: "Marge (%)" },
  { value: "trend", label: "Trend-Dynamik" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);
  const [run, manualInCountry] = await Promise.all([getLatestRun(), getProductChecks({ country: filters.country })]);
  const manualSorted = sortManual(
    manualInCountry.filter((c) => !filters.category || c.category === filters.category),
    filters.sort,
  );

  return (
    <>
      <AppHeader active="rangliste" />
      <main id="inhalt" className="mx-auto max-w-[1400px] px-4 pb-16 pt-8 sm:px-6">
        {!run ? (
          manualSorted.length > 0 ? (
            <CandidateTable rows={[]} manual={manualSorted} />
          ) : (
            <EmptyState
              icon={<Radar className="size-10" strokeWidth={1.5} aria-hidden="true" />}
              title="Noch kein Lauf vorhanden"
              text="Starte einen Datenlauf mit „npm run collect“ – ohne API-Keys läuft er mit Demo-Daten. Eigene Produkte prüfst du im Produkt-Check."
            />
          )
        ) : (
          <Dashboard runId={run.id} filters={filters} run={run} manual={manualSorted} manualInCountry={manualInCountry} />
        )}
      </main>
    </>
  );
}

/** Eigene Produkte nach der gewählten Sortierung: Trend nach Trend-Score, sonst nach Marge. */
function sortManual(rows: CheckRow[], sort: SortKey): CheckRow[] {
  const key = (r: CheckRow) => (sort === "trend" ? (r.trendScore ?? -1) : r.marginPct);
  return [...rows].sort((a, b) => key(b) - key(a));
}

async function Dashboard({
  runId,
  filters,
  run,
  manual,
  manualInCountry,
}: {
  runId: string;
  filters: ReturnType<typeof parseFilters>;
  run: NonNullable<Awaited<ReturnType<typeof getLatestRun>>>;
  manual: CheckRow[];
  /** für die Kategorie-Zähler im Filter: eigene Produkte des Landes, unabhängig von der gewählten Kategorie */
  manualInCountry: CheckRow[];
}) {
  const [rows, categoryCounts] = await Promise.all([getCandidates(runId, filters), getCategoryCounts(runId, filters.country)]);
  for (const check of manualInCountry) categoryCounts.set(check.category, (categoryCounts.get(check.category) ?? 0) + 1);
  const aboveMin = rows.filter((r) => !r.belowMinMargin).length;
  const notes = Array.isArray(run.errors) ? (run.errors as unknown as RunNote[]) : [];

  return (
    <>
      <section aria-labelledby="titel" className="animate-rise mb-8 grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Drop-Kandidaten</p>
            <h1 id="titel" className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              Was steigt, bevor es alle haben.
            </h1>
          </div>
          <dl className="flex gap-6 font-mono text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Kandidaten</dt>
              <dd className="text-2xl font-semibold tabular">{aboveMin}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Keywords geprüft</dt>
              <dd className="text-2xl font-semibold tabular">{run._count.demandSignals}</dd>
            </div>
          </dl>
        </div>
        <RunStatus startedAt={run.startedAt} status={run.status} sourceModes={run.sourceModes as Record<string, string>} notes={notes} />
      </section>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
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
        <ScoreLegend />
      </div>

      {rows.length === 0 && manual.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-10" strokeWidth={1.5} aria-hidden="true" />}
          title="Keine Kandidaten für diese Filter"
          text="Wähle ein anderes Land oder eine andere Kategorie."
        />
      ) : (
        <CandidateTable rows={rows} manual={manual} />
      )}
    </>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="animate-rise flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 px-6 py-20 text-center text-muted-foreground">
      {icon}
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-sm">{text}</p>
    </div>
  );
}
