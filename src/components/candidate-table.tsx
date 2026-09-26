import Link from "next/link";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { radarConfig, type CategoryId, type Country } from "@/config/radar.config";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { demandMetric, sourceLabel } from "@/lib/labels";
import type { CandidateRow } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { AdsBreakdown } from "@/scoring/ads";
import { momentumLabel } from "./ad-activity";
import { ScoreBar } from "./score-bar";
import { Sparkline } from "./sparkline";

function categoryLabel(id: string): string {
  return radarConfig.categories[id as CategoryId]?.label ?? id;
}

function growthLabel(growth: number): string {
  if (growth <= 0) return "kein Anstieg";
  return `+${formatPercent(growth)} ggü. Vorperiode`;
}


/** „neue Anz.: +100 %“ – bei ganz neuer oder fehlender Werbung nur der Klartext, ohne doppeltes „neu“. */
function adMomentumText(ads: AdsBreakdown): string {
  const { growth, recent } = ads.momentum;
  const label = momentumLabel(growth, recent);
  return growth === null || (growth === 0 && recent === 0) ? label : `neue Anz.: ${label}`;
}

/** Werbetreibende im Zielland + Marktdynamik; „–“, wenn das Land nicht abgedeckt ist (CH, GB). */
function AdCell({ ads }: { ads: AdsBreakdown | undefined }) {
  if (!ads?.covered) {
    return (
      <span className="font-mono text-xs text-subtle-foreground" title="Keine Werbedaten für dieses Land (nur EU)">
        –
      </span>
    );
  }
  return (
    <>
      <div className="font-mono font-medium tabular">
        {ads.capped ? "≥ " : ""}
        {formatNumber(ads.advertisers ?? 0)}
      </div>
      <div className="font-mono text-[11px] text-muted-foreground tabular">{adMomentumText(ads)}</div>
    </>
  );
}

export function CandidateTable({ rows }: { rows: CandidateRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card/70 backdrop-blur-sm">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <caption className="sr-only">Drop-Kandidaten, sortiert nach gewählter Sortierung</caption>
        <thead>
          <tr className="border-b text-left font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <th scope="col" className="w-12 py-3 pl-4 pr-2 font-medium">#</th>
            <th scope="col" className="py-3 pr-4 font-medium">Produkt</th>
            <th scope="col" className="py-3 pr-4 font-medium">Land</th>
            <th scope="col" className="w-44 py-3 pr-4 font-medium">Score</th>
            <th scope="col" className="py-3 pr-4 font-medium">Trend</th>
            <th scope="col" className="py-3 pr-4 text-right font-medium">Marge / Stück</th>
            <th scope="col" className="py-3 pr-4 text-right font-medium">Werbung</th>
            <th scope="col" className="py-3 pr-4 font-medium">Quelle</th>
            <th scope="col" className="w-12 py-3 pr-4"><span className="sr-only">Link zum Lieferanten</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const trend = row.breakdown.trend;
            return (
              <tr
                key={row.id}
                className={cn(
                  "animate-rise group border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40",
                  row.belowMinMargin && "opacity-55",
                )}
                style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
              >
                <td className="py-3 pl-4 pr-2 align-top font-mono text-xs text-subtle-foreground tabular">{index + 1}</td>
                <td className="max-w-[340px] py-3 pr-4 align-top">
                  <Link
                    href={`/produkt/${row.id}`}
                    className="line-clamp-2 font-medium leading-snug decoration-primary/60 underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {row.product.title}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/85">{row.keyword}</span>
                    <span>{categoryLabel(row.category)}</span>
                    {row.belowMinMargin ? (
                      <span className="flex items-center gap-1 text-status-warning">
                        <TriangleAlert className="size-3" aria-hidden="true" />
                        unter Mindestmarge
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 pr-4 align-top">
                  <span className="font-mono text-xs" title={radarConfig.countries[row.country as Country].label}>{row.country}</span>
                </td>
                <td className="py-3 pr-4 align-top">
                  <div className="mb-1.5 font-mono text-lg font-semibold leading-none tabular">{formatNumber(row.totalScore, 1)}</div>
                  <ScoreBar score={row.breakdown.score} />
                </td>
                <td className="py-3 pr-4 align-top">
                  <Sparkline series={row.series} label={`${demandMetric(row.demandSignal.source).label} der letzten ${row.series.length} Wochen, aktuell ${formatNumber(trend.recent)} von 100, ${growthLabel(trend.growth)}`} />
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular">{growthLabel(trend.growth)}</div>
                </td>
                <td className="py-3 pr-4 text-right align-top">
                  <div className="font-mono font-medium tabular">{formatMoney(row.marginAbs, row.currency)}</div>
                  <div className="font-mono text-[11px] text-muted-foreground tabular">
                    {formatPercent(row.marginPct)} · VK {formatMoney(row.referencePrice, row.currency)}
                  </div>
                </td>
                <td className="py-3 pr-4 text-right align-top">
                  <AdCell ads={row.breakdown.ads} />
                </td>
                <td className="py-3 pr-4 align-top text-xs text-muted-foreground">
                  <div>
                    {sourceLabel(row.demandSignal.source)} · {sourceLabel(row.product.source)}
                  </div>
                  <div className="text-subtle-foreground">VK: {sourceLabel(row.referencePriceSource)}</div>
                </td>
                <td className="py-3 pr-4 align-top">
                  <a
                    href={row.product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${row.product.title} auf AliExpress öffnen (neuer Tab)`}
                    className="inline-grid size-8 place-items-center rounded-md border border-transparent text-muted-foreground transition hover:border-border hover:bg-accent hover:text-foreground active:scale-95"
                  >
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
