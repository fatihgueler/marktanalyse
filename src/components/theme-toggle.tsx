"use client";

import { SunMoon } from "lucide-react";
import { THEME_COOKIE } from "@/lib/theme";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function currentTheme(): "light" | "dark" {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Hell/Dunkel umschalten; die Wahl landet im Cookie, damit der Server die Seite gleich richtig ausliefert. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={() => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
      }}
      aria-label="Hell oder dunkel umschalten"
      title="Hell oder dunkel umschalten"
      className="inline-grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <SunMoon className="size-4" aria-hidden="true" />
    </button>
  );
}
