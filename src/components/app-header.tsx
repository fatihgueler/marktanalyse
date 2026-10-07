import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import { RadarMark } from "./radar-mark";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Rangliste", key: "rangliste" },
  { href: "/check", label: "Produkt-Check", key: "check" },
  { href: "/merkliste", label: "Merkliste", key: "merkliste" },
  { href: "/kalibrierung", label: "Kalibrierung", key: "kalibrierung" },
  { href: "/quellen", label: "Quellen", key: "quellen" },
] as const;

/** Auf dem Handy zwei Zeilen (Logo + Aktionen, darunter die Navigation), ab md eine Zeile. */
export function AppHeader({ active }: { active?: (typeof NAV)[number]["key"] }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6 md:py-3">
        <Link href="/" className="flex items-center gap-2.5 rounded-md py-1">
          <RadarMark className="size-7" />
          <span className="leading-tight">
            <span className="block text-[11px] text-muted-foreground">nexana</span>
            <span className="block font-[family-name:var(--font-display)] text-base font-bold tracking-tight">Trend-Radar</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1 md:order-3 md:ml-0">
          <ThemeToggle />
          <form action={logout}>
            <button
              type="submit"
              aria-label="Abmelden"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </form>
        </div>
        <nav aria-label="Hauptnavigation" className="-mx-1 flex w-full gap-1 overflow-x-auto pb-1 md:order-2 md:mx-0 md:w-auto md:flex-1 md:pb-0">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active === item.key ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
