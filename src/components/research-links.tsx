import { ExternalLink } from "lucide-react";
import type { Country } from "@/config/radar.config";
import { researchLinks } from "@/lib/research-links";

/** Recherche-Knöpfe: öffnen die Suche beim Anbieter in einem neuen Tab. Der Radar ruft die Seiten nicht selbst auf. */
export function ResearchLinks({ name, country }: { name: string; country: Country }) {
  const links = researchLinks(name, country);
  return (
    <div className="grid gap-2">
      <ul className="flex flex-wrap gap-2" aria-label={`Recherche zu „${name}“`}>
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border bg-background/40 px-3 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              {link.label}
              {link.manualQuery ? <span className="text-xs text-muted-foreground">*</span> : null}
              <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">(öffnet in neuem Tab)</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">* Diese Seiten nehmen keinen Suchbegriff per Link an. Dort „{name}“ eingeben bzw. bei 1688 ein Produktbild hochladen.</p>
    </div>
  );
}
