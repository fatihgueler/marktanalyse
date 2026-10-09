import Link from "next/link";
import { ArrowRight, CircleCheck, FlaskConical, TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { sourceLabel } from "@/lib/labels";

/** Eintrag aus `Run.errors` (siehe collect.ts) */
export interface RunNote {
  level?: "fehler" | "warnung";
  source: string;
  country?: string;
  keyword?: string;
  message: string;
}

/** So viele Meldungen werden aufgeklappt gezeigt – bei ausgefallenem Key sind es sonst Hunderte gleiche. */
const MAX_NOTES_SHOWN = 8;

interface RunStatusProps {
  startedAt: Date;
  status: string;
  sourceModes: Record<string, string>;
  notes: RunNote[];
  /** Nachbewertung: Start des Originallaufs, dessen Daten neu bewertet wurden */
  rescoreOf?: { startedAt: Date | null } | null;
}

/**
 * Eine Statuszeile statt eines Schilds pro Quelle: Modus, wie viele Quellen live sind, Stand.
 * Einzelheiten stehen unter „Quellen“; Warnungen und Fehler des Laufs lassen sich aufklappen.
 */
export function RunStatus({ startedAt, status, sourceModes, notes, rescoreOf }: RunStatusProps) {
  const modes = Object.values(sourceModes);
  const live = modes.filter((m) => m === "live").length;
  const mode = live === modes.length ? "Live" : live <= 1 ? "Demo-Modus" : "Teilweise live";
  const warnings = notes.filter((n) => n.level === "warnung");
  const errors = notes.filter((n) => n.level !== "warnung");
  const shown = [...warnings, ...errors].slice(0, MAX_NOTES_SHOWN);

  return (
    <div className="grid gap-2 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        {mode === "Live" ? (
          <CircleCheck className="size-4 text-status-good" aria-hidden="true" />
        ) : (
          <FlaskConical className="size-4 text-status-warning" aria-hidden="true" />
        )}
        <span className="font-semibold text-foreground">{mode}</span>
        <span aria-hidden="true">·</span>
        <span>
          {live} von {modes.length} Quellen live
        </span>
        <span aria-hidden="true">·</span>
        {rescoreOf ? (
          <span>
            Nachbewertung vom {formatDateTime(startedAt)} · Daten vom {rescoreOf.startedAt ? formatDateTime(rescoreOf.startedAt) : "Originallauf"}
          </span>
        ) : (
          <span>Stand {formatDateTime(startedAt)}</span>
        )}
        <Link href="/quellen" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
          Quellen <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </p>
      {shown.length > 0 ? (
        <details className="group">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <TriangleAlert className="size-4 text-status-warning" aria-hidden="true" />
            {[warnings.length > 0 ? `${warnings.length} ${warnings.length === 1 ? "Hinweis" : "Hinweise"}` : null, errors.length > 0 ? `${errors.length} Fehler` : null]
              .filter(Boolean)
              .join(" · ")}
            {status === "PARTIAL" ? " – Lauf teilweise erfolgreich" : ""}
          </summary>
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
            {shown.map((n, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{sourceLabel(n.source)}</span>
                {n.country ? ` · ${n.country}` : ""}
                {n.keyword ? ` · „${n.keyword}“` : ""}: {n.message}
              </li>
            ))}
            {notes.length > MAX_NOTES_SHOWN ? <li>… und {notes.length - MAX_NOTES_SHOWN} weitere (siehe Log des Datenlaufs)</li> : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
