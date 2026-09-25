/**
 * Hartes Aufrufbudget für einen kostenpflichtigen Dienst innerhalb eines Laufs.
 * Mehrere Adapter (z. B. Google Trends und Google Shopping über SerpApi) teilen sich ein Budget.
 */
export class SearchBudget {
  private used = 0;

  constructor(
    readonly label: string,
    readonly limit: number,
  ) {}

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
