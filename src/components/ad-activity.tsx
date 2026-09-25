import { ArrowUpRight, Megaphone } from "lucide-react";
import { radarConfig, type Country } from "@/config/radar.config";
import { formatNumber, formatPercent, formatWeek } from "@/lib/format";
import { sourceLabel } from "@/lib/labels";
import type { AdsBreakdown } from "@/scoring/ads";

const BAR_HEIGHT = 56;

export function momentumLabel(growth: number | null, recent: number): string {
  if (growth === null) return recent > 0 ? "neu gestartet" : "keine neuen Anzeigen";
  if (growth === 0 && recent === 0) return "keine neuen Anzeigen";
  return growth > 0 ? `+${formatPercent(growth)}` : formatPercent(growth);
}

/** Neue Anzeigen je Woche als schlichte Säulen – eine Serie, daher ohne Legende. */
function WeeklyBars({ weeks }: { weeks: AdsBreakdown["newAdsPerWeek"] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <div className="grid gap-1">
      <div className="flex h-14 items-end gap-[2px]" role="img" aria-label={`Neue Anzeigen je Woche: ${weeks.map((w) => w.count).join(", ")}`}>
        {weeks.map((w) => (
          <div key={w.weekStart} className="group relative flex-1">
            <div className="rounded-t-[3px] bg-series-competition/80 transition-colors group-hover:bg-series-competition" style={{ height: `${Math.max(2, (w.count / max) * BAR_HEIGHT)}px` }} />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 font-mono text-[10px] group-hover:block">
              {formatWeek(w.weekStart)}: {w.count}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-subtle-foreground">
        <span>{weeks[0] ? formatWeek(weeks[0].weekStart) : ""}</span>
        <span>{weeks.at(-1) ? formatWeek(weeks.at(-1)!.weekStart) : ""}</span>
      </div>
    </div>
  );
}

export function AdActivity({ ads, country }: { ads: AdsBreakdown | undefined; country: Country }) {
  if (!ads) {
    return <p className="text-sm text-muted-foreground">Für diesen Lauf liegen keine Werbedaten vor (Lauf vor Phase 2).</p>;
  }
  if (!ads.covered) {
    return (
      <p className="text-sm text-muted-foreground">
        Die Werbebibliotheken zeigen Produktanzeigen nur für die EU. Für {radarConfig.countries[country].label} gibt es daher keine Daten – der Werbedruck wird neutral gewertet.
      </p>
    );
  }
  const { momentum } = ads;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <div className="grid content-start gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Werbetreibende", value: `${ads.capped ? "≥ " : ""}${formatNumber(ads.advertisers ?? 0)}` },
            { label: "Aktive Anzeigen", value: `${ads.capped ? "≥ " : ""}${formatNumber(ads.activeAds)}` },
            { label: "Erste Anzeige", value: ads.firstSeen ? formatWeek(ads.firstSeen) : "–" },
            { label: `Neue Anz. ${momentum.weeks} Wo.`, value: momentumLabel(momentum.growth, momentum.recent) },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border bg-background/40 p-3">
              <dt className="text-[11px] text-muted-foreground">{tile.label}</dt>
              <dd className="mt-1 font-mono text-lg font-semibold tabular">{tile.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Marktdynamik: {formatNumber(momentum.recent)} neue Anzeigen in den letzten {momentum.weeks} Wochen gegenüber {formatNumber(momentum.previous)} davor. Wird bis zur
          Kalibrierung nur angezeigt, nicht gewichtet.
        </p>
        <WeeklyBars weeks={ads.newAdsPerWeek} />
      </div>
      <div className="grid content-start gap-3 text-sm">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="pb-1 font-medium">Quelle</th>
              <th scope="col" className="pb-1 text-right font-medium">Werbetreibende</th>
              <th scope="col" className="pb-1 text-right font-medium">Anzeigen</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular">
            {ads.sources.map((s) => (
              <tr key={s.source} className="border-t border-border/60">
                <td className="py-1.5 font-sans">{sourceLabel(s.source)}</td>
                <td className="py-1.5 text-right">{s.coverage ? `${s.capped ? "≥ " : ""}${s.advertisers}` : "–"}</td>
                <td className="py-1.5 text-right">{s.coverage ? s.activeAds : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ads.samples.length > 0 ? (
          <ul className="grid gap-1.5" aria-label="Beispiel-Anzeigen">
            {ads.samples.map((sample, i) => (
              <li key={`${sample.source}-${i}`} className="flex items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <Megaphone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{sample.advertiser}</span>
                  <span className="shrink-0 font-mono text-subtle-foreground">seit {formatWeek(sample.startedAt)}</span>
                </span>
                {sample.previewUrl ? (
                  <a href={sample.previewUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-0.5 text-muted-foreground hover:text-foreground">
                    Anzeige <ArrowUpRight className="size-3" aria-hidden="true" />
                    <span className="sr-only">(neuer Tab)</span>
                  </a>
                ) : (
                  <span className="shrink-0 text-subtle-foreground">Demo</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
