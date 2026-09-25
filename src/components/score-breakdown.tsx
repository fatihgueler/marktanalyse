import { formatNumber, formatPercent } from "@/lib/format";
import type { CandidateBreakdown } from "@/scoring/score";
import { cn } from "@/lib/utils";
import { SCORE_PARTS } from "./score-bar";

type PartKey = (typeof SCORE_PARTS)[number]["key"];

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border/70 py-1.5 last:border-0">
      <dt className="text-muted-foreground">
        {label}
        {hint ? <span className="block text-[11px] text-subtle-foreground">{hint}</span> : null}
      </dt>
      <dd className="whitespace-nowrap font-mono tabular">{value}</dd>
    </div>
  );
}

/** Drei Karten (Trend, Marge, Wettbewerb) mit Teil-Score, Gewicht, Beitrag und allen Zwischenwerten. */
export function ScoreBreakdown({ breakdown }: { breakdown: CandidateBreakdown }) {
  const { trend, margin, competition, score } = breakdown;
  const partScore: Record<PartKey, number> = { trend: trend.score, margin: margin.score, competition: competition.score };

  const details: Record<PartKey, React.ReactNode> = {
    trend: (
      <>
        <Row label="Ø letzte 4 Wochen" value={formatNumber(trend.recent, 1)} />
        <Row label="Ø 4 Wochen davor" value={formatNumber(trend.previous, 1)} />
        <Row label="Ø restliches Jahr" value={formatNumber(trend.baseline, 1)} hint="wenig Vorgeschichte = Frühphase" />
        <Row label="Wachstum" value={trend.growth > 0 ? `+${formatPercent(trend.growth)}` : formatPercent(trend.growth)} />
        <Row label={`Wachstum × ${formatNumber(trend.weights.growth, 2)}`} value={formatNumber(trend.growthComponent, 2)} />
        <Row label={`Frühphase × ${formatNumber(trend.weights.early, 2)}`} value={formatNumber(trend.earlyComponent, 2)} />
        <Row label={`Niveau × ${formatNumber(trend.weights.level, 2)}`} value={formatNumber(trend.levelComponent, 2)} />
        {trend.rejectedReason ? <p className="pt-2 text-xs text-status-warning">{trend.rejectedReason}</p> : null}
      </>
    ),
    margin: (
      <>
        <Row label="Marge je Stück" value={`${formatNumber(margin.marginAbs, 2)} ${margin.currency}`} />
        <Row label="Marge vom Nettoerlös" value={formatPercent(margin.marginPct, 1)} />
        <Row
          label="Skala"
          value={`${formatNumber(margin.minMarginPct * 100)}–${formatPercent(margin.targetMarginPct)}`}
          hint="Mindest- bis Zielmarge ergibt Teil-Score 0 bis 1"
        />
        <Row label="Mindest-Rohertrag" value={`${formatNumber(margin.minMarginAbs, 2)} ${margin.currency}`} hint={margin.belowMinMargin ? "unterschritten" : "erreicht"} />
      </>
    ),
    competition: (
      <>
        <Row label="Treffer auf AliExpress" value={competition.resultCount === null ? "unbekannt" : formatNumber(competition.resultCount)} hint="Anbieter-Proxy" />
        <Row label="Bestellungen / 30 Tage (Top-Treffer)" value={competition.orders30dSum === null ? "unbekannt" : formatNumber(competition.orders30dSum)} />
        <Row
          label="Werbetreibende im Land"
          value={competition.advertisers === null || competition.advertisers === undefined ? "keine Daten" : formatNumber(competition.advertisers)}
          hint="Meta + TikTok, nur EU"
        />
        <Row label={`Sättigung Anbieter × ${formatNumber(competition.weights.results, 2)}`} value={formatNumber(competition.resultsSaturation, 2)} />
        <Row label={`Sättigung Nachfrage × ${formatNumber(competition.weights.orders, 2)}`} value={formatNumber(competition.ordersSaturation, 2)} />
        {competition.advertisersSaturation !== undefined ? (
          <Row
            label={`Werbedruck × ${formatNumber(competition.weights.advertisers ?? 0, 2)}`}
            value={formatNumber(competition.advertisersSaturation, 2)}
            hint={competition.advertisers === null ? "neutral gewertet" : undefined}
          />
        ) : null}
      </>
    ),
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {SCORE_PARTS.map((part) => {
          const contribution = 100 * score.relevanceFactor * score.contributions[part.key];
          return (
            <article key={part.key} className="rounded-xl border bg-card p-4">
              <header className="mb-3 flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-2 font-semibold">
                  <span aria-hidden="true" className={cn("size-3 rounded-[3px]", part.className)} />
                  {part.label}
                </h3>
                <span className="text-right font-mono text-xs text-muted-foreground">
                  <span className="block text-xl font-semibold text-foreground tabular">+{formatNumber(contribution, 1)}</span>
                  Punkte
                </span>
              </header>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className={cn("h-full rounded-full", part.className)} style={{ width: `${partScore[part.key] * 100}%` }} />
              </div>
              <p className="mb-2 font-mono text-xs text-muted-foreground">
                Teil-Score {formatNumber(partScore[part.key], 2)} × Gewicht {formatNumber(score.weights[part.key], 2)}
              </p>
              <dl className="text-sm">{details[part.key]}</dl>
            </article>
          );
        })}
      </div>
      <p className="rounded-lg border bg-card/60 px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground">
        Score = 100 × Relevanz {formatNumber(score.relevanceFactor, 2)} × ({formatNumber(score.weights.trend, 2)}·T{" "}
        {formatNumber(trend.score, 2)} + {formatNumber(score.weights.margin, 2)}·M {formatNumber(margin.score, 2)} +{" "}
        {formatNumber(score.weights.competition, 2)}·W {formatNumber(competition.score, 2)}) ={" "}
        <span className="font-semibold text-foreground">{formatNumber(score.total, 1)}</span>
      </p>
    </div>
  );
}
