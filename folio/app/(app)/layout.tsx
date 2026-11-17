import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single();

  return (
    <AppShell displayName={profile?.display_name ?? "Investor"} avatarUrl={profile?.avatar_url ?? null}>
      {children}
    </AppShell>
  );
}
