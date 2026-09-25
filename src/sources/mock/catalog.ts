/**
 * Gemeinsamer Mock-Katalog: Nachfrage, Angebot und Referenzpreise greifen auf dieselben
 * Produkte zu, damit Demo-Läufe in sich konsistent sind.
 *
 * Die Kurvenformen decken typische Lebenszyklen ab (Breakout, Frühphase, Plateau,
 * Abschwung, Saison, Strohfeuer), damit die Demo zeigt, dass das Scoring frühe
 * Trends über gesättigte Bestseller stellt.
 */
import type { CategoryId, Country } from "@/config/radar.config";
import { addWeeks, isoDate, isoWeekNumber, mondayOf } from "@/lib/weeks";
import { between, createRng } from "./random";
import type { TrendPoint } from "../types";

export const SERIES_WEEKS = 52;

export type SeedGroup = "gadget" | "lamp" | "kitchen" | "decor" | "led" | "gift" | "tiktok" | "beauty";

export type CurveShape =
  | { type: "breakout"; startWeek: number }
  | { type: "early-rise"; startWeek: number }
  | { type: "steady-growth" }
  | { type: "plateau-high" }
  | { type: "declining"; peakWeek: number }
  | { type: "seasonal"; peakIsoWeek: number }
  | { type: "spike-fade"; peakWeek: number }
  | { type: "flat" };

export interface MockProduct {
  slug: string;
  keyword: { de: string; en: string };
  seeds: SeedGroup[];
  category: CategoryId;
  shape: CurveShape;
  /** Verzögerung in Wochen je Land (UK läuft DACH oft voraus) */
  lagWeeks?: Partial<Record<Country, number>>;
  /** in diesen Ländern (noch) kein messbares Suchinteresse */
  absentIn?: Country[];
  supplierPriceEur: number;
  retailPriceEur: number;
  /** AliExpress-Gesamttreffer der Suche */
  resultCount: number;
  /** Bestellungen/30 Tage des Top-Angebots */
  topOrders30d: number;
  titles: string[];
  /** thematisch nahe, aber falsche Treffer – zeigen, dass das Matching filtert */
  decoys: string[];
}

