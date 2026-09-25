const LOCALE = "de-DE";
const TIME_ZONE = "Europe/Berlin";

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(share: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(share);
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(date);
}

export function formatWeek(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(isoDate));
}
