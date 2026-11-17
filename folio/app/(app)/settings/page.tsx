import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PagePlaceholder";
import { SettingsForm } from "@/components/SettingsForm";

export const metadata = { title: "Settings · Folio" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const { data: p } = await supabase
    .from("profiles")
    .select("display_name, full_name, bio, avatar_url, base_currency, notify_inapp, notify_email, notify_push, is_public, show_shariah, reminder_first, reminder_second")
    .eq("id", user.id)
    .single();

  return (
    <>
      <PageHeader title="Settings" subtitle="Profile, currency, alerts and privacy." />
      <SettingsForm
        profile={{
          userId: user.id,
          email: user.email ?? "",
          displayName: p?.display_name ?? "",
          fullName: p?.full_name ?? "",
          bio: p?.bio ?? "",
          avatarUrl: p?.avatar_url ?? null,
          baseCurrency: p?.base_currency ?? "USD",
          notifyInapp: p?.notify_inapp ?? true,
          notifyEmail: p?.notify_email ?? true,
          notifyPush: p?.notify_push ?? false,
          isPublic: p?.is_public ?? false,
          showShariah: p?.show_shariah ?? true,
          reminderFirst: p?.reminder_first ?? 7,
          reminderSecond: p ? p.reminder_second : 1,
        }}
      />
    </>
  );
}