export const MOCK_CATALOG: MockProduct[] = [
  {
    slug: "sunset-lamp", keyword: { de: "sonnenuntergang lampe", en: "sunset lamp" }, seeds: ["lamp", "led", "tiktok"],
    category: "beleuchtung", shape: { type: "plateau-high" }, supplierPriceEur: 4.9, retailPriceEur: 24.99, resultCount: 62000, topOrders30d: 25000,
    titles: ["Sunset Projection Lamp 16 Colors USB Rainbow Night Light", "Sunset Lamp Projector 360° Rotation Atmosphere Light", "LED Sunset Red Projection Night Light for Bedroom", "Sunset Lamp with Remote Control Photography Light", "Golden Hour Sunset Projector Lamp USB"],
    decoys: ["Replacement Lamp Shade Linen Cover", "Sunset Beach Canvas Poster Wall Art"],
  },
  {
    slug: "astronaut-projector", keyword: { de: "astronaut sternenprojektor", en: "astronaut galaxy projector" }, seeds: ["lamp", "gadget", "gift"],
    category: "beleuchtung", shape: { type: "declining", peakWeek: 20 }, supplierPriceEur: 14.5, retailPriceEur: 39.99, resultCount: 31000, topOrders30d: 9000,
    titles: ["Astronaut Galaxy Projector Starry Sky Night Light Nebula", "Astronaut Star Projector with Timer and Remote", "Spaceman Galaxy Projector Lamp Kids Bedroom", "Astronaut Nebula Projector 8 Modes USB"],
    decoys: ["Astronaut Plush Toy 30cm", "Space Poster Set Astronaut Wall Decor"],
  },
  {
    slug: "cloud-lamp", keyword: { de: "wolkenlampe", en: "cloud lamp" }, seeds: ["lamp", "decor", "led"],
    category: "beleuchtung", shape: { type: "steady-growth" }, lagWeeks: { DE: 2, AT: 3, CH: 3 }, supplierPriceEur: 9.8, retailPriceEur: 34.99, resultCount: 4200, topOrders30d: 1800,
    titles: ["Cloud Lamp LED Fluffy Cotton Ceiling Light RGB", "Thunder Cloud Lamp Music Sync Lightning Night Light", "Cloud Night Light Bedroom Decor Warm White", "DIY Cloud Lamp Kit with App Control"],
    decoys: ["Cloud Shaped Pillow Soft Cushion", "Cloud Storage USB Drive 128GB"],
  },
  {
    slug: "levitating-moon", keyword: { de: "schwebende mond lampe", en: "levitating moon lamp" }, seeds: ["lamp", "gift", "decor"],
    category: "beleuchtung", shape: { type: "early-rise", startWeek: 38 }, lagWeeks: { DE: 1, AT: 2, CH: 2 }, supplierPriceEur: 38, retailPriceEur: 119, resultCount: 900, topOrders30d: 250,
    titles: ["Levitating Moon Lamp Magnetic Floating 3D Print", "Floating Moon Lamp Wireless LED Night Light", "Magnetic Levitation Moon Lamp 14cm Gift", "Levitating Moon Light Touch Control 3 Colors"],
    decoys: ["Moon Phase Wall Hanging Macrame", "Moon Lamp Replacement Battery 18650"],
  },
  {
    slug: "mushroom-lamp", keyword: { de: "pilz lampe", en: "mushroom lamp" }, seeds: ["lamp", "decor"],
    category: "beleuchtung", shape: { type: "steady-growth" }, supplierPriceEur: 8.5, retailPriceEur: 34.99, resultCount: 8000, topOrders30d: 3000,
    titles: ["Mushroom Lamp Glass Retro Table Lamp", "Vintage Mushroom Night Light Rechargeable", "Mushroom Table Lamp Cordless Touch Dimmable", "Striped Mushroom Lamp Bedside Decor"],
    decoys: ["Mushroom Grow Kit Indoor", "Mushroom Shaped Ceramic Mug"],
  },
  {
    slug: "pixel-display", keyword: { de: "pixel art display", en: "pixel art display" }, seeds: ["gadget", "led", "gift"],
    category: "technik-gadgets", shape: { type: "breakout", startWeek: 44 }, lagWeeks: { DE: 2, AT: 3, CH: 3 }, absentIn: ["AT"], supplierPriceEur: 18, retailPriceEur: 59.99, resultCount: 1200, topOrders30d: 350,
    titles: ["Pixel Art Display LED Matrix 16x16 App Control Clock", "Smart Pixel Frame Bluetooth DIY Animation", "LED Pixel Display Gaming Desk Decor", "Pixel Art Frame 256 LEDs WiFi"],
    decoys: ["Pixel Art Sticker Pack 50 pcs", "Display Stand Acrylic for Figures"],
  },
  {
    slug: "mini-waffle", keyword: { de: "mini waffeleisen", en: "mini waffle maker" }, seeds: ["kitchen", "gift"],
    category: "kueche-haushalt", shape: { type: "seasonal", peakIsoWeek: 51 }, supplierPriceEur: 12, retailPriceEur: 29.99, resultCount: 12000, topOrders30d: 4000,
    titles: ["Mini Waffle Maker 10cm Non-Stick Electric", "Mini Waffle Iron Heart Shape Breakfast", "Portable Mini Waffle Maker 350W", "Mini Waffle Machine for Kids Party"],
    decoys: ["Silicone Waffle Mold Baking Tray", "Waffle Knit Blanket Cotton"],
  },
  {
    slug: "collapsible-kettle", keyword: { de: "faltbarer wasserkocher", en: "collapsible travel kettle" }, seeds: ["kitchen", "gadget"],
    category: "kueche-haushalt", shape: { type: "early-rise", startWeek: 40 }, supplierPriceEur: 13.5, retailPriceEur: 39.99, resultCount: 2500, topOrders30d: 700,
    titles: ["Collapsible Electric Kettle Silicone Travel 600ml", "Foldable Travel Kettle Dual Voltage", "Portable Folding Kettle for Camping and Hotel", "Silicone Collapsible Kettle Fast Boil"],
    decoys: ["Collapsible Silicone Bowl Set", "Kettle Descaler Tablets 10 pcs"],
  },
  {
    slug: "portable-blender", keyword: { de: "tragbarer mixer", en: "portable blender" }, seeds: ["kitchen", "gadget", "tiktok"],
    category: "kueche-haushalt", shape: { type: "plateau-high" }, supplierPriceEur: 8.9, retailPriceEur: 29.99, resultCount: 85000, topOrders30d: 30000,
    titles: ["Portable Blender USB Rechargeable 380ml Juicer Cup", "Mini Portable Blender 6 Blades Smoothie", "Personal Blender Bottle Wireless", "Portable Juicer Blender for Travel Gym"],
    decoys: ["Blender Replacement Blade Assembly", "Protein Shaker Bottle 700ml"],
  },
  {
    slug: "insulated-tumbler", keyword: { de: "isolierbecher mit strohhalm", en: "insulated tumbler with straw" }, seeds: ["kitchen", "gift", "tiktok"],
    category: "kueche-haushalt", shape: { type: "declining", peakWeek: 14 }, supplierPriceEur: 6.5, retailPriceEur: 29.99, resultCount: 110000, topOrders30d: 30000,
    titles: ["Insulated Tumbler 40oz with Handle and Straw", "Stainless Steel Tumbler Straw Lid Travel Mug", "Vacuum Insulated Cup 1.2L with Straw", "Tumbler with Handle Leakproof Straw Lid"],
    decoys: ["Reusable Straws Set Silicone", "Tumbler Boot Silicone Bottom Protector"],
  },
  {
    slug: "ice-roller", keyword: { de: "eisroller gesicht", en: "ice roller face" }, seeds: ["beauty", "tiktok"],
    category: "beauty-pflege", shape: { type: "declining", peakWeek: 26 }, supplierPriceEur: 2.8, retailPriceEur: 14.99, resultCount: 40000, topOrders30d: 12000,
    titles: ["Ice Roller for Face and Eye Puffiness Relief", "Facial Ice Roller Skin Care Cooling", "Ice Globe Face Massager Roller", "Cold Roller Face Depuffing Tool"],
    decoys: ["Paint Roller Set Home DIY", "Ice Cube Tray Silicone 2 pcs"],
  },
  {
    slug: "led-face-mask", keyword: { de: "led gesichtsmaske", en: "led face mask" }, seeds: ["beauty", "led", "gadget"],
    category: "beauty-pflege", shape: { type: "breakout", startWeek: 43 }, lagWeeks: { DE: 3, AT: 4, CH: 4 }, supplierPriceEur: 24, retailPriceEur: 89, resultCount: 3000, topOrders30d: 900,
    titles: ["LED Face Mask 7 Colors Light Therapy Skin Care", "Red Light Therapy Mask Wireless", "LED Photon Facial Mask Anti-Aging", "Silicone LED Face Mask Near Infrared"],
    decoys: ["Sheet Face Mask Hydrating 10 pcs", "LED Strip Lights 5m RGB"],
  },
  {
    slug: "scalp-massager", keyword: { de: "kopfhaut massagegerät", en: "electric scalp massager" }, seeds: ["beauty", "gift"],
    category: "beauty-pflege", shape: { type: "early-rise", startWeek: 36 }, supplierPriceEur: 11, retailPriceEur: 39.99, resultCount: 1500, topOrders30d: 450,
    titles: ["Electric Scalp Massager Waterproof 4 Heads", "Head Massager Cordless Hair Growth", "Scalp Massager Kneading Rechargeable", "Electric Head Scratcher Massager"],
    decoys: ["Shampoo Brush Silicone Manual", "Neck Massage Pillow Heated"],
  },
  {
    slug: "gua-sha", keyword: { de: "gua sha stein", en: "gua sha stone" }, seeds: ["beauty"],
    category: "beauty-pflege", shape: { type: "flat" }, supplierPriceEur: 2.5, retailPriceEur: 19.99, resultCount: 52000, topOrders30d: 15000,
    titles: ["Gua Sha Stone Natural Rose Quartz", "Jade Gua Sha Facial Tool", "Gua Sha Board Face Lifting", "Stainless Steel Gua Sha Tool"],
    decoys: ["Rose Quartz Crystal Bracelet", "Jade Plant Artificial Pot"],
  },
  {
    slug: "magnetic-powerbank", keyword: { de: "magnetische powerbank", en: "magnetic power bank" }, seeds: ["gadget", "tiktok"],
    category: "handy-zubehoer", shape: { type: "plateau-high" }, supplierPriceEur: 11, retailPriceEur: 34.99, resultCount: 95000, topOrders30d: 40000,
    titles: ["Magnetic Power Bank 10000mAh Wireless Fast Charging", "Magsafe Compatible Power Bank Slim", "Mini Magnetic Battery Pack 5000mAh", "Magnetic Wireless Powerbank with Stand"],
    decoys: ["Magnetic Phone Ring Holder", "USB-C Cable 2m Braided"],
  },
  {
    slug: "neck-fan", keyword: { de: "nackenventilator", en: "neck fan" }, seeds: ["gadget"],
    category: "technik-gadgets", shape: { type: "seasonal", peakIsoWeek: 29 }, supplierPriceEur: 7.5, retailPriceEur: 24.99, resultCount: 36000, topOrders30d: 8000,
    titles: ["Neck Fan Bladeless Portable USB Rechargeable", "Hanging Neck Fan 3 Speeds Quiet", "Wearable Neck Fan 4000mAh", "Portable Neck Air Conditioner Cooling"],
    decoys: ["Desk Fan Clip-On USB", "Neck Pillow Travel Memory Foam"],
  },
  {
    slug: "thermal-printer", keyword: { de: "mini thermodrucker", en: "mini thermal printer" }, seeds: ["gadget", "gift", "tiktok"],
    category: "technik-gadgets", shape: { type: "breakout", startWeek: 45 }, lagWeeks: { DE: 1, AT: 2, CH: 2 }, supplierPriceEur: 12.5, retailPriceEur: 44.99, resultCount: 2200, topOrders30d: 800,
    titles: ["Mini Thermal Printer Portable Bluetooth Sticker Printer", "Pocket Photo Printer Inkless Labels", "Mini Printer for Notes and Journaling", "Portable Thermal Label Printer App"],
    decoys: ["Thermal Paper Rolls 57mm 10 pcs", "Printer Ink Cartridge Compatible"],
  },
  {
    slug: "mini-projector", keyword: { de: "mini beamer", en: "mini projector" }, seeds: ["gadget", "gift"],
    category: "technik-gadgets", shape: { type: "plateau-high" }, supplierPriceEur: 38, retailPriceEur: 99, resultCount: 72000, topOrders30d: 20000,
    titles: ["Mini Projector 4K Supported WiFi Bluetooth", "Portable Projector 1080P Home Cinema", "Smart Mini Beamer Android Auto Keystone", "Pocket Projector 200 ANSI Lumens"],
    decoys: ["Projector Screen 100 inch Foldable", "Projector Ceiling Mount Bracket"],
  },
  {
    slug: "car-phone-mount", keyword: { de: "magnetische handyhalterung auto", en: "magnetic car phone mount" }, seeds: ["gadget"],
    category: "handy-zubehoer", shape: { type: "flat" }, supplierPriceEur: 3.9, retailPriceEur: 19.99, resultCount: 150000, topOrders30d: 50000,
    titles: ["Magnetic Car Phone Holder Air Vent Mount", "Car Phone Mount Magnetic 360 Rotation", "Dashboard Magnetic Phone Holder Strong", "Magsafe Car Mount Vent Clip"],
    decoys: ["Car Air Freshener Vent Clip", "Bike Phone Holder Handlebar"],
  },
  {
    slug: "phone-lanyard", keyword: { de: "handykette", en: "phone lanyard crossbody" }, seeds: ["gift", "tiktok"],
    category: "handy-zubehoer", shape: { type: "steady-growth" }, supplierPriceEur: 1.9, retailPriceEur: 14.99, resultCount: 26000, topOrders30d: 9000,
    titles: ["Phone Lanyard Crossbody Adjustable Strap with Patch", "Phone Chain Beaded Wrist Strap", "Crossbody Phone Strap Universal Nylon", "Phone Necklace Lanyard Detachable"],
    decoys: ["ID Card Holder Lanyard Office", "Phone Case Clear Shockproof"],
  },
  {
    slug: "mochi-squishy", keyword: { de: "mochi squishy", en: "mochi squishy" }, seeds: ["gift", "tiktok"],
    category: "spielzeug-fun", shape: { type: "spike-fade", peakWeek: 42 }, supplierPriceEur: 1.2, retailPriceEur: 5.99, resultCount: 70000, topOrders30d: 20000,
    titles: ["Mochi Squishy Toys Kawaii Animal 24 pcs", "Mini Mochi Squishies Stress Relief", "Squishy Mochi Cat Fidget Toy", "Mochi Squishy Party Favors Set"],
    decoys: ["Mochi Rice Cake Maker", "Squishy Keychain Charm Food"],
  },
  {
    slug: "fidget-slug", keyword: { de: "fidget schnecke", en: "fidget slug" }, seeds: ["gift", "tiktok"],
    category: "spielzeug-fun", shape: { type: "spike-fade", peakWeek: 46 }, absentIn: ["CH"], supplierPriceEur: 1.5, retailPriceEur: 9.99, resultCount: 45000, topOrders30d: 15000,
    titles: ["Fidget Slug Articulated 3D Printed Toy", "Flexible Slug Fidget Sensory Toy", "Articulated Slug Toy Rainbow", "3D Slug Fidget Stress Relief"],
    decoys: ["Garden Slug Trap Beer", "Snail Figurine Resin Decor"],
  },
  {
    slug: "cat-fountain", keyword: { de: "katzen trinkbrunnen", en: "cat water fountain" }, seeds: ["gadget", "gift"],
    category: "haustier", shape: { type: "steady-growth" }, supplierPriceEur: 12, retailPriceEur: 39.99, resultCount: 31000, topOrders30d: 10000,
    titles: ["Cat Water Fountain 2L Automatic Filter", "Stainless Steel Pet Fountain Quiet Pump", "Wireless Cat Fountain Battery Operated", "Pet Water Dispenser LED Indicator"],
    decoys: ["Cat Food Bowl Ceramic Raised", "Fountain Pump Replacement Filter 6 pcs"],
  },
  {
    slug: "paw-cleaner", keyword: { de: "pfotenreiniger hund", en: "dog paw cleaner" }, seeds: ["gadget"],
    category: "haustier", shape: { type: "flat" }, absentIn: ["CH"], supplierPriceEur: 3.5, retailPriceEur: 16.99, resultCount: 15000, topOrders30d: 5000,
    titles: ["Dog Paw Cleaner Cup Portable Silicone", "Pet Foot Washer Soft Bristles", "Paw Plunger for Muddy Dogs", "Dog Paw Washer Cup Large"],
    decoys: ["Dog Towel Microfiber Absorbent", "Dog Nail Clipper Stainless"],
  },
  {
    slug: "wavy-mirror", keyword: { de: "welliger spiegel", en: "wavy mirror" }, seeds: ["decor", "tiktok"],
    category: "wohnen-deko", shape: { type: "early-rise", startWeek: 39 }, lagWeeks: { DE: 2, AT: 3, CH: 3 }, supplierPriceEur: 16, retailPriceEur: 69.99, resultCount: 3500, topOrders30d: 700,
    titles: ["Wavy Mirror Irregular Wall Mirror Acrylic", "Wave Mirror Aesthetic Room Decor", "Asymmetrical Wavy Wall Mirror Frameless", "Wavy Full Length Mirror Decor"],
    decoys: ["Mirror Stickers Hexagon 12 pcs", "Wave Poster Japanese Art Print"],
  },
  {
    slug: "candle-warmer", keyword: { de: "kerzenwärmer lampe", en: "candle warmer lamp" }, seeds: ["decor", "lamp", "gift"],
    category: "wohnen-deko", shape: { type: "seasonal", peakIsoWeek: 49 }, supplierPriceEur: 13, retailPriceEur: 44.99, resultCount: 2800, topOrders30d: 900,
    titles: ["Candle Warmer Lamp Dimmable with Timer", "Electric Candle Warmer Retro Metal", "Candle Warmer Lantern Top Down Melting", "Adjustable Height Candle Warmer Lamp"],
    decoys: ["Scented Candle Soy Wax 200g", "Candle Wick Trimmer Set"],
  },
  {
    slug: "mini-massage-gun", keyword: { de: "mini massagepistole", en: "mini massage gun" }, seeds: ["gadget", "gift"],
    category: "sport-outdoor", shape: { type: "declining", peakWeek: 8 }, supplierPriceEur: 13, retailPriceEur: 49.99, resultCount: 60000, topOrders30d: 18000,
    titles: ["Mini Massage Gun Deep Tissue Percussion", "Pocket Massage Gun 4 Heads USB-C", "Portable Muscle Massager Quiet", "Mini Fascia Gun 6 Speed"],
    decoys: ["Massage Ball Set Spiky", "Foam Roller 45cm"],
  },
  {
    slug: "beaded-bag", keyword: { de: "perlen tasche", en: "beaded bag" }, seeds: ["gift", "tiktok"],
    category: "mode-accessoires", shape: { type: "early-rise", startWeek: 41 }, absentIn: ["CH", "AT"], supplierPriceEur: 5.5, retailPriceEur: 29.99, resultCount: 6000, topOrders30d: 1500,
    titles: ["Beaded Bag Handmade Pearl Handbag", "Beaded Tote Bag Summer Colorful", "Acrylic Beaded Clutch Evening", "Beaded Mini Bag Top Handle"],
    decoys: ["Loose Beads Mixed 500 pcs Craft", "Bag Organizer Insert Felt"],
  },
  {
    slug: "sphere-ice-mold", keyword: { de: "eiskugel form", en: "sphere ice mold" }, seeds: ["kitchen"],
    category: "kueche-haushalt", shape: { type: "flat" }, supplierPriceEur: 3.2, retailPriceEur: 14.99, resultCount: 21000, topOrders30d: 6000,
    titles: ["Sphere Ice Mold Silicone 4 Balls", "Ice Ball Maker Large Whiskey", "Round Ice Cube Tray with Lid", "Clear Ice Sphere Mold Set"],
    decoys: ["Ice Cream Scoop Stainless", "Cake Pop Mold Silicone"],
  },
];

