import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { RadarMark } from "./radar-mark";

export function AppHeader() {
  return (
    <header className="border-b border-border/70 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 rounded-md">
          <RadarMark className="size-8" />
          <span className="leading-tight">
            <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">nexana</span>
            <span className="block text-base font-bold tracking-tight">Trend-Radar</span>
          </span>
        </Link>
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
