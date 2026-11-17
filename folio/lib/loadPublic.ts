import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SnapshotHolding, SnapshotReturns, SnapshotSector } from "./snapshot";

export type PublicPortfolio = {
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function toPublic(r: any): PublicPortfolio {
  return {
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
    .select("user_id, display_name, bio, avatar_url, returns, holdings_count, sectors, updated_at")
    .limit(200);
  return (data ?? []).map(toPublic);
}

export async function getPublic(supabase: SupabaseClient, userId: string): Promise<PublicPortfolio | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const { data } = await supabase.from("public_snapshots").select("*").eq("user_id", userId).maybeSingle();
  return data ? toPublic(data) : null;
}
