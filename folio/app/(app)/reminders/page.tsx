import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadLedgerData } from "@/lib/loadPortfolio";
import { replayLedger } from "@/lib/portfolio";
import { market } from "@/lib/market";
import { isMetal } from "@/lib/metals";
import { messages } from "@/lib/messages";
import { PageHeader, EmptyState } from "@/components/PagePlaceholder";
import { Skeleton } from "@/components/Skeleton";
import { Alert } from "@/components/ui";

export const metadata = { title: "Reminders · Folio" };

export default function RemindersPage() {
  return (
    <>
      <PageHeader title="Reminders" subtitle="Upcoming earnings for the stocks you hold. You'll get an alert 10 days and 1 day before." />
      <Suspense
        fallback={
          <div role="status" aria-label={messages.loading} className="space-y-3">
            <p className="text-sm text-muted">{messages.loading}</p>
            <Skeleton className="h-64" />
          </div>
        }
      >
        <RemindersContent />
      </Suspense>
    </>
  );
}

function daysUntil(date: string) {
  const today = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((Date.parse(date + "T00:00:00Z") - today) / 864e5);
}

function Flag({ days }: { days: number }) {
  if (days <= 1)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-loss">
        <span className="h-2 w-2 rounded-full bg-loss" aria-hidden="true" /> {days <= 0 ? "Today" : "Tomorrow"}
      </span>
    );
  if (days <= 10)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-warn">
        <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> Within 10 Days
      </span>
    );
  return <span className="text-xs text-muted">Scheduled</span>;
}

async function RemindersContent() {
  const supabase = await createClient();
  const { txns, cash, symbols } = await loadLedgerData(supabase);
  const held = Object.values(replayLedger(txns, cash).positions)
    .filter((p) => p.shares > 1e-9 && !isMetal(p.ticker))
    .map((p) => p.ticker);

  if (held.length === 0) return <EmptyState title="No earnings on the calendar yet.">Add stocks to your portfolio to see their earnings dates here.</EmptyState>;

  let dates: Record<string, string | null> = {};
  let failed = false;
  try {
    dates = await market.earnings(supabase, held);
  } catch {
    failed = true;
  }

  const rows = held
    .map((t) => ({ ticker: t, name: symbols[t]?.name ?? t, date: dates[t] ?? null }))
    .sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : a.ticker.localeCompare(b.ticker)));

  return (
    <div className="space-y-4">
      {failed && <Alert tone="info">{messages.marketSlow()}</Alert>}
      <section aria-label="Upcoming earnings" className="rounded-2xl border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-line bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 text-left font-medium">Stock</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Earnings Date</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Days Left</th>
                <th scope="col" className="px-5 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {rows.map((r) => {
                const left = r.date ? daysUntil(r.date) : null;
                return (
                  <tr key={r.ticker}>
                    <td className="px-5 py-3">
                      <Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="block font-semibold hover:text-brand hover:underline">
                        {r.ticker}
                      </Link>
                      <span className="block max-w-[14rem] truncate text-xs text-muted">{r.name}</span>
                    </td>
                    <td className="px-3 py-3">
                      {r.date ? new Date(r.date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : <span className="text-muted">Not announced yet</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-medium">{left == null ? "—" : left}</td>
                    <td className="px-5 py-3">{left == null ? <span className="text-xs text-muted">—</span> : <Flag days={left} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-muted">Dates come from company calendars and can change. Alerts arrive in the bell (and by email once it&apos;s set up), based on your alert settings.</p>
    </div>
  );
}
