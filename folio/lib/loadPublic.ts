import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SnapshotHolding, SnapshotReturns, SnapshotSector } from "./snapshot";
import type { PortfolioKind } from "./portfolios";

export type PublicPortfolio = {
  portfolioId: string;
  portfolioName: string;
  portfolioKind: PortfolioKind;
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  holdings: SnapshotHolding[];
  sectors: SnapshotSector[];
  returns: SnapshotReturns;
  performance: { date: string; pct: number }[];
  holdingsCount: number;
  updatedAt: string;
};

const UUID = /^[0-9a-f-]{36}$/i;

/* eslint-disable @typescript-eslint/no-explicit-any */
function toPublic(r: any): PublicPortfolio {
  return {
    portfolioId: r.portfolio_id,
    portfolioName: r.portfolio_name ?? "Portfolio",
    portfolioKind: r.portfolio_kind === "paper" ? "paper" : "real",
    userId: r.user_id,
    displayName: r.display_name,
    bio: r.bio,
    avatarUrl: r.avatar_url,
    holdings: r.holdings ?? [],
    sectors: r.sectors ?? [],
    returns: r.returns ?? {},
    performance: r.performance ?? [],
    holdingsCount: r.holdings_count ?? 0,
    updatedAt: r.updated_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** All published portfolios the database lets this user see (row-level security filters private ones). */
export async function listPublic(supabase: SupabaseClient): Promise<PublicPortfolio[]> {
  const { data } = await supabase
    .from("public_snapshots")
    .select("portfolio_id, portfolio_name, portfolio_kind, user_id, display_name, bio, avatar_url, returns, holdings_count, sectors, updated_at")
    .limit(300);
  return (data ?? []).map(toPublic);
}

export async function getPublic(supabase: SupabaseClient, portfolioId: string): Promise<PublicPortfolio | null> {
  if (!UUID.test(portfolioId)) return null;
  const { data } = await supabase.from("public_snapshots").select("*").eq("portfolio_id", portfolioId).maybeSingle();
  return data ? toPublic(data) : null;
}

/** Old links were /public/<userId>: find that person's first published portfolio. */
export async function firstPublicPortfolioOf(supabase: SupabaseClient, userId: string): Promise<string | null> {
  if (!UUID.test(userId)) return null;
  const { data } = await supabase.from("public_snapshots").select("portfolio_id, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1);
  return data?.[0]?.portfolio_id ?? null;
}
