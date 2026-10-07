"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, FileUp, Trash2 } from "lucide-react";
import { BacktestChart } from "@/components/backtest-chart";
import { VerdictBadge, type VerdictTone } from "@/components/product-card";
import { radarConfig } from "@/config/radar.config";
import { BACKTEST_SUGGESTIONS, trendsExploreUrl } from "@/lib/backtest-suggestions";
import { parseGoogleTrendsCsv } from "@/lib/google-trends-csv";
import { cn } from "@/lib/utils";
import { runBacktest, summarizeBacktests, type BacktestResult, type BacktestStatus } from "@/scoring/backtest";
import type { TrendPoint } from "@/sources/types";

interface Entry {
  keyword: string;
  fileName: string;
  series: TrendPoint[];
  /** Kontrollprodukt: hier zählt nur, wie oft der Radar angeschlagen hätte */
  control: boolean;
}

const STORAGE_KEY = "trend-radar-rueckblick-v1";
const STATUS_TONE: Record<BacktestStatus, VerdictTone> = { rechtzeitig: "good", knapp: "watch", verpasst: "bad", "zu wenig Vorlauf": "late" };
const STATUS_ORDER: BacktestStatus[] = ["rechtzeitig", "knapp", "verpasst", "zu wenig Vorlauf"];
const CONTROL_TERMS = new Set(BACKTEST_SUGGESTIONS.filter((s) => s.group === "Kontrolle").map((s) => s.term.toLowerCase()));
const DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const week = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));

function loadEntries(): Entry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: Entry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // nur Komfort – ohne Speicher gehen die Ergebnisse beim Neuladen verloren
  }
}

/** Fehlermeldungen des Parsers auf den Rückblick zuschneiden (dort braucht es mehrere Jahre, keine 12 Monate). */
function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Monatswerte")
    ? "Monatswerte – in Google Trends „Letzte 5 Jahre“ wählen (das liefert Wochenwerte), nicht „Seit 2004“."
    : message;
}

