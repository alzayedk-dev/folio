import { PageHeader, EmptyState } from "@/components/PagePlaceholder";

export const metadata = { title: "Performance · Folio" };

export default function PerformancePage() {
  return (
    <>
      <PageHeader title="Performance" subtitle="How your portfolio has grown since day one." />
      <EmptyState title="Your performance chart will appear after your first trade." />
    </>
  );
}
