"use client";

import { useActionState, useEffect, useRef } from "react";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { recordDrop, type DropFormState } from "@/app/produkt/[id]/drop-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: DropFormState = { error: null, saved: false };

const VERDICTS = [
  { value: "TOP", label: "Top", hint: "Erwartung übertroffen" },
  { value: "OK", label: "Okay", hint: "im Rahmen" },
  { value: "FLOP", label: "Flop", hint: "hat sich nicht gelohnt" },
] as const;

/** Erfasst das Ergebnis eines echten Drops – Grundlage für /kalibrierung. */
export function DropFeedbackForm({ candidateSnapshotId, today }: { candidateSnapshotId: string; today: string }) {
  const [state, formAction, pending] = useActionState(recordDrop, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <input type="hidden" name="candidateSnapshotId" value={candidateSnapshotId} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Urteil</legend>
        <div className="grid grid-cols-3 gap-2">
          {VERDICTS.map((v) => (
            <label
              key={v.value}
              className={cn(
                "flex cursor-pointer flex-col rounded-lg border bg-background/40 px-3 py-2 text-sm transition-colors",
                "has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring hover:bg-accent",
              )}
            >
              <input type="radio" name="verdict" value={v.value} required className="sr-only" />
              <span className="font-semibold">{v.label}</span>
              <span className="text-xs text-muted-foreground">{v.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="droppedAt">Gedroppt am</Label>
          <Input id="droppedAt" name="droppedAt" type="date" required max={today} defaultValue={today} className="font-mono" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="unitsSold">Verkaufte Stück</Label>
          <Input id="unitsSold" name="unitsSold" type="number" min={0} step={1} inputMode="numeric" className="font-mono" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="returnRatePercent">Retourenquote (%)</Label>
          <Input id="returnRatePercent" name="returnRatePercent" type="number" min={0} max={100} step={0.1} inputMode="decimal" className="font-mono" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note">Notiz (optional)</Label>
        <textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {pending ? "Speichere …" : "Ergebnis speichern"}
        </Button>
        <p role="status" aria-live="polite" className={cn("text-sm", state.error ? "text-destructive" : "text-status-good")}>
          {state.error ??
            (state.saved ? (
              <span className="flex items-center gap-1.5">
                <CircleCheck className="size-4" aria-hidden="true" />
                Gespeichert – fließt in die Kalibrierung ein.
              </span>
            ) : null)}
        </p>
      </div>
    </form>
  );
}
