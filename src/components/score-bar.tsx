import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import type { ScoreBreakdown } from "@/scoring/score";
import { cn } from "@/lib/utils";

export const SCORE_PARTS = [
  { key: "trend", label: "Trend", className: "bg-series-trend" },
  { key: "margin", label: "Marge", className: "bg-series-margin" },
  { key: "competition", label: "Wettbewerb", className: "bg-series-competition" },
] as const;

/** Legende für die Score-Balken – Farbe trägt nie allein die Bedeutung. */
export function ScoreLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)} aria-label="Legende Score-Anteile">
      {SCORE_PARTS.map((part) => (
        <li key={part.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-2.5 rounded-[3px]", part.className)} />
          {part.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Gesamtscore als zerlegter Balken: Jedes Segment ist der gewichtete Beitrag einer Komponente
 * (inkl. Relevanz-Faktor), die Balkenlänge ist der Score 0..100.
 */
export function ScoreBar({ score, className }: { score: ScoreBreakdown; className?: string }) {
  const segments = SCORE_PARTS.map((part) => ({ ...part, value: 100 * score.relevanceFactor * score.contributions[part.key] }));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          aria-label={`Score ${formatNumber(score.total, 1)}: ${segments.map((s) => `${s.label} ${formatNumber(s.value, 1)}`).join(", ")}`}
          className={cn("flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-muted", className)}
        >
          {segments.map((s) =>
            s.value > 0.05 ? <span key={s.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.className)} style={{ width: `${s.value}%` }} /> : null,
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-xs">
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
          {segments.map((s) => (
            <div key={s.key} className="contents">
              <dt className="flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("size-2 rounded-[2px]", s.className)} />
                {s.label}
              </dt>
              <dd className="text-right tabular">{formatNumber(s.value, 1)}</dd>
            </div>
          ))}
          <dt className="border-t border-current/20 pt-0.5">Relevanz</dt>
          <dd className="border-t border-current/20 pt-0.5 text-right tabular">× {formatNumber(score.relevanceFactor, 2)}</dd>
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}
