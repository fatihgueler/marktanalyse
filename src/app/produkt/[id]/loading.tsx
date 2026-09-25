// Skeleton nur für die Detailseite. Bewusst keine loading.tsx auf Root-Ebene: In Next 15.5 (Production)
// blieben damit Navigationen hängen, die auf derselben Seite nur URL-Parameter ändern (Filter).
const SHIMMER = "animate-shimmer rounded-xl bg-[linear-gradient(90deg,var(--card)_25%,var(--accent)_50%,var(--card)_75%)] bg-[length:200%_100%]";

export default function Loading() {
  return (
    <main className="mx-auto grid max-w-[1200px] gap-6 px-4 pt-20 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Lade Detailansicht …</span>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className={`${SHIMMER} h-40`} />
        <div className={`${SHIMMER} h-56`} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={`${SHIMMER} h-64`} />
        ))}
      </div>
    </main>
  );
}
