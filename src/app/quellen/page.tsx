import type { Metadata } from "next";
import { headers } from "next/headers";
import { CircleOff, FlaskConical, Radio } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { sourceLabel } from "@/lib/labels";
import { getLatestRun, getPinterestConnection } from "@/lib/queries";
import { PINTEREST_CALLBACK_PATH } from "@/lib/request-origin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quellen · Trend-Radar" };

/** Was jede Quelle beiträgt und welche Railway-Variablen sie live schalten. */
const SOURCES: { id: string; role: string; vars: string; cost: string; required?: boolean }[] = [
  { id: "google-trends", role: "Trends", vars: "SERPAPI_API_KEY", cost: "25 $/Monat, zusammen mit Google Shopping", required: true },
  { id: "pinterest-trends", role: "Trends", vars: "PINTEREST_APP_ID, PINTEREST_APP_SECRET, dann unten verbinden", cost: "kostenlos" },
  { id: "tiktok-trends", role: "Trends (Scraping)", vars: "APIFY_TOKEN", cost: "Apify-Gratisguthaben" },
  { id: "aliexpress", role: "Einkauf", vars: "ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID", cost: "kostenlos", required: true },
  { id: "alibaba-1688", role: "Einkauf (Scraping)", vars: "APIFY_TOKEN und ANTHROPIC_API_KEY", cost: "Apify-Gratisguthaben" },
  { id: "google-shopping", role: "Verkaufspreis", vars: "SERPAPI_API_KEY", cost: "in SerpApi enthalten", required: true },
  { id: "meta-ad-library", role: "Werbedruck (DE, AT)", vars: "META_ACCESS_TOKEN, META_APP_ID, META_APP_SECRET", cost: "kostenlos" },
  { id: "tiktok-ads", role: "Werbedruck (DE, AT)", vars: "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET", cost: "kostenlos" },
  { id: "claude", role: "Matching und Übersetzung", vars: "ANTHROPIC_API_KEY", cost: "ca. 3 $/Monat", required: true },
  { id: "ezb-kurse", role: "Wechselkurse", vars: "keine", cost: "kostenlos" },
];

const PINTEREST_MESSAGES: Record<string, { text: string; good: boolean }> = {
  verbunden: { text: "Pinterest ist verbunden. Ab dem nächsten Lauf kommen echte Pinterest-Trends.", good: true },
  abgebrochen: { text: "Die Anmeldung bei Pinterest wurde abgebrochen.", good: false },
  ungueltig: { text: "Die Rückmeldung von Pinterest passte nicht zur Anfrage. Bitte noch einmal verbinden.", good: false },
  fehlt: { text: "PINTEREST_APP_ID und PINTEREST_APP_SECRET fehlen in den Railway-Variablen.", good: false },
  "ohne-refresh": { text: "Pinterest hat keinen Refresh-Token geliefert. In der Pinterest-App prüfen, ob sie für die API freigegeben ist.", good: false },
  fehler: { text: "Pinterest hat die Anmeldung abgelehnt. Ist die Weiterleitungs-Adresse unten in der Pinterest-App eingetragen?", good: false },
};

function ModeBadge({ mode }: { mode: string | undefined }) {
  if (!mode) return <span className="text-subtle-foreground">–</span>;
  const live = mode === "live";
  const off = mode === "off";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        live ? "border-primary/40 text-foreground" : off ? "border-border text-muted-foreground" : "border-status-warning/40 text-status-warning",
      )}
    >
      {live ? <Radio className="size-3" aria-hidden="true" /> : off ? <CircleOff className="size-3" aria-hidden="true" /> : <FlaskConical className="size-3" aria-hidden="true" />}
      {live ? "Live" : off ? "aus" : "Demo"}
    </span>
  );
}

export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const [run, connection, headerList] = await Promise.all([getLatestRun(), getPinterestConnection(), headers()]);
  const modes = (run?.sourceModes ?? {}) as Record<string, string>;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = (headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")).split(",")[0];
  const redirectUri = `${proto}://${host}${PINTEREST_CALLBACK_PATH}`;
  const pinterestConfigured = Boolean(process.env.PINTEREST_APP_ID?.trim() && process.env.PINTEREST_APP_SECRET?.trim());
  const message = typeof params.pinterest === "string" ? PINTEREST_MESSAGES[params.pinterest] : undefined;

  return (
    <>
      <AppHeader active="quellen" />
      <main id="inhalt" className="mx-auto grid max-w-[1100px] gap-8 px-4 pb-16 pt-8 sm:px-6">
        <section aria-labelledby="titel" className="animate-rise grid gap-2">
          <p className="text-sm font-medium text-primary">Quellen</p>
          <h1 id="titel" className="text-3xl font-bold tracking-tight">Woher die Daten kommen</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Status aus dem letzten Lauf{run ? ` (${formatDateTime(run.startedAt)})` : ""}. Zugänge tragt ihr in Railway unter „Variables“ ein, beim Web-Service und beim Service
            „collect“. Nach dem nächsten Lauf steht hier „Live“. Sobald Trends oder Angebote live sind, laufen die übrigen Demo-Quellen nicht mehr mit („aus“).
          </p>
        </section>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Quelle</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Railway-Variablen</th>
                <th scope="col" className="px-4 py-3 font-medium">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((source) => (
                <tr key={source.id} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    {sourceLabel(source.id)}
                    {source.required ? <span className="ml-2 text-xs font-medium text-primary">Pflicht</span> : null}
                    <span className="block text-[11px] font-normal text-subtle-foreground">{source.role}</span>
                  </th>
                  <td className="px-4 py-3">
                    <ModeBadge mode={modes[source.id]} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{source.vars}</td>
                  <td className="px-4 py-3 text-muted-foreground">{source.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section aria-labelledby="pinterest-titel" className="grid gap-3 rounded-xl border bg-card p-5">
          <h2 id="pinterest-titel" className="text-lg font-semibold">Pinterest verbinden</h2>
          {message ? (
            <p role="status" className={cn("text-sm", message.good ? "text-status-good" : "text-status-warning")}>
              {message.text}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {connection
              ? `Verbunden. Der Zugang erneuert sich bei jedem Lauf selbst${connection.expiresAt ? ` und ist aktuell gültig bis ${formatDateTime(connection.expiresAt)}` : ""}. Wenn mindestens alle 60 Tage ein Lauf stattfindet, muss hier nichts mehr passieren.`
              : "Noch nicht verbunden. Pinterest vergibt Dauer-Zugänge nur über diese Anmeldung, Test-Tokens aus dem Entwicklerportal laufen nach 24 Stunden ab."}
          </p>
          <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
            <li>In der Pinterest-App (developers.pinterest.com → My apps) diese Weiterleitungs-Adresse eintragen:</li>
          </ol>
          <code className="block overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs">{redirectUri}</code>
          <ol start={2} className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
            <li>App ID und App Secret als PINTEREST_APP_ID und PINTEREST_APP_SECRET in Railway eintragen und neu deployen.</li>
            <li>Auf den Button klicken, bei Pinterest anmelden und den Zugriff erlauben.</li>
          </ol>
          <div>
            {pinterestConfigured ? (
              <Button asChild>
                {/* Absichtlich <a>: Der Link führt über eine Weiterleitung zu Pinterest, nicht zu einer App-Seite. */}
                <a href="/api/pinterest/connect">{connection ? "Neu verbinden" : "Mit Pinterest verbinden"}</a>
              </Button>
            ) : (
              <p className="text-sm text-status-warning">Erst PINTEREST_APP_ID und PINTEREST_APP_SECRET in Railway eintragen, dann erscheint hier der Button.</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
