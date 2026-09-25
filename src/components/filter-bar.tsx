"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "alle";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterBarProps {
  countries: FilterOption[];
  categories: FilterOption[];
  sorts: FilterOption[];
  current: { country: string | null; category: string | null; sort: string };
}

/** Filter liegen in der URL: teilbar, Zurück-Taste funktioniert, Server rendert die gefilterte Liste. */
export function FilterBar({ countries, categories, sorts, current }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function hrefWith(key: string, value: string | null): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === ALL) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function navigate(key: string, value: string) {
    startTransition(() => router.push(hrefWith(key, value), { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <nav aria-label="Land" className="flex rounded-lg border bg-card p-1">
        {[{ value: ALL, label: "Alle" }, ...countries].map((option) => {
          const active = (current.country ?? ALL) === option.value;
          return (
            <Link
              key={option.value}
              href={hrefWith("land", option.value)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate("land", option.value);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 font-mono text-xs font-medium tracking-wide transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      <label className="grid gap-1 text-xs text-muted-foreground">
        Kategorie
        <Select value={current.category ?? ALL} onValueChange={(value) => navigate("kategorie", value)}>
          <SelectTrigger className="h-9 w-52 bg-card" aria-label="Kategorie filtern">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Kategorien</SelectItem>
            {categories.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                {option.count !== undefined ? <span className="ml-auto pl-3 font-mono text-subtle-foreground">{option.count}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="grid gap-1 text-xs text-muted-foreground">
        Sortierung
        <Select value={current.sort} onValueChange={(value) => navigate("sort", value)}>
          <SelectTrigger className="h-9 w-44 bg-card" aria-label="Sortierung wählen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sorts.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <span className="flex h-9 items-center" aria-live="polite">
        {pending ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            Aktualisiere …
          </span>
        ) : null}
      </span>
    </div>
  );
}
