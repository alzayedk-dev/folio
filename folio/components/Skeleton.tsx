import { messages } from "@/lib/messages";

/** Placeholder blocks shown while data loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-line/60 ${className}`} aria-hidden="true" />;
}

export function PortfolioSkeleton() {
  return (
    <div role="status" aria-label={messages.loading} className="space-y-6">
      <p className="text-sm text-muted">{messages.loading}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className={`h-24 ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`} />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