const LANGUAGE_BY_COUNTRY: Record<Country, "de" | "en"> = { DE: "de", AT: "de", CH: "de", GB: "en" };

export function keywordFor(product: MockProduct, country: Country): string {
  return product.keyword[LANGUAGE_BY_COUNTRY[country]];
}

export function findMockProduct(keyword: string): MockProduct | undefined {
  const normalized = keyword.trim().toLowerCase();
  return MOCK_CATALOG.find((p) => p.keyword.de === normalized || p.keyword.en === normalized);
}

/** Ordnet einen Config-Seed einer Mock-Seed-Gruppe zu. Unbekannte Seeds liefern keine Treffer. */
const SEED_GROUPS: Record<string, SeedGroup> = {
  gadget: "gadget",
  lampe: "lamp",
  lamp: "lamp",
  "küchenhelfer": "kitchen",
  "kitchen gadget": "kitchen",
  deko: "decor",
  "home decor": "decor",
  led: "led",
  geschenkidee: "gift",
  "gift idea": "gift",
  "tiktok produkt": "tiktok",
  "tiktok made me buy it": "tiktok",
  "beauty tool": "beauty",
};

export function seedGroupOf(seed: string): SeedGroup | undefined {
  return SEED_GROUPS[seed.trim().toLowerCase()];
}

