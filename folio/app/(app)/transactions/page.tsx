import { createClient } from "@/lib/supabase/server";
import { loadLedgerData } from "@/lib/loadPortfolio";
import { replayLedger } from "@/lib/portfolio";
import { toPositionSummary } from "@/lib/positionSummary";
import { PageHeader, EmptyState } from "@/components/PagePlaceholder";
import { AddTransactionButton } from "@/components/AddTransactionButton";

export const metadata = { title: "Transactions · Folio" };

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { txns, cash, baseCurrency } = await loadLedgerData(supabase);
  const ledger = replayLedger(txns, cash, { base: baseCurrency });

  return (
    <>
      <PageHeader title="Transactions" subtitle="Every buy, sell and dividend you've recorded." action={<AddTransactionButton positions={toPositionSummary(ledger)} />} />
      {txns.length === 0 ? (
        <EmptyState title="No trades on the books yet." />
      ) : (
        <EmptyState title={`${txns.length} trade${txns.length === 1 ? "" : "s"} recorded.`}>The full transactions list arrives in Task 10.</EmptyState>
      )}
    </>
  );
}
