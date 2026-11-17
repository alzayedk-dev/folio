import { PageHeader, EmptyState } from "@/components/PagePlaceholder";

export const metadata = { title: "Public portfolios · Folio" };

export default function PublicPage() {
  return (
    <>
      <PageHeader title="Public Portfolios" subtitle="See how other Folio investors allocate, in % only." />
      <EmptyState title="No one has opened their books yet." />
    </>
  );
}
