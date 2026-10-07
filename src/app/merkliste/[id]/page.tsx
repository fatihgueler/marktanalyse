import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { deleteCheck, moveStage } from "@/app/check/actions";
import { deleteDrop } from "@/app/produkt/[id]/drop-actions";
import { AppHeader } from "@/components/app-header";
import { CheckResult } from "@/components/check-result";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DropFeedbackForm } from "@/components/drop-feedback-form";
import { ResearchLinks } from "@/components/research-links";
import { Sparkline } from "@/components/sparkline";
import { TrendCsvUpload } from "@/components/trend-csv-upload";
import { Button } from "@/components/ui/button";
import { radarConfig, type CategoryId } from "@/config/radar.config";
import { formatDateTime, formatNumber, formatPercent, formatWeek } from "@/lib/format";
import { STAGES, STAGE_LABELS } from "@/lib/pipeline";
import { getProductCheck } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Merkliste · Trend-Radar" };

export default async function CheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await getProductCheck(id);
  if (!check) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const categoryLabel = radarConfig.categories[check.category as CategoryId]?.label ?? check.category;

  return (
    <>
      <AppHeader active="merkliste" />
      <main id="inhalt" className="mx-auto grid max-w-[1100px] gap-8 px-4 pb-16 pt-6 sm:px-6">
        <Link href="/merkliste" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Zur Merkliste
        </Link>

        <section aria-labelledby="titel" className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {radarConfig.countries[check.country].label} · {categoryLabel} · geprüft {formatDateTime(check.updatedAt)}
          </p>
          <h1 id="titel" className="text-3xl font-bold tracking-tight">{check.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {check.url ? (
              <Button asChild variant="outline" size="sm">
                <a href={check.url} target="_blank" rel="noopener noreferrer">
                  Angebot öffnen <ExternalLink aria-hidden="true" />
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`/check?id=${check.id}`}>Werte ändern</Link>
            </Button>
          </div>
          <nav aria-label="Stufe" className="flex flex-wrap gap-1.5">
            {STAGES.map((stage) => (
              <form key={stage} action={moveStage}>
                <input type="hidden" name="id" value={check.id} />
                <input type="hidden" name="stage" value={stage} />
                <button
                  type="submit"
                  aria-current={check.stage === stage ? "step" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    check.stage === stage ? "border-primary bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {STAGE_LABELS[stage]}
                </button>
              </form>
            ))}
          </nav>
        </section>

        <CheckResult view={check.view} />

        <section aria-labelledby="recherche-titel" className="grid gap-3">
          <h2 id="recherche-titel" className="text-lg font-semibold">Recherche</h2>
          <ResearchLinks name={check.name} country={check.country} />
        </section>

        <section aria-labelledby="trend-titel" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <h2 id="trend-titel" className="text-lg font-semibold">Trend aus Google Trends</h2>
          {check.trendSeries && check.trendPhase ? (
            <div className="flex flex-wrap items-center gap-4">
              <Sparkline series={check.trendSeries} label={`Google-Trends-Kurve „${check.trendKeyword}“, ${check.trendSeries.length} Wochen`} />
              <p className="text-sm">
                <span className="font-semibold">{check.trendPhase}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · „{check.trendKeyword}“, {check.trendSeries.length} Wochen
                  {check.trendScore !== null ? ` · Trend-Score ${formatNumber(check.trendScore * 100)} von 100` : ""}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Noch keine Kurve. Über „Google Trends“ bei der Recherche öffnen, exportieren und hier hochladen.</p>
          )}
          <TrendCsvUpload checkId={check.id} />
        </section>

        <section aria-labelledby="drop-titel" className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
          <div className="grid gap-1">
            <h2 id="drop-titel" className="text-lg font-semibold">Drop-Ergebnis</h2>
            <p className="text-sm text-muted-foreground">
              Nach dem Test-Drop eintragen. Das Ergebnis setzt die Stufe auf „Ergebnis“ und fließt in die{" "}
              <Link href="/kalibrierung" className="text-primary underline-offset-4 hover:underline">
                Kalibrierung
              </Link>{" "}
              ein (Marge und, falls hochgeladen, Trend).
            </p>
          </div>
          {check.drops.length > 0 ? (
            <ul className="grid gap-2" aria-label="Erfasste Ergebnisse">
              {check.drops.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{o.verdict === "TOP" ? "Top" : o.verdict === "OK" ? "Okay" : "Flop"}</span>
                    <span className="text-xs text-muted-foreground">{formatWeek(o.droppedAt.toISOString().slice(0, 10))}</span>
                    {o.unitsSold !== null ? <span className="text-xs">{formatNumber(o.unitsSold)} Stück</span> : null}
                    {o.returnRate !== null ? <span className="text-xs">{formatPercent(o.returnRate, 1)} Retouren</span> : null}
                    {o.note ? <span className="text-xs text-muted-foreground">„{o.note}“</span> : null}
                  </span>
                  <form action={deleteDrop}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="checkId" value={check.id} />
                    <ConfirmSubmitButton
                      message="Dieses Drop-Ergebnis wirklich löschen?"
                      className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                    >
                      Löschen
                    </ConfirmSubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <DropFeedbackForm productCheckId={check.id} today={today} />
        </section>

        <form action={deleteCheck} className="border-t pt-4">
          <input type="hidden" name="id" value={check.id} />
          <ConfirmSubmitButton
            message={`„${check.name}“ samt Drop-Ergebnissen von der Merkliste löschen?`}
            className="rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
          >
            Von der Merkliste löschen
          </ConfirmSubmitButton>
        </form>
      </main>
    </>
  );
}
