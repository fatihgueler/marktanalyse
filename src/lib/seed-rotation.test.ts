import { describe, expect, it } from "vitest";
import { rotateSeeds } from "./seed-rotation";

const POOL = Array.from({ length: 24 }, (_, i) => `seed${i}`);

describe("rotateSeeds", () => {
  it("nimmt alle Seeds, wenn der Vorrat klein ist", () => {
    expect(rotateSeeds(["a", "b"], 10, new Date("2026-10-12"))).toEqual(["a", "b"]);
  });

  it("liefert innerhalb einer Woche immer dieselbe Auswahl", () => {
    expect(rotateSeeds(POOL, 10, new Date("2026-10-12T04:45:00Z"))).toEqual(rotateSeeds(POOL, 10, new Date("2026-10-18T20:00:00Z")));
  });

  it("rückt Woche für Woche weiter und deckt nach drei Wochen den ganzen Vorrat ab", () => {
    const weeks = ["2026-10-12", "2026-10-19", "2026-10-26"].map((d) => rotateSeeds(POOL, 10, new Date(d)));
    expect(weeks[0]).not.toEqual(weeks[1]);
    expect(new Set(weeks.flat()).size).toBe(POOL.length);
    for (const selection of weeks) expect(new Set(selection).size).toBe(10);
  });
});
