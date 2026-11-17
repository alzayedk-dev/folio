import { PageHeader, EmptyState } from "@/components/PagePlaceholder";

export const metadata = { title: "Settings · Folio" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Profile, currency and alerts." />
      <EmptyState title="Settings arrive in a later build step." />
    </>
  );
}
