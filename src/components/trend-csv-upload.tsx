"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { importTrendCsv, type TrendImportState } from "@/app/check/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Upload einer Google-Trends-CSV („Zeitverlauf“ → Herunterladen) für einen Merkliste-Eintrag. */
export function TrendCsvUpload({ checkId }: { checkId: string }) {
  const [state, formAction, pending] = useActionState<TrendImportState, FormData>(importTrendCsv, { error: null, message: null });
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="id" value={checkId} />
      <div className="grid gap-1.5">
        <Label htmlFor="csv">CSV aus Google Trends</Label>
        <input
          id="csv"
          name="csv"
          type="file"
          accept=".csv,text/csv"
          required
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
        <p className="text-xs text-muted-foreground">
          In Google Trends Land wählen, Zeitraum „Letzte 12 Monate“, dann beim Diagramm „Zeitverlauf“ auf das Download-Symbol klicken.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Kurve bewerten
        </Button>
        <p role="status" aria-live="polite" className={cn("text-sm", state.error ? "text-destructive" : "text-status-good")}>
          {state.error ?? state.message}
        </p>
      </div>
    </form>
  );
}
