import { createClient } from "@/lib/supabase/server";
import { loadLedgerData } from "@/lib/loadPortfolio";
import { replayLedger } from "@/lib/portfolio";
import { toPositionSummary } from "@/lib/positionSummary";
import { PageHeader, EmptyState } from "@/components/PagePlaceholder";
import { AddTransactionButton } from "@/components/AddTransactionButton";
import { messages } from "@/lib/messages";
import { shares as fmtShares, price as fmtPrice } from "@/lib/format";

export const metadata = { title: "Portfolio · Folio" };

export default async function PortfolioPage() {
  const supabase = await createClient();
  const { txns, cash, symbols, baseCurrency } = await loadLedgerData(supabase);
  const ledger = replayLedger(txns, cash, { base: baseCurrency });
  const open = Object.values(ledger.positions).filter((p) => p.shares > 0);

  return (
    <>
      <PageHeader title="Portfolio" subtitle="Your holdings, cash and sector mix at a glance." action={<AddTransactionButton positions={toPositionSummary(ledger)} />} />
      {open.length === 0 ? (
        <EmptyState title={messages.emptyPortfolio}>Click “Add transaction” to record your first buy.</EmptyState>
      ) : (
        // Temporary list; the full holdings table arrives in Task 8
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {open.map((p) => (
            <li key={p.ticker} className="flex items-center justify-between px-5 py-3">
              <span>
                <span className="block font-semibold">{p.ticker}</span>
                <span className="block text-sm text-muted">{symbols[p.ticker]?.name}</span>
              </span>
              <span className="text-right text-sm tabular">
                {fmtShares(p.shares)} shares · avg {fmtPrice(p.avgCost, p.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
