import { isoWeekNumber } from "./weeks";

/**
 * Wählt `count` Seeds aus dem Vorrat, rotierend nach Kalenderwoche: Woche für Woche rückt das
 * Fenster um `count` weiter (zyklisch), sodass nach ⌈Vorrat ÷ count⌉ Wochen jede Kategorie einmal
 * abgefragt wurde. Ist der Vorrat nicht größer als `count`, kommen alle Seeds dran.
 */
export function rotateSeeds<T>(pool: readonly T[], count: number, now: Date): T[] {
  if (count <= 0 || pool.length === 0) return [];
  if (pool.length <= count) return [...pool];
  const week = now.getUTCFullYear() * 53 + isoWeekNumber(now);
  const start = (week * count) % pool.length;
  return Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]!);
}
