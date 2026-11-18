import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadPerformance } from "@/lib/loadPerformance";
import { PageHeader, EmptyState } from "@/components/PagePlaceholder";
import { PerformanceChart } from "@/components/PerformanceChart";
import { Skeleton } from "@/components/Skeleton";
import { Alert } from "@/components/ui";
import { messages } from "@/lib/messages";
import { getCurrentPortfolio, getMyPortfolios } from "@/lib/currentPortfolio";

export const metadata = { title: "Performance · Folio" };

export default function PerformancePage() {
  return (
    <>
      <PageHeader title="Performance" subtitle="How this portfolio has grown since day one. Compare it with your other portfolios or the market." />
      <Suspense
        fallback={
          <div role="status" aria-label={messages.loading} className="space-y-4">
            <p className="text-sm text-muted">{messages.loading}</p>
            <Skeleton className="h-10 w-full max-w-80" />
            <Skeleton className="h-80" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          </div>
        }
      >
        <PerformanceContent />
      </Suspense>
    </>
  );
}

async function PerformanceContent() {
  const supabase = await createClient();
  const [{ points, firstDate, today, base, benchmarks, notice, usesTodaysFx }, current, { list }] = await Promise.all([loadPerformance(supabase), getCurrentPortfolio(), getMyPortfolios()]);
  const others = list.filter((p) => p.id !== current?.id).map((p) => ({ id: p.id, name: p.name, kind: p.kind }));

  if (!firstDate || points.length === 0) {
    return <EmptyState title="Your performance chart will appear after your first trade.">Add a transaction or your cash balance to get started.</EmptyState>;
  }

  return (
    <div className="space-y-4">
      {notice && <Alert tone="info">{notice}</Alert>}
      <PerformanceChart points={points} benchmarks={benchmarks} base={base} firstDate={firstDate} today={today} currentName={current?.name ?? "My Portfolio"} others={others} />
      <p className="text-xs text-muted">
        Values use daily closing prices, carried over weekends and holidays.
        {usesTodaysFx && " Amounts in other currencies are converted at today's exchange rates."} Past performance doesn&apos;t predict future results.
      </p>
    </div>
  );
}