/** Rohkurve vor Normierung; t = 0 … SERIES_WEEKS-1, t = letzte abgeschlossene Woche am Ende. */
function curveValue(shape: CurveShape, t: number, weekDate: Date): number {
  switch (shape.type) {
    case "breakout":
      return 2 + (t >= shape.startWeek ? 100 * ((t - shape.startWeek + 1) / (SERIES_WEEKS - shape.startWeek)) ** 2 : 0);
    case "early-rise":
      return 6 + (t >= shape.startWeek ? 3.5 * (t - shape.startWeek + 1) ** 1.4 : 0);
    case "steady-growth":
      return 10 + 0.9 * t;
    case "plateau-high":
      return t < 10 ? 20 + 8 * t : 95;
    case "declining":
      return 25 + 100 * Math.exp(-((t - shape.peakWeek) ** 2) / (2 * 8 ** 2));
    case "seasonal": {
      const distance = Math.abs(isoWeekNumber(weekDate) - shape.peakIsoWeek);
      const cyclic = Math.min(distance, 52 - distance);
      return 15 + 85 * Math.exp(-(cyclic ** 2) / (2 * 5 ** 2));
    }
    case "spike-fade":
      return 6 + 100 * Math.exp(-((t - shape.peakWeek) ** 2) / (2 * 2.5 ** 2));
    case "flat":
      return 55;
  }
}

