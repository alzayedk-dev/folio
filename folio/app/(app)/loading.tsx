import { messages } from "@/lib/messages";
import { Skeleton } from "@/components/Skeleton";

/**
 * Shown the instant a tab is tapped, while the server prepares the page (Next.js also prefetches this
 * so tab switches feel immediate in the browser and the phone app).
 */
export default function AppLoading() {
  return (
    <div role="status" aria-label={messages.loading} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <p className="text-sm text-muted">{messages.loading}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
