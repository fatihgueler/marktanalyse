import { describe, expect, it } from "vitest";
import { radarConfig } from "@/config/radar.config";
import { HeuristicHashtagClassifier, segmentHashtag, type HashtagClassifier } from "./hashtag-classifier";

const vocabulary = new Set(["cloud", "lamp", "pixel", "art", "display", "mini", "thermal", "printer", "led", "face", "mask"]);

describe("segmentHashtag", () => {
  it("zerlegt zusammengeschriebene Produkt-Hashtags", () => {
    expect(segmentHashtag("cloudlamp", vocabulary)).toEqual({ words: ["cloud", "lamp"], coverage: 1 });
    expect(segmentHashtag("#MiniThermalPrinter", vocabulary).words).toEqual(["mini", "thermal", "printer"]);
  });

  it("meldet geringe Abdeckung für Hashtags ohne Produktbezug", () => {
    expect(segmentHashtag("backtoschool", vocabulary).coverage).toBe(0);
    expect(segmentHashtag("lampfestival", vocabulary).coverage).toBeCloseTo(4 / 12);
  });
});

describe("HeuristicHashtagClassifier", () => {
  const classifier: HashtagClassifier = new HeuristicHashtagClassifier(radarConfig);

  it("erkennt Produkte aus dem Mock-Katalog und verwirft allgemeine Hashtags", async () => {
    const result = await classifier.classify(["cloudlamp", "pixelartdisplay", "ledfacemask", "oktoberfest", "fussball", "backtoschool"], "DE");
    expect(Object.fromEntries(result.map((r) => [r.hashtag, r.keyword]))).toEqual({
      cloudlamp: "cloud lamp",
      pixelartdisplay: "pixel art display",
      ledfacemask: "led face mask",
      oktoberfest: null,
      fussball: null,
      backtoschool: null,
    });
  });
});
