import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient, getSessionUser } from "./supabase/server";
import { PORTFOLIO_COOKIE, pickPortfolio, sortPortfolios, type Portfolio } from "./portfolios";

/**
 * The signed-in user's own portfolios (others' published ones are readable too, so always filter by user).
 * Cached per request. Creates "My Portfolio" if somehow none exist.
 */
export const getMyPortfolios = cache(async (): Promise<{ userId: string | null; list: Portfolio[] }> => {
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()]);
  if (!user) return { userId: null, list: [] };
  const cols = "id, name, kind, is_public, position, created_at";
  const { data } = await supabase.from("portfolios").select(cols).eq("user_id", user.id);
  let list = sortPortfolios((data ?? []) as Portfolio[]);
  if (!list.length) {
    const { data: created } = await supabase.from("portfolios").insert({ name: "My Portfolio", kind: "real" }).select(cols).single();
    if (created) list = [created as Portfolio];
  }
  return { userId: user.id, list };
});

/** The portfolio the user is looking at (saved in a cookie by the switcher). */
export const getCurrentPortfolio = cache(async (): Promise<Portfolio | null> => {
  const { list } = await getMyPortfolios();
  const wanted = (await cookies()).get(PORTFOLIO_COOKIE)?.value;
  return pickPortfolio(list, wanted);
});
