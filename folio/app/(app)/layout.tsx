import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { getCurrentPortfolio, getMyPortfolios } from "@/lib/currentPortfolio";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { list }, current] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, base_currency").eq("id", user.id).single(),
    getMyPortfolios(),
    getCurrentPortfolio(),
  ]);

  return (
    <AppShell
      displayName={profile?.display_name ?? "Investor"}
      avatarUrl={profile?.avatar_url ?? null}
      portfolios={list}
      currentPortfolioId={current?.id ?? null}
      baseCurrency={profile?.base_currency ?? "USD"}
    >
      {children}
    </AppShell>
  );
}
