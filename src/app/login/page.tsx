import type { Metadata } from "next";
import { RadarMark } from "@/components/radar-mark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden · Trend-Radar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ von?: string }> }) {
  const { von } = await searchParams;
  return (
    <main id="inhalt" className="grid min-h-dvh place-items-center px-4">
      <div className="animate-rise w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <RadarMark />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">nexana intern</p>
            <h1 className="text-2xl font-bold tracking-tight">Trend-Radar</h1>
          </div>
        </div>
        <div className="rounded-xl border bg-card/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <LoginForm target={von ?? "/"} />
        </div>
        <p className="mt-6 text-center text-xs text-subtle-foreground">Früherkennung von Drop-Kandidaten · DACH &amp; UK</p>
      </div>
    </main>
  );
}
