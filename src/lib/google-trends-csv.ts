import { curveToWeeklySeries } from "@/sources/scraping/curve";
import type { TrendPoint } from "@/sources/types";
import { isoDate, mondayOf } from "./weeks";

/**
 * Liest eine von trends.google.com exportierte CSV („Herunterladen“ an der Zeitverlaufs-Grafik).
 *
 * Das Format schwankt je nach Sprache und Version: Vorspann wie „Kategorie: Alle Kategorien“,
 * Komma, Semikolon oder Tab, Datumsangaben als 2026-09-20, 20.09.2026, 9/20/2026 oder 2026-09-20T14,
 * Werte „<1“ für sehr geringes Interesse. Es zählt die erste Datenspalte.
 */
export interface ParsedTrendsCsv {
  keyword: string;
  granularity: "Stunden" | "Tage" | "Wochen" | "Monate";
  /** Wochenreihe für die Trend-Bewertung, älteste zuerst */
  series: TrendPoint[];
}

const DAY_MS = 86_400_000;
/** „<1“ = Interesse vorhanden, aber unter 1 – nicht 0, sonst gälte die Woche als Lücke */
const LESS_THAN_ONE = 0.5;

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Datum der ersten Spalte → UTC-Zeitpunkt; null, wenn die Zeile keine Datenzeile ist. */
function parseDate(cell: string): { time: number; hasHour: boolean; monthOnly: boolean } | null {
  const text = cell.replace(/^"|"$/g, "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?/.exec(text);
  if (m) return { time: Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, m[4] ? +m[4] : 0), hasHour: Boolean(m[4]), monthOnly: false };
  m = /^(\d{4})-(\d{2})$/.exec(text);
  if (m) return { time: Date.UTC(+m[1]!, +m[2]! - 1, 1), hasHour: false, monthOnly: true };
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (m) return { time: Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!), hasHour: false, monthOnly: false };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (m) return { time: Date.UTC(+m[3]!, +m[1]! - 1, +m[2]!), hasHour: false, monthOnly: false };
  return null;
}

function parseValue(cell: string): number | null {
  const text = cell.replace(/^"|"$/g, "").trim();
  if (text === "") return null;
  if (/^<\s*1$/.test(text)) return LESS_THAN_ONE;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 100) : null;
}

/** Kopfzeile „wolkenlampe: (Deutschland)“ → „wolkenlampe“ */
function keywordFromHeader(header: string | undefined): string {
  const text = (header ?? "").replace(/^"|"$/g, "").trim();
  return text.replace(/:\s*\(.*\)\s*$/, "").trim() || "unbenannt";
}

export function parseGoogleTrendsCsv(text: string, now: Date = new Date()): ParsedTrendsCsv {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const delimiter = [",", ";", "\t"]
    .map((d) => ({ d, count: lines.filter((l) => parseDate(splitLine(l, d)[0] ?? "") !== null && splitLine(l, d).length >= 2).length }))
    .sort((a, b) => b.count - a.count)[0]!;
  if (delimiter.count === 0) throw new Error("Keine Datenzeilen gefunden. Ist das die CSV aus dem Zeitverlauf von Google Trends?");

  const rows = lines.map((l) => splitLine(l, delimiter.d));
  const firstData = rows.findIndex((r) => r.length >= 2 && parseDate(r[0]!) !== null);
  const header = rows.slice(0, firstData).reverse().find((r) => r.length >= 2);
  const points = rows
    .slice(firstData)
    .map((r) => ({ date: parseDate(r[0] ?? ""), value: parseValue(r[1] ?? "") }))
    .filter((p): p is { date: NonNullable<typeof p.date>; value: number } => p.date !== null && p.value !== null)
    .sort((a, b) => a.date.time - b.date.time);
  if (points.length < 2) throw new Error("Zu wenige Werte in der CSV.");

  const steps = points.slice(1).map((p, i) => p.date.time - points[i]!.date.time).sort((a, b) => a - b);
  const medianStep = steps[Math.floor(steps.length / 2)]!;
  const keyword = keywordFromHeader(header?.[1]);

  if (points[0]!.date.monthOnly || medianStep >= 25 * DAY_MS) {
    throw new Error("Die CSV enthält Monatswerte. Bitte in Google Trends den Zeitraum „Letzte 12 Monate“ wählen und erneut exportieren.");
  }
  if (medianStep >= 6 * DAY_MS) {
    // Google-Wochen beginnen sonntags → auf den folgenden Montag legen, wie die übrigen Quellen
    const series = points.map((p) => ({ weekStart: isoDate(mondayOf(new Date(p.date.time + DAY_MS))), value: p.value }));
    return { keyword, granularity: "Wochen", series };
  }
  // Tages- oder Stundenwerte zu Wochenmitteln verdichten (laufende Woche fällt weg)
  const series = curveToWeeklySeries(
    points.map((p) => ({ timestamp: p.date.time / 1000, value: p.value })),
    now,
  );
  return { keyword, granularity: points.some((p) => p.date.hasHour) ? "Stunden" : "Tage", series };
}
