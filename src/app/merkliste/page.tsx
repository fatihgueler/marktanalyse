import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ClipboardList } from "lucide-react";
import { moveStage } from "@/app/check/actions";
import { AppHeader } from "@/components/app-header";
import { VERDICT_STYLE } from "@/components/check-result";
import { Button } from "@/components/ui/button";
import { radarConfig, type CategoryId } from "@/config/radar.config";
import { formatMoney, formatPercent } from "@/lib/format";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/pipeline";
import { getProductChecks, type CheckRow } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { CheckVerdict } from "@/scoring/product-check";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Merkliste · Trend-Radar" };

function MoveButton({ id, stage, direction }: { id: string; stage: Stage; direction: "zurück" | "weiter" }) {
  return (
    <form action={moveStage}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="stage" value={stage} />
      <button
        type="submit"
        aria-label={`Nach „${STAGE_LABELS[stage]}“ verschieben`}
        title={`Nach „${STAGE_LABELS[stage]}“`}
        className="inline-grid size-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {direction === "zurück" ? <ArrowLeft className="size-4" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
      </button>
    </form>
  );
}

function CheckCard({ check }: { check: CheckRow }) {
  const index = STAGES.indexOf(check.stage);
  const previous = STAGES[index - 1];
  const next = STAGES[index + 1];
  return (
    <li className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/merkliste/${check.id}`} className="font-medium leading-snug hover:underline">
          {check.name}
        </Link>
        <span className="shrink-0 text-xs text-muted-foreground">{check.country}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", VERDICT_STYLE[check.verdict as CheckVerdict])}>{check.verdict}</span>
        <span className="tabular">
          bleibt {formatMoney(check.marginAbs, check.view.result.margin.currency)} ({formatPercent(check.marginPct)})
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{radarConfig.categories[check.category as CategoryId]?.label ?? check.category}</span>
        <span>{check.trendPhase ? `Trend: ${check.trendPhase}` : "Trend: noch keine Kurve"}</span>
        {check.view.result.priceEstimated ? <span>Preis geschätzt</span> : null}
      </div>
      <div className="flex gap-2">
        {previous ? <MoveButton id={check.id} stage={previous} direction="zurück" /> : null}
        {next ? <MoveButton id={check.id} stage={next} direction="weiter" /> : null}
      </div>
    </li>
  );
}

export default async function MerklistePage() {
  const checks = await getProductChecks();
  return (
    <>
      <AppHeader active="merkliste" />
      <main id="inhalt" className="mx-auto grid max-w-[1400px] gap-6 px-4 pb-16 pt-8 sm:px-6">
        <section aria-labelledby="titel" className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-primary">Merkliste</p>
            <h1 id="titel" className="text-3xl font-bold tracking-tight">Von der Idee zum Drop</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Jedes Produkt durchläuft Idee → Geprüft → Test-Drop → Ergebnis. Ergebnisse fließen in die Kalibrierung ein.
            </p>
          </div>
          <Button asChild>
            <Link href="/check">Produkt prüfen</Link>
          </Button>
        </section>

        {checks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center text-muted-foreground">
            <ClipboardList className="size-10" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-lg font-semibold text-foreground">Noch nichts auf der Merkliste</p>
            <p className="max-w-md text-sm">Im Produkt-Check ein Produkt durchrechnen und „Auf die Merkliste“ klicken.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {STAGES.map((stage) => {
              const inStage = checks.filter((c) => c.stage === stage);
              return (
                <section key={stage} aria-labelledby={`stufe-${stage}`} className="grid content-start gap-3 rounded-xl border bg-muted/30 p-3">
                  <h2 id={`stufe-${stage}`} className="flex items-baseline justify-between text-sm font-semibold">
                    {STAGE_LABELS[stage]}
                    <span className="text-xs font-normal text-muted-foreground tabular">{inStage.length}</span>
                  </h2>
                  {inStage.length > 0 ? (
                    <ul className="grid gap-2">
                      {inStage.map((check) => (
                        <CheckCard key={check.id} check={check} />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-1 text-xs text-muted-foreground">leer</p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
