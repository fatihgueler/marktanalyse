import { CircleCheck, FlaskConical, Radio, TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { sourceLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";


interface RunStatusProps {
  startedAt: Date;
  status: string;
  sourceModes: Record<string, string>;
  errorCount: number;
}

/** Stand der Daten und Modus je Quelle – Demo-Daten sind immer klar erkennbar. */
export function RunStatus({ startedAt, status, sourceModes, errorCount }: RunStatusProps) {
  const partial = status === "PARTIAL";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {partial ? (
          <TriangleAlert className="size-3.5 text-status-warning" aria-hidden="true" />
        ) : (
          <CircleCheck className="size-3.5 text-status-good" aria-hidden="true" />
        )}
        {partial ? `Lauf teilweise erfolgreich (${errorCount} Fehler)` : "Lauf erfolgreich"} · Stand {formatDateTime(startedAt)}
      </span>
      <ul className="flex flex-wrap gap-1.5" aria-label="Datenquellen">
        {Object.entries(sourceModes).map(([source, mode]) => {
          const live = mode === "live";
          return (
            <li
              key={source}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
                live ? "border-primary/40 text-foreground" : "border-status-warning/40 text-status-warning",
              )}
            >
              {live ? <Radio className="size-3" aria-hidden="true" /> : <FlaskConical className="size-3" aria-hidden="true" />}
              {sourceLabel(source)}: {live ? "Live" : "Demo-Daten"}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
