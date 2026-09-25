import type { Country } from "@/config/radar.config";
import { findMockProduct } from "../mock/catalog";
import { mockAdActivity } from "../mock/ads";
import type { AdRecord, AdSignalSource } from "../types";
import { isCovered, notCovered, summarizeAds } from "./summarize";

/** Mock für eine Werbebibliothek. `platformFactor` skaliert die Werbetreibenden (TikTok < Meta). */
export class AdLibraryMockSource implements AdSignalSource {
  readonly mode = "mock" as const;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly platformFactor: number,
    private readonly now: Date = new Date(),
  ) {}

  async adActivity(keyword: string, country: Country): Promise<AdRecord> {
    if (!isCovered(country)) return notCovered(this.id, keyword, country);
    const product = findMockProduct(keyword);
    if (!product) {
      return summarizeAds({ source: this.id, keyword, country, ads: [], capped: false, raw: { mock: true, catalogSlug: null }, now: this.now });
    }
    return mockAdActivity(product, keyword, country, this.id, this.platformFactor, this.now);
  }
}
