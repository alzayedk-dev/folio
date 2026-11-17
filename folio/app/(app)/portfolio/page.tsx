import { PageHeader, EmptyState } from "@/components/PagePlaceholder";
import { messages } from "@/lib/messages";

export const metadata = { title: "Portfolio · Folio" };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader title="Portfolio" subtitle="Your holdings, cash and sector mix at a glance." />
      <EmptyState title={messages.emptyPortfolio}>Adding trades arrives in the next build step.</EmptyState>
    </>
  );
}
