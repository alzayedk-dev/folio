"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshPublicSnapshot } from "@/lib/publicSnapshot";
import { messages } from "@/lib/messages";
import { MAX_PORTFOLIOS, PORTFOLIO_COOKIE, newPortfolioSchema, portfolioMessages, renamePortfolioSchema, sameName, sortPortfolios, type Portfolio } from "@/lib/portfolios";
import type { ActionResult } from "./transactions";

const UUID = /^[0-9a-f-]{36}$/i;
const SESSION = "Your session has expired. Please log in again.";

async function mine() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, list: [] as Portfolio[] };
  const { data } = await supabase.from("portfolios").select("id, name, kind, is_public, position, created_at").eq("user_id", user.id);
  return { supabase, user, list: sortPortfolios((data ?? []) as Portfolio[]) };
}

async function choose(id: string) {
  (await cookies()).set(PORTFOLIO_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
}

function refreshAll() {
  revalidatePath("/", "layout");
}

/** Switches the portfolio shown on every tab. */
export async function selectPortfolio(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: messages.generic };
  const { user, list } = await mine();
  if (!user) return { ok: false, error: SESSION };
  if (!list.some((p) => p.id === id)) return { ok: false, error: portfolioMessages.gone };
  await choose(id);
  refreshAll();
  return { ok: true };
}

export async function createPortfolio(formData: FormData): Promise<ActionResult & { id?: string }> {
  const { supabase, user, list } = await mine();
  if (!user) return { ok: false, error: SESSION };
  const parsed = newPortfolioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? messages.generic, field: issue?.path?.[0]?.toString() };
  }
  const v = parsed.data;
  if (list.length >= MAX_PORTFOLIOS) return { ok: false, error: portfolioMessages.limit };
  if (list.some((p) => sameName(p.name, v.name))) return { ok: false, error: portfolioMessages.duplicate, field: "name" };

  const position = list.reduce((m, p) => Math.max(m, p.position), 0) + 1;
  const { data, error } = await supabase.from("portfolios").insert({ name: v.name, kind: v.kind, position }).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: portfolioMessages.duplicate, field: "name" };
    if (error?.message?.includes("portfolio_limit")) return { ok: false, error: portfolioMessages.limit };
    return { ok: false, error: messages.generic };
  }
  if (v.startingCash > 0) {
    await supabase.from("cash_entries").insert({ portfolio_id: data.id, kind: "starting", amount: v.startingCash, currency: v.currency, note: "Starting cash" });
  }
  await choose(data.id);
  refreshAll();
  return { ok: true, id: data.id };
}

export async function renamePortfolio(id: string, formData: FormData): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: messages.generic };
  const { supabase, user, list } = await mine();
  if (!user) return { ok: false, error: SESSION };
  const target = list.find((p) => p.id === id);
  if (!target) return { ok: false, error: portfolioMessages.gone };
  const parsed = renamePortfolioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.generic, field: "name" };
  const name = parsed.data.name;
  if (list.some((p) => p.id !== id && sameName(p.name, name))) return { ok: false, error: portfolioMessages.duplicate, field: "name" };
  const { error } = await supabase.from("portfolios").update({ name }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? portfolioMessages.duplicate : messages.generic, field: "name" };
  if (target.is_public) after(() => refreshPublicSnapshot(supabase, id).catch(() => undefined));
  refreshAll();
  return { ok: true };
}

/** Publish or unpublish one portfolio. Publishing needs a bio so followers know the approach. */
export async function setPortfolioPublic(id: string, isPublic: boolean): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: messages.generic };
  const { supabase, user, list } = await mine();
  if (!user) return { ok: false, error: SESSION };
  if (!list.some((p) => p.id === id)) return { ok: false, error: portfolioMessages.gone };
  if (isPublic) {
    const { data: profile } = await supabase.from("profiles").select("bio").eq("id", user.id).single();
    if (!profile?.bio || profile.bio.trim().length < 10) return { ok: false, error: portfolioMessages.bioNeeded };
  }
  const { error } = await supabase.from("portfolios").update({ is_public: isPublic }).eq("id", id);
  if (error) return { ok: false, error: messages.generic };
  if (isPublic) await refreshPublicSnapshot(supabase, id).catch(() => undefined);
  else await supabase.from("public_snapshots").delete().eq("portfolio_id", id);
  refreshAll();
  return { ok: true };
}

/** Deletes a portfolio and all its trades and cash. The name must be typed to confirm; the last one stays. */
export async function deletePortfolio(id: string, confirmName: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: messages.generic };
  const { supabase, user, list } = await mine();
  if (!user) return { ok: false, error: SESSION };
  const target = list.find((p) => p.id === id);
  if (!target) return { ok: false, error: portfolioMessages.gone };
  if (list.length <= 1) return { ok: false, error: portfolioMessages.lastOne };
  if (typeof confirmName !== "string" || confirmName.trim() !== target.name.trim()) return { ok: false, error: portfolioMessages.confirmName, field: "confirm" };
  const { error } = await supabase.from("portfolios").delete().eq("id", id);
  if (error) return { ok: false, error: messages.generic };
  const store = await cookies();
  if (store.get(PORTFOLIO_COOKIE)?.value === id || !store.get(PORTFOLIO_COOKIE)) await choose(list.find((p) => p.id !== id)!.id);
  refreshAll();
  return { ok: true };
}
