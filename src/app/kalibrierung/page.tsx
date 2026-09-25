import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { radarConfig } from "@/config/radar.config";
import { formatNumber, formatPercent, formatWeek } from "@/lib/format";
import { getCalibrationData } from "@/lib/queries";
import { calibrationStats, type CalibrationRow, type SignalKey, type SignalStat } from "@/scoring/calibration";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kalibrierung · Trend-Radar" };

const SIGNAL_LABELS: Record<SignalKey, { label: string; hint: string }> = {
  trend: { label: "Trend-Dynamik", hint: `Gewicht ${formatNumber(radarConfig.score.weights.trend, 2)}` },
  margin: { label: "Marge", hint: `Gewicht ${formatNumber(radarConfig.score.weights.margin, 2)}` },
  competition: { label: "Wettbewerb", hint: `Gewicht ${formatNumber(radarConfig.score.weights.competition, 2)}` },
  total: { label: "Gesamtscore", hint: "÷ 100" },
  adMomentum: { label: "Werbe-Dynamik", hint: "derzeit ungewichtet" },
};

const ASSESSMENT_STYLE: Record<SignalStat["assessment"], string> = {
  "trennt gut": "text-status-good",
  "trennt schwach": "text-foreground",
  "trennt nicht": "text-muted-foreground",
  umgekehrt: "text-status-warning",
  "zu wenige Daten": "text-subtle-foreground",
};

/** Konkrete Empfehlung je Signal – Änderungen an Gewichten bleiben eine bewusste Entscheidung in der Config. */
function recommendation(stat: SignalStat): string {
  if (stat.assessment === "zu wenige Daten") return "Mehr Drops erfassen.";
  if (stat.key === "adMomentum") {
    if (stat.assessment === "trennt gut") return "Steigende Werbung ging mit Erfolg einher – als positives Trend-Signal gewichten erwägen.";
    if (stat.assessment === "umgekehrt") return "Steigende Werbung ging mit Flops einher – eher als Wettbewerbssignal werten.";
    return "Kein klarer Zusammenhang – weiter nur anzeigen.";
  }
  if (stat.key === "total") return stat.assessment === "trennt gut" ? "Der Score sortiert Erfolge insgesamt richtig." : "Der Score trennt Erfolge noch nicht zuverlässig – Gewichte prüfen.";
  if (stat.assessment === "trennt gut") return "Gewicht beibehalten oder leicht erhöhen.";
  if (stat.assessment === "umgekehrt") return "Gewicht senken – das Signal zeigt in die falsche Richtung.";
  if (stat.assessment === "trennt nicht") return "Gewicht senken oder Parameter überprüfen.";
  return "Beobachten.";
}

function formatSignal(key: SignalKey, value: number | null): string {
  if (value === null) return "–";
  return key === "adMomentum" ? (value >= 0 ? `+${formatPercent(value)}` : formatPercent(value)) : formatNumber(value, 2);
}

