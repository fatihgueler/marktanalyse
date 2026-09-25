const DAY_MS = 86_400_000;

/** Montag 00:00 UTC der Woche, in der `date` liegt. */
export function mondayOf(date: Date): Date {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekday = (new Date(utc).getUTCDay() + 6) % 7; // Mo = 0 … So = 6
  return new Date(utc - weekday * DAY_MS);
}

export function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * DAY_MS);
}

/** YYYY-MM-DD in UTC */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO-Kalenderwoche (1..53) */
export function isoWeekNumber(date: Date): number {
  const thursday = new Date(mondayOf(date).getTime() + 3 * DAY_MS);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / (7 * DAY_MS)) + 1;
}