/**
 * Erzeugt eine Google-Trends-ähnliche Wochenreihe: Rauschen, Länder-Verzögerung,
 * Normierung auf Maximum = 100, ganzzahlige Werte. Deterministisch je Keyword, Land und Woche.
 * `leadWeeks` verschiebt die Kurve nach vorn, für Quellen, die Trends früher zeigen.
 */
export function mockSeries(product: MockProduct, country: Country, now: Date, leadWeeks = 0): TrendPoint[] {
  const lastCompleteWeek = addWeeks(mondayOf(now), -1);
  const firstWeek = addWeeks(lastCompleteWeek, -(SERIES_WEEKS - 1));
  const rng = createRng(`${product.slug}|${country}|${isoDate(lastCompleteWeek)}|${leadWeeks}`);
  // leadWeeks > 0: Quelle sieht den Trend früher (z. B. TikTok vor Google)
  const lag = (product.lagWeeks?.[country] ?? 0) - leadWeeks;
  const absent = product.absentIn?.includes(country) ?? false;

  const rawValues = Array.from({ length: SERIES_WEEKS }, (_, t) => {
    // Kaum Suchvolumen: Trends liefert dann fast nur Nullen mit vereinzelten Ausschlägen,
    // die durch die Normierung trotzdem bis 100 reichen.
    if (absent) return rng() < 0.12 ? between(rng, 30, 100) : 0;
    const weekDate = addWeeks(firstWeek, t);
    const base = curveValue(product.shape, t - lag, addWeeks(weekDate, -lag));
    const noisy = base * between(rng, 0.9, 1.1) + between(rng, -2, 2);
    return Math.max(0, noisy);
  });

  const max = Math.max(...rawValues, 1);
  return rawValues.map((value, t) => ({
    weekStart: isoDate(addWeeks(firstWeek, t)),
    value: Math.round((value / max) * 100),
  }));
}
