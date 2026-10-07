import { describe, expect, it } from "vitest";
import { researchLinks } from "./research-links";

describe("researchLinks", () => {
  it("baut alle acht Such-Links mit kodiertem Suchbegriff und Land", () => {
    const links = researchLinks("Wolken Lampe & Co", "DE");
    expect(links.map((l) => l.label)).toEqual([
      "Google Trends",
      "TikTok Creative Center",
      "Meta-Werbebibliothek",
      "TikTok-Werbebibliothek",
      "Amazon Movers & Shakers",
      "AliExpress",
      "1688-Bildersuche",
      "eBay verkauft",
    ]);
    const trends = links.find((l) => l.label === "Google Trends")!;
    expect(trends.url).toContain("geo=DE");
    expect(trends.url).toContain("q=Wolken%20Lampe%20%26%20Co");
    expect(links.find((l) => l.label === "eBay verkauft")!.url).toMatch(/^https:\/\/www\.ebay\.de\/.*LH_Sold=1/);
  });

  it("nutzt die Marktplätze des Ziellandes", () => {
    const links = researchLinks("cloud lamp", "GB");
    expect(links.find((l) => l.label === "eBay verkauft")!.url).toContain("ebay.co.uk");
    expect(links.find((l) => l.label === "Amazon Movers & Shakers")!.url).toContain("amazon.co.uk");
  });
});
