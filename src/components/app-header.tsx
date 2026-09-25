import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RadarMark } from "./radar-mark";

const NAV = [
  { href: "/", label: "Rangliste", key: "rangliste" },
  { href: "/kalibrierung", label: "Kalibrierung", key: "kalibrierung" },
] as const;

export function AppHeader({ active }: { active?: (typeof NAV)[number]["key"] }) {
  return (
    <header className="border-b border-border/70 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 rounded-md">
          <RadarMark className="size-8" />
          <span className="hidden leading-tight sm:block">
            <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">nexana</span>
            <span className="block text-base font-bold tracking-tight">Trend-Radar</span>
          </span>
        </Link>
        <nav aria-label="Hauptnavigation" className="mr-auto ml-4 flex gap-1 sm:ml-8">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active === item.key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            <LogOut aria-hidden="true" />
            Abmelden
          </Button>
        </form>
      </div>
    </header>
  );
}
