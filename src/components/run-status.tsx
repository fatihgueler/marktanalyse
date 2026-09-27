import { CircleCheck, CircleOff, FlaskConical, Radio, TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { sourceLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Eintrag aus `Run.errors` (siehe collect.ts) */
export interface RunNote {
  level?: "fehler" | "warnung";
  source: string;
  country?: string;
  keyword?: string;
  message: string;
}

/** So viele Fehler werden aufgeklappt gezeigt – bei ausgefallenem Key sind es sonst Hunderte gleiche. */
const MAX_ERRORS_SHOWN = 8;

interface RunStatusProps {
  startedAt: Date;
  status: string;
  sourceModes: Record<string, string>;
  notes: RunNote[];
}

/** Stand der Daten und Modus je Quelle – Demo-Daten sind immer klar erkennbar. */
export function RunStatus({ startedAt, status, sourceModes, notes }: RunStatusProps) {
  const partial = status === "PARTIAL";
  // Warnungen (z. B. Token läuft bald ab) zählen nicht als Fehler
  const warnings = notes.filter((n) => n.level === "warnung");
  const errors = notes.filter((n) => n.level !== "warnung");
  const errorCount = errors.length;
  return (
    <div className="grid gap-2">
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
            const off = mode === "off";
            return (
              <li
                key={source}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
                  live ? "border-primary/40 text-foreground" : off ? "border-border text-muted-foreground" : "border-status-warning/40 text-status-warning",
                )}
              >
                {live ? (
                  <Radio className="size-3" aria-hidden="true" />
                ) : off ? (
                  <CircleOff className="size-3" aria-hidden="true" />
                ) : (
                  <FlaskConical className="size-3" aria-hidden="true" />
                )}
                {sourceLabel(source)}: {live ? "Live" : off ? "aus" : "Demo-Daten"}
              </li>
            );
          })}
        </ul>
      </div>
      {warnings.length > 0 && (
        <ul className="grid gap-1 text-xs text-status-warning" aria-label="Warnungen zum Lauf">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {sourceLabel(w.source)}: {w.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {errorCount > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Fehler im Lauf anzeigen ({errorCount})</summary>
          <ul className="mt-2 grid gap-1 font-mono text-[11px]">
            {errors.slice(0, MAX_ERRORS_SHOWN).map((e, i) => (
              <li key={i}>
                [{sourceLabel(e.source)}
                {e.country ? `/${e.country}` : ""}
                {e.keyword ? ` „${e.keyword}“` : ""}] {e.message}
              </li>
            ))}
            {errorCount > MAX_ERRORS_SHOWN && <li>… und {errorCount - MAX_ERRORS_SHOWN} weitere (siehe Log des Collect-Jobs)</li>}
          </ul>
        </details>
      )}
    </div>
  );
}
