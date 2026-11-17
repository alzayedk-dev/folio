import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadValuation } from "./loadValuation";
import { loadPerformance } from "./loadPerformance";
import { buildSnapshot } from "./snapshot";

/**
 * Re-computes the signed-in user's percent-only public snapshot (or deletes it if they're private).
 * Runs with the user's own session, so row-level security applies.
 */
export async function refreshPublicSnapshot(supabase: SupabaseClient): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("is_public, display_name, bio, avatar_url").eq("id", user.id).single();

  if (!profile?.is_public) {
    await supabase.from("public_snapshots").delete().eq("user_id", user.id);
    return;
  }

  const [{ valuation }, perf] = await Promise.all([loadValuation(supabase), loadPerformance(supabase)]);
  const snap = buildSnapshot(valuation, perf.points, perf.today);
  await supabase.from("public_snapshots").upsert({
    user_id: user.id,
    display_name: profile.display_name,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    ...snap,
    updated_at: new Date().toISOString(),
  });
}

/** Refresh only if the user is public and the snapshot is older than `maxAgeMs` (or missing). */
export async function refreshPublicSnapshotIfStale(supabase: SupabaseClient, maxAgeMs = 6 * 3600e3): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("is_public").eq("id", user.id).single();
  if (!profile?.is_public) return;
  const { data: snap } = await supabase.from("public_snapshots").select("updated_at").eq("user_id", user.id).maybeSingle();
  if (snap && Date.now() - new Date(snap.updated_at).getTime() < maxAgeMs) return;
  await refreshPublicSnapshot(supabase);
}
