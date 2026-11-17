import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadValuation } from "./loadValuation";
import { loadPerformance } from "./loadPerformance";
import { buildSnapshot } from "./snapshot";

/**
 * Re-computes one portfolio's percent-only public snapshot (or deletes it if that portfolio is private).
 * Runs with the user's own session, so row-level security applies. Takes an explicit portfolio id because
 * it often runs after the response (where the switcher cookie can't be read).
 */
export async function refreshPublicSnapshot(supabase: SupabaseClient, portfolioId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const [{ data: pf }, { data: profile }] = await Promise.all([
    supabase.from("portfolios").select("id, name, kind, is_public").eq("id", portfolioId).eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("display_name, bio, avatar_url").eq("id", user.id).single(),
  ]);
  if (!pf) return;
  if (!pf.is_public || !profile) {
    await supabase.from("public_snapshots").delete().eq("portfolio_id", portfolioId);
    return;
  }

  const [{ valuation }, perf] = await Promise.all([loadValuation(supabase, portfolioId), loadPerformance(supabase, portfolioId)]);
  const snap = buildSnapshot(valuation, perf.points, perf.today);
  await supabase.from("public_snapshots").upsert(
    {
      portfolio_id: portfolioId,
      user_id: user.id,
      portfolio_name: pf.name,
      portfolio_kind: pf.kind,
      display_name: profile.display_name,
      bio: profile.bio,
      avatar_url: profile.avatar_url,
      ...snap,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "portfolio_id" },
  );
}

/** Refresh only if that portfolio is public and its snapshot is older than `maxAgeMs` (or missing). */
export async function refreshPublicSnapshotIfStale(supabase: SupabaseClient, portfolioId: string, maxAgeMs = 6 * 3600e3): Promise<void> {
  const { data: pf } = await supabase.from("portfolios").select("is_public").eq("id", portfolioId).maybeSingle();
  if (!pf?.is_public) return;
  const { data: snap } = await supabase.from("public_snapshots").select("updated_at").eq("portfolio_id", portfolioId).maybeSingle();
  if (snap && Date.now() - new Date(snap.updated_at).getTime() < maxAgeMs) return;
  await refreshPublicSnapshot(supabase, portfolioId);
}

/** Profile details (name, bio, picture) are copied into every published snapshot: refresh them all. */
export async function refreshAllPublicSnapshots(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data } = await supabase.from("portfolios").select("id").eq("user_id", userId).eq("is_public", true);
  for (const p of data ?? []) await refreshPublicSnapshot(supabase, p.id);
}
