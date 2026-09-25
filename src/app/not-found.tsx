import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main id="inhalt" className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <SearchX className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <h1 className="text-xl font-semibold">Nicht gefunden</h1>
        <p className="text-sm text-muted-foreground">Diesen Kandidaten gibt es nicht (mehr).</p>
        <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
          Zur Rangliste
        </Link>
      </div>
    </main>
  );
}
