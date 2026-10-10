import { describe, expect, it } from "vitest";
import { findTerm, licenseHit, ruleCheckKeyword } from "./keyword-filter";

describe("ruleCheckKeyword", () => {
  it("lässt konkrete Produkte durch", () => {
    for (const keyword of ["wolkenlampe", "mini thermodrucker", "led face mask", "action cam halterung"]) {
      expect(ruleCheckKeyword(keyword)).toEqual({ ok: true });
    }
  });

  it("verwirft Marken und Händler aus dem Live-Lauf", () => {
    expect(ruleCheckKeyword("ikea fado lamp")).toEqual({ ok: false, reason: "Marke/Händler: ikea" });
    expect(ruleCheckKeyword("philips hue floor lamp")).toEqual({ ok: false, reason: "Marke/Händler: philips hue" });
    expect(ruleCheckKeyword("lampe leroy merlin")).toEqual({ ok: false, reason: "Marke/Händler: leroy merlin" });
    expect(ruleCheckKeyword("m&s christmas lights")).toEqual({ ok: false, reason: "Marke/Händler: m&s" });
  });

  it("verwirft Fragen nur am Anfang", () => {
    expect(ruleCheckKeyword("how to clean a lamp")).toMatchObject({ ok: false, reason: "Frage („how …“)" });
    expect(ruleCheckKeyword("wie funktioniert ein luftbefeuchter")).toMatchObject({ ok: false });
    expect(ruleCheckKeyword("lampe was ist das")).toEqual({ ok: true });
  });

  it("verwirft Selbermachen, Tests, Filme und Lizenzware", () => {
    expect(ruleCheckKeyword("herbst deko basteln")).toEqual({ ok: false, reason: "Selbermachen/Ideen: basteln" });
    expect(ruleCheckKeyword("luftbefeuchter test")).toEqual({ ok: false, reason: "Test/Vergleich: test" });
    expect(ruleCheckKeyword("pokemon go explorer gadget")).toMatchObject({ ok: false, reason: "Lizenzware: pokemon" });
    expect(ruleCheckKeyword("star wars kostüm")).toEqual({ ok: false, reason: "Lizenzware: star wars" });
    expect(ruleCheckKeyword("stranger things staffel 5")).toMatchObject({ ok: false });
  });

  it("verwirft Gutscheine, Konten und Läden aus den Kategorie-Abfragen (Test 10/2026)", () => {
    expect(ruleCheckKeyword("nordvpn coupon code")).toMatchObject({ ok: false, reason: expect.stringContaining("Gutschein/Konto/Laden") });
    expect(ruleCheckKeyword("saily login")).toMatchObject({ ok: false });
    expect(ruleCheckKeyword("hollister promo code")).toMatchObject({ ok: false });
    expect(ruleCheckKeyword("sonnenfinsternis brille")).toEqual({ ok: true });
    expect(ruleCheckKeyword("stiefel")).toEqual({ ok: true });
  });

  it("vergleicht ganze Wörter, nicht Wortteile", () => {
    expect(ruleCheckKeyword("testosteron")).toEqual({ ok: true });
    expect(ruleCheckKeyword("depotfett")).toEqual({ ok: true });
  });
});

describe("findTerm / licenseHit", () => {
  it("findet chinesische Lizenzbegriffe in 1688-Titeln", () => {
    expect(licenseHit("迪士尼米奇毛绒玩具公仔")).toBe("迪士尼");
    expect(licenseHit("南瓜挂件毛绒玩具公仔送人礼物")).toBeNull();
  });

  it("findet Mehrwortbegriffe trotz Satzzeichen", () => {
    expect(findTerm("Harry-Potter Zauberstab", ["harry potter"])).toBe("harry potter");
    expect(licenseHit("Pokémon Plüsch")).toBe("pokémon");
  });
});
