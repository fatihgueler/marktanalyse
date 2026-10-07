import { describe, expect, it } from "vitest";
import { groupCandidates, type GroupableRow } from "./candidate-groups";

const row = (id: string, productId: string, keyword: string, country: string, totalScore: number, extra: Partial<GroupableRow> = {}): GroupableRow => ({
  id,
  productId,
  keyword,
  country,
  totalScore,
  marginPct: 0.5,
  trendScore: 0.5,
  belowMinMargin: false,
  ...extra,
});

describe("groupCandidates", () => {
  it("führt dasselbe Produkt über Länder und Varianten zu einer Karte zusammen", () => {
    const groups = groupCandidates(
      [
        row("1", "p1", "mini thermodrucker", "DE", 87.8),
        row("2", "p2", "mini thermodrucker", "DE", 87.6),
        row("3", "p1", "mini thermodrucker", "AT", 87.2),
        row("4", "p9", "wolkenlampe", "DE", 70),
      ],
      "score",
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.best.id).toBe("1");
    expect(groups[0]!.countries).toEqual([
      { country: "DE", score: 88 },
      { country: "AT", score: 87 },
    ]);
    expect(groups[0]!.offerCount).toBe(2);
  });

  it("verbindet verschiedene Keywords, die dasselbe Angebot finden", () => {
    const groups = groupCandidates([row("1", "p1", "wolkenlampe", "DE", 70), row("2", "p1", "cloud lamp", "GB", 65), row("3", "p2", "Cloud Lamp ", "GB", 60)], "score");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows).toHaveLength(3);
  });

  it("nimmt als Vertreter einen Kandidaten über der Mindestmarge und sortiert dünne Margen ans Ende", () => {
    const groups = groupCandidates(
      [
        row("1", "p1", "a", "DE", 90, { belowMinMargin: true }),
        row("2", "p2", "a", "DE", 60),
        row("3", "p3", "b", "DE", 95, { belowMinMargin: true }),
      ],
      "score",
    );
    expect(groups.map((g) => g.best.id)).toEqual(["2", "3"]);
  });

  it("sortiert nach Marge oder Trend, wenn gewählt", () => {
    const rows = [row("1", "p1", "a", "DE", 90, { marginPct: 0.2, trendScore: 0.9 }), row("2", "p2", "b", "DE", 50, { marginPct: 0.6, trendScore: 0.1 })];
    expect(groupCandidates(rows, "marge").map((g) => g.best.id)).toEqual(["2", "1"]);
    expect(groupCandidates(rows, "trend").map((g) => g.best.id)).toEqual(["1", "2"]);
  });
});
