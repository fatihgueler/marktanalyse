import { describe, expect, it } from "vitest";
import { makeTestConfig } from "@/scoring/test-config";
import { loadFxRates, parseEcbXml, withFx } from "./ecb";

// Auszug aus dem echten Feed (Format seit Jahren unverändert)
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-09-25'>
      <Cube currency='USD' rate='1.1712'/>
      <Cube currency='JPY' rate='172.45'/>
      <Cube currency='GBP' rate='0.87215'/>
      <Cube currency='CHF' rate='0.9368'/>
      <Cube currency='CNY' rate='8.3456'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

const config = makeTestConfig();
const now = new Date("2026-09-27T06:00:00Z");

describe("parseEcbXml", () => {
  it("liest Datum und Kurse je EUR", () => {
    const { date, rates } = parseEcbXml(XML);
    expect(date).toBe("2026-09-25");
    expect(rates).toMatchObject({ EUR: 1, USD: 1.1712, GBP: 0.87215, CHF: 0.9368, CNY: 8.3456 });
  });

  it("meldet ein geändertes Format", () => {
    expect(() => parseEcbXml("<html>Wartung</html>")).toThrow(/Format/);
  });
});

describe("loadFxRates", () => {
  it("übernimmt die EZB-Kurse für alle Währungen der Config", async () => {
    const { fx, warning } = await loadFxRates(config, now, async () => XML);
    expect(warning).toBeNull();
    expect(fx.source).toBe("ezb");
    expect(fx.date).toBe("2026-09-25");
    expect(fx.rates).toEqual({ EUR: 1, CHF: 0.9368, GBP: 0.87215, USD: 1.1712, CNY: 8.3456 });
    expect(withFx(config, fx).fx.GBP).toBe(0.87215);
  });

  it("fällt bei Fehlern auf die festen Kurse zurück und warnt", async () => {
    const { fx, warning } = await loadFxRates(config, now, async () => {
      throw new Error("HTTP 503");
    });
    expect(fx.source).toBe("config");
    expect(fx.rates).toEqual(config.fx);
    expect(warning).toMatch(/HTTP 503/);
  });

  it("fällt zurück, wenn eine benötigte Währung fehlt", async () => {
    const { fx, warning } = await loadFxRates(config, now, async () => XML.replace(/<Cube currency='CNY'[^>]*>/, ""));
    expect(fx.source).toBe("config");
    expect(warning).toMatch(/CNY/);
  });

  it("warnt bei veralteten Kursen, nutzt sie aber", async () => {
    const { fx, warning } = await loadFxRates(config, new Date("2026-10-05T06:00:00Z"), async () => XML);
    expect(fx.source).toBe("ezb");
    expect(warning).toMatch(/10 Tage alt/);
  });

  it("ruft die EZB nicht auf, wenn feste Kurse eingestellt sind", async () => {
    const fixed = { ...config, fxUpdate: { ...config.fxUpdate, source: "config" as const } };
    const { fx } = await loadFxRates(fixed, now, async () => {
      throw new Error("darf nicht aufgerufen werden");
    });
    expect(fx.source).toBe("config");
  });
});
