import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadLedgerData } from "@/lib/loadPortfolio";
import { replayLedger } from "@/lib/portfolio";
import { toPositionSummary } from "@/lib/positionSummary";
import { PageHeader, EmptyState } from "@/components/PagePlaceholder";
import { AddTransactionButton } from "@/components/AddTransactionButton";
import { TransactionList, type TxnRow } from "@/components/TransactionList";
import { Skeleton } from "@/components/Skeleton";
import { messages } from "@/lib/messages";

export const metadata = { title: "Transactions · Folio" };

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label={messages.loading} className="space-y-4">
          <p className="text-sm text-muted">{messages.loading}</p>
          <Skeleton className="h-80" />
        </div>
      }
    >
      <TransactionsContent />
    </Suspense>
  );
}

async function TransactionsContent() {
  const supabase = await createClient();
  const { txns, cash, symbols, baseCurrency } = await loadLedgerData(supabase);
  const ledger = replayLedger(txns, cash, { base: baseCurrency });
  const sells = new Map(ledger.sells.map((s) => [s.txnId, s]));

  // newest first (loadLedgerData already orders by trade date, then entry time)
  const rows: TxnRow[] = txns.map((t) => {
    const sale = sells.get(t.id);
    const total =
      t.type === "buy" ? (t.shares ?? 0) * (t.price ?? 0) + t.fees : t.type === "sell" ? sale?.proceeds ?? 0 : (t.amount ?? 0) - t.fees;
    return {
      id: t.id,
      ticker: t.ticker,
      name: symbols[t.ticker]?.name ?? t.ticker,
      type: t.type,
      shares: t.shares,
      price: t.price,
      amount: t.amount,
      fees: t.fees,
      currency: t.currency,
      tradeDate: t.tradeDate,
      notes: t.notes,
      proceeds: sale?.proceeds ?? null,
      realizedPL: sale?.realizedPL ?? null,
      total,
    };
  });

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every buy, sell and dividend you've recorded."
        action={<AddTransactionButton positions={toPositionSummary(ledger)} />}
      />
      {rows.length === 0 ? (
        <EmptyState title="No trades on the books yet.">Click “Add transaction” to record your first buy.</EmptyState>
      ) : (
        <TransactionList rows={rows} positions={toPositionSummary(ledger)} />
      )}
    </>
  );
}
