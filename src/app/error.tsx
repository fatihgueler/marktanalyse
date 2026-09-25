"use client";

import { RotateCcw, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="inhalt" className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4">
      <div role="alert" className="flex flex-col items-center gap-3 text-center">
        <ServerCrash className="size-10 text-destructive" strokeWidth={1.5} aria-hidden="true" />
        <h1 className="text-xl font-semibold">Daten konnten nicht geladen werden</h1>
        <p className="text-sm text-muted-foreground">
          Meist ist die Datenbank nicht erreichbar oder DATABASE_URL fehlt.{error.digest ? ` (Fehler-ID ${error.digest})` : ""}
        </p>
        <Button onClick={reset} variant="outline">
          <RotateCcw aria-hidden="true" />
          Erneut versuchen
        </Button>
      </div>
    </main>
  );
}
