import type { Country } from "@/config/radar.config";
import type { HashtagClassifier } from "@/matching/hashtag-classifier";
import { MOCK_CATALOG, mockSeries } from "../mock/catalog";
import { createRng } from "../mock/random";
import { weeklyToDailyCurve } from "./curve";
import { TikTokHashtagSourceBase, type HashtagTrend } from "./tiktok-hashtags";

/** TikTok zeigt Trends in den Demo-Daten zwei Wochen vor Google */
const TIKTOK_LEAD_WEEKS = 2;
/** ~120 Tage */
const CURVE_WEEKS = 17;
/** Allgemeine Trend-Hashtags ohne Produktbezug – zeigen, dass die Klassifizierung filtert */
const NOISE_HASHTAGS = ["fyp", "oktoberfest", "backtoschool", "fussball", "herbstoutfit", "skincareroutine", "roadtrip", "booktok"];
/** Kurvenformen, die im Creative Center als „trending“ auftauchen würden */
const TRENDING_SHAPES = new Set(["breakout", "early-rise", "spike-fade", "steady-growth", "seasonal"]);

export class TikTokHashtagsMockSource extends TikTokHashtagSourceBase {
  readonly mode = "mock" as const;

  constructor(classifier: HashtagClassifier, now: Date = new Date()) {
    super(classifier, now);
  }

  protected async loadHashtags(country: Country): Promise<HashtagTrend[]> {
    const rng = createRng(`tiktok-hashtags|${country}|${this.now.toISOString().slice(0, 10)}`);
    const products = MOCK_CATALOG.filter((p) => TRENDING_SHAPES.has(p.shape.type) && !p.absentIn?.includes(country));
    const productTrends = products.map((product) => {
      const series = mockSeries(product, country, this.now, TIKTOK_LEAD_WEEKS).slice(-CURVE_WEEKS);
      return { hashtag: product.keyword.en.replaceAll(" ", ""), series };
    });
    const weekStarts = productTrends[0]?.series.map((p) => p.weekStart) ?? [];
    const noiseTrends = NOISE_HASHTAGS.map((hashtag) => ({
      hashtag,
      series: weekStarts.map((weekStart) => ({ weekStart, value: 30 + Math.round(rng() * 60) })),
    }));
    return [...productTrends, ...noiseTrends]
      .map((t) => ({ ...t, momentum: (t.series.at(-1)?.value ?? 0) - (t.series.at(-5)?.value ?? 0) }))
      .sort((a, b) => b.momentum - a.momentum)
      .map((t, index) => ({
        hashtag: t.hashtag,
        rank: index + 1,
        views: Math.round(1e5 + rng() * 5e7),
        posts: Math.round(100 + rng() * 50_000),
        curve: weeklyToDailyCurve(t.series, rng),
      }));
  }
}
