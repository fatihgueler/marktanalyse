/**
 * Hartes Aufrufbudget für einen kostenpflichtigen Dienst innerhalb eines Laufs.
 * Mehrere Adapter (z. B. Google Trends und Google Shopping über SerpApi) teilen sich ein Budget.
 */
export class SearchBudget {
  private used = 0;
  /** Zwischengrenze (absolut, in verbrauchten Aufrufen), z. B. der Anteil eines Landes; null = keine */
  private ceiling: number | null = null;

  constructor(
    readonly label: string,
    private max: number,
  ) {}

  get limit(): number {
    return this.max;
  }

  /** Senkt das Budget, z. B. auf das Restkontingent des Anbieters; erhöht es nie. */
  capTo(limit: number): void {
    this.max = Math.max(0, Math.min(this.max, limit));
  }

  /**
   * Zwischengrenze setzen: höchstens bis zu diesem Gesamtverbrauch, bis sie wieder aufgehoben wird (null).
   * Damit bekommt jedes Land seinen Anteil, und das letzte Land geht nicht leer aus.
   */
  setCeiling(totalUsed: number | null): void {
    this.ceiling = totalUsed === null ? null : Math.max(this.used, totalUsed);
  }

  /** Noch verfügbare Aufrufe unter Budget und Zwischengrenze */
  get available(): number {
    return Math.max(0, Math.min(this.limit, this.ceiling ?? Infinity) - this.used);
  }

  /** Reserviert einen Aufruf; false, wenn das Budget (oder die Zwischengrenze) erschöpft ist. */
  tryTake(): boolean {
    if (this.available <= 0) return false;
    this.used++;
    return true;
  }

  /** Wie tryTake, wirft aber, wenn nichts mehr übrig ist. */
  take(): void {
    if (!this.tryTake()) throw new Error(`${this.label}: Budget für diesen Lauf erreicht (${this.limit} Aufrufe).`);
  }

  get consumed(): number {
    return this.used;
  }
}

/**
 * Entscheidet vor einem Lauf anhand des Restkontingents beim Anbieter: normal laufen, Budget kappen
 * oder den Lauf auslassen, weil zu wenig übrig ist, um überhaupt genug Keywords zu finden.
 */
export function quotaDecision(left: number, perRunLimit: number, minUseful: number): { action: "ok" | "cap" | "skip"; limit: number } {
  if (left < minUseful) return { action: "skip", limit: 0 };
  if (left < perRunLimit) return { action: "cap", limit: left };
  return { action: "ok", limit: perRunLimit };
}

/**
 * Anteil eines Landes am Restbudget: Rest gleichmäßig auf die verbleibenden Länder. Was ein Land nicht
 * braucht, geht automatisch an die folgenden. Davon sind `minShopping` Suchen für Google Shopping
 * reserviert – die Trends dürfen den Anteil also nur bis auf diese Reserve aufbrauchen.
 */
export function countryShare(remaining: number, countriesLeft: number, minShopping: number): { share: number; trendCap: number } {
  const share = countriesLeft > 0 ? Math.floor(Math.max(0, remaining) / countriesLeft) : 0;
  return { share, trendCap: Math.max(0, share - minShopping) };
}