export default async function CalibrationPage() {
  const outcomes = await getCalibrationData();
  const rows = outcomes.map((o) => o.row).filter((r): r is CalibrationRow => r !== null);
  const result = calibrationStats(rows);
  const { minPerGroup } = radarConfig.calibration;

  return (
    <>
      <AppHeader active="kalibrierung" />
      <main id="inhalt" className="mx-auto grid max-w-[1200px] gap-8 px-4 pb-16 pt-8 sm:px-6">
        <section aria-labelledby="titel" className="animate-rise grid gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Kalibrierung</p>
          <h1 id="titel" className="text-3xl font-bold tracking-tight">Welche Signale sagen Erfolg voraus?</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Vergleicht die Scores zum Zeitpunkt der Drop-Entscheidung zwischen Top- und Flop-Drops. Die Empfehlungen ändern nichts automatisch – Gewichte passt ihr bewusst in{" "}
            <code className="font-mono text-xs">src/config/radar.config.ts</code> an.
          </p>
        </section>

        <dl className="grid grid-cols-3 gap-3 sm:max-w-md">
          {(["TOP", "OK", "FLOP"] as const).map((verdict) => (
            <div key={verdict} className="rounded-lg border bg-card p-3">
              <dt className="text-xs text-muted-foreground">{verdict === "TOP" ? "Top" : verdict === "OK" ? "Okay" : "Flop"}</dt>
              <dd className="font-mono text-2xl font-semibold tabular">{result.counts[verdict]}</dd>
            </div>
          ))}
        </dl>

        {outcomes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center text-muted-foreground">
            <ClipboardList className="size-10" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-lg font-semibold text-foreground">Noch keine Drop-Ergebnisse</p>
            <p className="max-w-md text-sm">
              Erfasse Ergebnisse in der Detailansicht eines Kandidaten („Drop-Ergebnis“). Ab {minPerGroup} Top- und {minPerGroup} Flop-Drops erscheint hier eine Auswertung.
            </p>
            <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
              Zur Rangliste
            </Link>
          </div>
        ) : (
          <>
            <section aria-labelledby="signale-titel" className="grid gap-3">
              <h2 id="signale-titel" className="text-lg font-semibold">Signale im Vergleich</h2>
              {!result.enoughData ? (
                <p className="text-sm text-status-warning">
                  Noch zu wenige Daten: mindestens {minPerGroup} Top- und {minPerGroup} Flop-Drops nötig (aktuell {result.counts.TOP} / {result.counts.FLOP}).
                </p>
              ) : null}
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-left font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-medium">Signal</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Ø Top</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Ø Flop</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Differenz</th>
                      <th scope="col" className="px-4 py-3 font-medium">Bewertung</th>
                      <th scope="col" className="px-4 py-3 font-medium">Empfehlung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.signals.map((stat) => (
                      <tr key={stat.key} className="border-b border-border/60 last:border-0">
                        <th scope="row" className="px-4 py-3 text-left font-medium">
                          {SIGNAL_LABELS[stat.key].label}
                          <span className="block text-[11px] font-normal text-subtle-foreground">{SIGNAL_LABELS[stat.key].hint}</span>
                        </th>
                        <td className="px-4 py-3 text-right font-mono tabular">{formatSignal(stat.key, stat.topMean)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular">{formatSignal(stat.key, stat.flopMean)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular">{formatSignal(stat.key, stat.difference)}</td>
                        <td className={cn("px-4 py-3", ASSESSMENT_STYLE[stat.assessment])}>{stat.assessment}</td>
                        <td className="px-4 py-3 text-muted-foreground">{recommendation(stat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="drops-titel" className="grid gap-3">
              <h2 id="drops-titel" className="text-lg font-semibold">Erfasste Drops</h2>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b text-left font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-medium">Datum</th>
                      <th scope="col" className="px-4 py-3 font-medium">Produkt</th>
                      <th scope="col" className="px-4 py-3 font-medium">Land</th>
                      <th scope="col" className="px-4 py-3 font-medium">Urteil</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Stück</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Score damals</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">T / M / W</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomes.map((o) => (
                      <tr key={o.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">{formatWeek(o.droppedAt.toISOString().slice(0, 10))}</td>
                        <td className="max-w-[320px] px-4 py-3">
                          {o.candidateSnapshot ? (
                            <Link href={`/produkt/${o.candidateSnapshot.id}`} className="line-clamp-1 hover:underline">
                              {o.product.title}
                            </Link>
                          ) : (
                            <span className="line-clamp-1">{o.product.title}</span>
                          )}
                          <span className="font-mono text-[11px] text-muted-foreground">{o.keyword}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{o.country}</td>
                        <td className="px-4 py-3">{o.verdict === "TOP" ? "Top" : o.verdict === "OK" ? "Okay" : "Flop"}</td>
                        <td className="px-4 py-3 text-right font-mono tabular">{o.unitsSold ?? "–"}</td>
                        <td className="px-4 py-3 text-right font-mono tabular">{o.row ? formatNumber(o.row.total, 1) : "–"}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs tabular text-muted-foreground">
                          {o.row ? `${formatNumber(o.row.trend, 2)} / ${formatNumber(o.row.margin, 2)} / ${formatNumber(o.row.competition, 2)}` : "Snapshot gelöscht"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
