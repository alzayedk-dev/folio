import { PageHeader, EmptyState } from "@/components/PagePlaceholder";

export const metadata = { title: "Reminders · Folio" };

export default function RemindersPage() {
  return (
    <>
      <PageHeader title="Reminders" subtitle="Upcoming earnings for the stocks you hold." />
      <EmptyState title="No earnings on the calendar yet." />
    </>
  );
}