export function BacktestWorkbench() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEntries(loadEntries());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveEntries(entries);
  }, [entries, loaded]);

  const results = useMemo(
    () =>
      entries.map((entry) => {
        try {
          return { entry, result: runBacktest(entry.series), error: null };
        } catch (error) {
          return { entry, result: null, error: explain(error) };
        }
      }),
    [entries],
  );
  const products = results.filter((r) => !r.entry.control && r.result);
  const controls = results.filter((r) => r.entry.control && r.result);
  const summary = summarizeBacktests(products.map((r) => r.result!));
  const sorted = [...products].sort(
    (a, b) => STATUS_ORDER.indexOf(a.result!.status) - STATUS_ORDER.indexOf(b.result!.status) || (b.result!.leadWeeks ?? -1) - (a.result!.leadWeeks ?? -1),
  );

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const added: Entry[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const parsed = parseGoogleTrendsCsv(await file.text());
        if (parsed.series.length < radarConfig.backtest.windowWeeks + 8) {
          problems.push(`${file.name}: nur ${parsed.series.length} Wochen – für den Rückblick „Letzte 5 Jahre“ herunterladen.`);
          continue;
        }
        added.push({ keyword: parsed.keyword, fileName: file.name, series: parsed.series, control: CONTROL_TERMS.has(parsed.keyword.toLowerCase()) });
      } catch (error) {
        problems.push(`${file.name}: ${explain(error)}`);
      }
    }
    setErrors(problems);
    // gleiche Suchbegriffe ersetzen statt doppeln
    setEntries((current) => [...current.filter((e) => !added.some((a) => a.keyword.toLowerCase() === e.keyword.toLowerCase())), ...added]);
  }

  const update = (keyword: string, change: Partial<Entry> | null) =>
    setEntries((current) => (change === null ? current.filter((e) => e.keyword !== keyword) : current.map((e) => (e.keyword === keyword ? { ...e, ...change } : e))));

  return (
    <div className="grid gap-8">
      <section aria-labelledby="upload-titel" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="upload-titel" className="text-lg font-semibold">
          CSV-Dateien laden
        </h2>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed bg-background px-4 py-8 text-center text-sm transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
          <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">Dateien wählen – mehrere auf einmal möglich</span>
          <span className="text-muted-foreground">Je Datei ein Suchbegriff, Zeitraum „Letzte 5 Jahre“</span>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            className="sr-only"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        {errors.length > 0 ? (
          <ul role="alert" className="grid gap-1 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Die Dateien werden nur in diesem Browser ausgewertet und gespeichert; nichts geht an einen Server, es wird nichts abgefragt. Signal = Trend-Score ab {radarConfig.backtest.signalMinTrendScore.toLocaleString("de-DE")} (etwa
          „Jetzt testen“ bei guter Marge). Jede Woche wird nur das Jahr davor bewertet, wie im Echtbetrieb.
        </p>
      </section>

      {products.length > 0 ? (
        <section aria-labelledby="ergebnis-titel" className="grid gap-4">
          <h2 id="ergebnis-titel" className="text-lg font-semibold">
            Ergebnis
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Rechtzeitig erkannt" value={`${summary.inTime} von ${summary.evaluated}`} hint={`mind. ${radarConfig.backtest.goodLeadWeeks} Wochen vor dem Höhepunkt`} />
            <Tile label="Knapp" value={String(summary.tight)} hint="weniger Vorlauf" />
            <Tile label="Verpasst" value={String(summary.missed)} hint="kein Signal vor dem Höhepunkt" />
            <Tile label="Vorlauf (Median)" value={summary.medianLeadWeeks === null ? "–" : `${summary.medianLeadWeeks.toLocaleString("de-DE")} Wochen`} hint="über alle Treffer" />
          </dl>
          <ul className="grid gap-3 lg:grid-cols-2">
            {sorted.map(({ entry, result }) => (
              <ResultCard key={entry.keyword} entry={entry} result={result!} onRemove={() => update(entry.keyword, null)} onControl={() => update(entry.keyword, { control: true })} />
            ))}
          </ul>
        </section>
      ) : null}

      {controls.length > 0 ? (
        <section aria-labelledby="kontrolle-titel" className="grid gap-3">
          <div className="grid gap-0.5">
            <h2 id="kontrolle-titel" className="text-lg font-semibold">
              Kontrollen
            </h2>
            <p className="text-sm text-muted-foreground">Dauerbrenner sollten nie anschlagen, Saisonware höchstens kurz vor jeder Saison.</p>
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {controls.map(({ entry, result }) => (
              <li key={entry.keyword} className="grid gap-2 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-sans text-base font-semibold">{entry.keyword}</h3>
                  <span className={cn("text-sm font-medium", result!.signalWeeks === 0 ? "text-status-good" : "text-status-warning")}>
                    {result!.signalWeeks === 0 ? "kein Signal" : `${result!.signalWeeks} Signalwochen`}
                  </span>
                </div>
                <BacktestChart result={result!} label={entry.keyword} markers={false} />
                <div className="flex gap-3 text-xs">
                  <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => update(entry.keyword, { control: false })}>
                    Als Produkt werten
                  </button>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => update(entry.keyword, null)}>
                    Entfernen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="liste-titel" className="grid gap-3">
        <div className="grid gap-0.5">
          <h2 id="liste-titel" className="text-lg font-semibold">
            Vorschlagsliste
          </h2>
          <p className="text-sm text-muted-foreground">
            Link öffnet Google Trends für Deutschland, letzte 5 Jahre. Dort beim Diagramm „Interesse im zeitlichen Verlauf“ auf das Download-Symbol klicken. Die
            Zeiträume sind grobe Erinnerungswerte; den Höhepunkt liest der Test aus der Datei.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-4 py-2.5 font-medium">Suchbegriff</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Gruppe</th>
                <th scope="col" className="px-4 py-2.5 font-medium">ca. Höhepunkt</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Warum</th>
              </tr>
            </thead>
            <tbody>
              {BACKTEST_SUGGESTIONS.map((s) => {
                const done = entries.some((e) => e.keyword.toLowerCase() === s.term.toLowerCase());
                return (
                  <tr key={s.term} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <a href={trendsExploreUrl(s.term)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                        {s.term}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">(Google Trends, neuer Tab)</span>
                      </a>
                      {done ? <span className="ml-2 text-xs text-status-good">geladen</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.group}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{s.approxPeak}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{s.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {results.some((r) => r.error) ? (
        <ul role="alert" className="grid gap-1 text-sm text-destructive">
          {results
            .filter((r) => r.error)
            .map((r) => (
              <li key={r.entry.keyword}>
                {r.entry.fileName}: {r.error}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular">{value}</dd>
      <dd className="text-xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

function ResultCard({ entry, result, onRemove, onControl }: { entry: Entry; result: BacktestResult; onRemove: () => void; onControl: () => void }) {
  const lead = result.leadWeeks;
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-sans text-base font-semibold">{entry.keyword}</h3>
          <p className="truncate text-xs text-muted-foreground">{entry.fileName}</p>
        </div>
        <VerdictBadge label={result.status === "rechtzeitig" ? "Rechtzeitig" : result.status === "knapp" ? "Knapp" : result.status === "verpasst" ? "Verpasst" : "Zu wenig Vorlauf"} tone={STATUS_TONE[result.status]} className="shrink-0 text-xs" />
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div className="flex gap-1.5 sm:block">
          <dt className="text-muted-foreground sm:text-xs">Erstes Signal</dt>
          <dd className="font-medium">{result.firstSignal ? `${week(result.firstSignal.weekStart)} · ${result.firstSignal.phase}` : "keins"}</dd>
        </div>
        <div className="flex gap-1.5 sm:block">
          <dt className="text-muted-foreground sm:text-xs">Höhepunkt</dt>
          <dd className="font-medium">{week(result.peak.weekStart)}</dd>
        </div>
        <div className="flex gap-1.5 sm:block">
          <dt className="text-muted-foreground sm:text-xs">Vorlauf</dt>
          <dd className="font-medium">{lead === null ? "–" : lead === 1 ? "1 Woche" : `${lead} Wochen`}</dd>
        </div>
      </dl>
      <BacktestChart result={result} label={entry.keyword} />
      {result.status === "zu wenig Vorlauf" ? (
        <p className="text-xs text-status-warning">Der Höhepunkt liegt zu früh in der Datei – der Radar braucht ein Jahr Vorgeschichte plus ein halbes Jahr Vorlauf.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {result.earlierSignals > 0 ? <span>{result.earlierSignals} frühere Signalwochen (über ein halbes Jahr vor dem Höhepunkt)</span> : null}
        <button type="button" className="ml-auto underline-offset-4 hover:underline" onClick={onControl}>
          Als Kontrolle werten
        </button>
        <button type="button" className="inline-flex items-center gap-1 hover:text-destructive" onClick={onRemove}>
          <Trash2 className="size-3.5" aria-hidden="true" />
          Entfernen
        </button>
      </div>
    </li>
  );
}
