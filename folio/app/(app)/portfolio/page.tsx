import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadValuation } from "@/lib/loadValuation";
import { toPositionSummary } from "@/lib/positionSummary";
import { messages } from "@/lib/messages";
import { PageHeader, EmptyState } from "@/components/PagePlaceholder";
import { AddTransactionButton } from "@/components/AddTransactionButton";
import { SummaryCards } from "@/components/SummaryCards";
import { HoldingsTable } from "@/components/HoldingsTable";
import { RefreshPrices } from "@/components/RefreshPrices";
import { PortfolioSkeleton } from "@/components/Skeleton";
import { SectorTable } from "@/components/SectorTable";
import { CashCard } from "@/components/CashCard";
import { Alert } from "@/components/ui";

export const metadata = { title: "Portfolio · Folio" };

export default function PortfolioPage() {
  return (
    <Suspense fallback={<PortfolioSkeleton />}>
      <PortfolioContent />
    </Suspense>
  );
}

async function PortfolioContent() {
  const supabase = await createClient();
  const { ledger, valuation: v, notice, asOf, cash } = await loadValuation(supabase);
  const positions = toPositionSummary(ledger);
  const hasAnything = v.holdings.length > 0 || v.cashValue > 0;

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle="Your holdings, cash and sector mix at a glance."
        action={<AddTransactionButton positions={positions} />}
      />

      {!hasAnything ? (
        <div className="space-y-6">
          <EmptyState title={messages.emptyPortfolio}>Click “Add transaction” to record your first buy, or add the cash in your account.</EmptyState>
          <div className="max-w-md">
            <CashCard balances={v.cashByCurrency} total={v.cashValue} base={v.base} entries={cash} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {notice && <Alert tone="info">{notice}</Alert>}
          {v.fxMissing.length > 0 && (
            <Alert tone="info">Exchange rates for {v.fxMissing.join(", ")} are unavailable right now, so those amounts aren&apos;t converted yet.</Alert>
          )}
          <SummaryCards v={v} />
          <div className="flex justify-end">
            <RefreshPrices asOf={asOf} />
          </div>
          {v.holdings.length > 0 ? (
            <HoldingsTable
              holdings={v.holdings}
              base={v.base}
              cashValue={v.cashValue}
              totalValue={v.totalValue}
              dayChange={v.dayChange}
              unrealizedPL={v.unrealizedPL}
            />
          ) : (
            <EmptyState title="All cash, no stocks yet.">Add a buy to see your holdings here.</EmptyState>
          )}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SectorTable sectors={v.sectors} base={v.base} />
            </div>
            <CashCard balances={v.cashByCurrency} total={v.cashValue} base={v.base} entries={cash} />
          </div>
        </div>
      )}
    </>
  );
}
