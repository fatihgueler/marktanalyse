import { describe, expect, it } from "vitest";
import { offerLink } from "./offer-link";

describe("offerLink", () => {
  const product = { source: "aliexpress", url: "https://www.aliexpress.com/item/1005000000000001.html" };
  it("verlinkt echte Angebote direkt", () => {
    expect(offerLink(product, { aliexpress: "live" }, "wolkenlampe")).toEqual({ url: product.url, label: "Angebot", demo: false });
  });
  it("ersetzt Demo-Angebote durch die Suche beim Anbieter", () => {
    expect(offerLink(product, { aliexpress: "mock" }, "wolken lampe")).toEqual({
      url: "https://www.aliexpress.com/wholesale?SearchText=wolken%20lampe",
      label: "Ähnliche suchen",
      demo: true,
    });
  });
  it("lässt den Link weg, wenn es für eine Demo-Quelle keine Suche gibt", () => {
    expect(offerLink({ source: "unbekannt", url: "x" }, { unbekannt: "mock" }, "x")).toBeNull();
  });
});
