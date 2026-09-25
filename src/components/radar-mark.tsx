import { cn } from "@/lib/utils";

/** Logo: Radarschirm mit rotierendem Sweep (respektiert prefers-reduced-motion über globals.css). */
export function RadarMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative inline-grid size-9 place-items-center overflow-hidden rounded-full border border-primary/40", className)}>
      <span className="absolute inset-[22%] rounded-full border border-primary/25" />
      <span className="absolute inset-[44%] rounded-full bg-primary" />
      <span className="animate-sweep absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_280deg,oklch(0.88_0.19_125/0.55)_360deg)]" />
    </span>
  );
}
