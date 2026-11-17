import { PageHeader, EmptyState } from "@/components/PagePlaceholder";

export const metadata = { title: "Transactions · Folio" };

export default function TransactionsPage() {
  return (
    <>
      <PageHeader title="Transactions" subtitle="Every buy, sell and dividend you've recorded." />
      <EmptyState title="No trades on the books yet." />
    </>
  );
}
