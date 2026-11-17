import { PageHeader, EmptyState } from "@/components/PagePlaceholder";

export const metadata = { title: "AI · Folio" };

export default function AIPage() {
  return (
    <>
      <PageHeader title="AI Analyst" subtitle="Ask about stocks, sectors and markets. Folio's AI explains, it doesn't advise." />
      <EmptyState title="Your analyst is setting up their desk." />
    </>
  );
}
