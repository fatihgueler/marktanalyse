import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { BacktestWorkbench } from "@/components/backtest-workbench";

export const metadata: Metadata = { title: "Rückblick · Trend-Radar" };

export default function BacktestPage() {
  return (
    <>
      <AppHeader active="rueckblick" />
      <main id="inhalt" className="mx-auto grid max-w-[1200px] gap-8 px-4 pb-16 pt-8 sm:px-6">
        <section aria-labelledby="titel" className="grid gap-2">
          <p className="text-sm font-medium text-primary">Rückblick-Test</p>
          <h1 id="titel" className="text-3xl font-bold tracking-tight">Hätte der Radar frühere Hits rechtzeitig gefunden?</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Google-Trends-Verläufe vergangener Hypes laden. Der Radar bewertet sie Woche für Woche so, als wäre er damals jeden Montag gelaufen, und zeigt, wie viele
            Wochen vor dem Höhepunkt er angeschlagen hätte. Bewertet wird nur der Trend: Marge und Wettbewerb von damals sind unbekannt, und ob der Radar den Suchbegriff
            überhaupt entdeckt hätte, lässt sich nicht nachstellen.
          </p>
        </section>
        <BacktestWorkbench />
      </main>
    </>
  );
}
