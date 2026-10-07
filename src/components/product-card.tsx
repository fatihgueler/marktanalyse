import Link from "next/link";
import { ArrowUpRight, Package, Sparkles, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckVerdict } from "@/scoring/product-check";
import type { RankingVerdict } from "@/scoring/ranking";

export type VerdictTone = "good" | "watch" | "late" | "bad";

export const TONE_STYLE: Record<VerdictTone, string> = {
  good: "bg-status-good/12 text-status-good ring-status-good/30",
  watch: "bg-series-trend/12 text-series-trend ring-series-trend/30",
  late: "bg-status-warning/14 text-status-warning ring-status-warning/35",
  bad: "bg-status-critical/12 text-status-critical ring-status-critical/30",
};

export const VERDICT_TONE: Record<RankingVerdict | CheckVerdict, VerdictTone> = {
  "Jetzt testen": "good",
  Beobachten: "watch",
  "Zu spät": "late",
  "Marge zu dünn": "bad",
  "Lohnt sich": "good",
  Knapp: "watch",
  "Finger weg": "bad",
};

export interface ProductCardData {
  href: string;
  name: string;
  imageUrl: string | null;
  /** z. B. „Technik & Gadgets · 3 Angebote“ */
  subtitle: string;
  verdict: { label: string; tone: VerdictTone };
  /** drei Kennzahlen in Worten */
  facts: { label: string; value: string }[];
  /** „DE 88“, „AT 87“ */
  chips: string[];
  /** Hinweis wie „Merkliste: Geprüft“ */
  badge?: string;
  /** Lieferzeit laut Quelle, z. B. „7–12 Tage“; slow = über der Grenze aus der Config */
  delivery?: { label: string; slow: boolean; title: string } | null;
  /** „Neu“ oder „+12 Punkte“ gegenüber dem Vergleichslauf */
  movement?: { label: string; title: string } | null;
  externalUrl?: string | null;
}

/** Produktbild der Quelle oder ein neutraler Platzhalter – es werden keine neuen Bildquellen angebunden. */
export function ProductImage({ src, name, className }: { src: string | null; name: string; className?: string }) {
  if (!src) {
    return (
      <div className={cn("grid place-items-center bg-muted text-subtle-foreground", className)} role="img" aria-label={`Kein Bild für ${name}`}>
        <Package className="size-7" strokeWidth={1.5} aria-hidden="true" />
      </div>
    );
  }
  // Bilder kommen von wechselnden Lieferanten-CDNs; next/image bräuchte jede Domain in der Config.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" className={cn("bg-muted object-cover", className)} />;
}

export function VerdictBadge({ label, tone, className }: { label: string; tone: VerdictTone; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ring-inset", TONE_STYLE[tone], className)}>{label}</span>;
}

/** Ein Produkt = eine Karte: Bild, kurzer Name, Urteil, drei Kennzahlen in Worten, Länder. */
export function ProductCard({ data }: { data: ProductCardData }) {
  return (
    <li className="group relative flex gap-3 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md sm:p-4">
      <ProductImage src={data.imageUrl} name={data.name} className="size-20 shrink-0 rounded-lg sm:size-24" />
      <div className="grid min-w-0 flex-1 content-start gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-sans text-base leading-snug font-semibold">
              <Link href={data.href} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
                {data.name}
              </Link>
            </h3>
            <p className="truncate text-xs text-muted-foreground">{data.subtitle}</p>
          </div>
          <VerdictBadge label={data.verdict.label} tone={data.verdict.tone} className="shrink-0 text-xs" />
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {data.facts.map((fact) => (
            <div key={fact.label} className="flex gap-1.5 sm:block">
              <dt className="text-muted-foreground sm:text-xs">{fact.label}</dt>
              <dd className="font-medium tabular">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-1.5">
          {data.movement ? (
            <span title={data.movement.title} className="inline-flex items-center gap-1 rounded-md bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {data.movement.label}
              <span className="sr-only"> ({data.movement.title})</span>
            </span>
          ) : null}
          {data.delivery ? (
            <span
              title={data.delivery.title}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular",
                data.delivery.slow ? "bg-status-warning/14 text-status-warning" : "bg-muted",
              )}
            >
              <Truck className="size-3.5" aria-hidden="true" />
              {data.delivery.label}
              <span className="sr-only"> Lieferzeit{data.delivery.slow ? ", zu lang für einen Drop" : ""}</span>
            </span>
          ) : null}
          {data.chips.map((chip) => (
            <span key={chip} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular">
              {chip}
            </span>
          ))}
          {data.badge ? <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">{data.badge}</span> : null}
          {data.externalUrl ? (
            <a
              href={data.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Angebot <ArrowUpRight className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(öffnet in neuem Tab)</span>
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}
