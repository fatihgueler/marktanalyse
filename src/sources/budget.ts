/**
 * Hartes Aufrufbudget für einen kostenpflichtigen Dienst innerhalb eines Laufs.
 * Mehrere Adapter (z. B. Google Trends und Google Shopping über SerpApi) teilen sich ein Budget.
 */
export class SearchBudget {
  private used = 0;

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

  /** Reserviert einen Aufruf; false, wenn das Budget erschöpft ist. */
  tryTake(): boolean {
    if (this.used >= this.limit) return false;
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
