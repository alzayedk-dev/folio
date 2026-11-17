"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { messages } from "@/lib/messages";
import type { ActionResult } from "./transactions";

const UUID = /^[0-9a-f-]{36}$/i;

async function getUserClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function followPortfolio(portfolioId: string): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
  if (!UUID.test(portfolioId)) return { ok: false, error: messages.generic };
  const { error } = await supabase.from("follows").insert({ portfolio_id: portfolioId });
  // 23505 = already following (fine); cannot_follow = your own portfolio; RLS refusal = not public anymore
  if (error && error.code !== "23505") {
    if (error.message?.includes("cannot_follow")) return { ok: false, error: "You can't follow your own portfolio." };
    return { ok: false, error: "This portfolio isn't public anymore, so it can't be followed." };
  }
  revalidatePath(`/public/p/${portfolioId}`);
  revalidatePath("/public");
  return { ok: true };
}

export async function unfollowPortfolio(portfolioId: string): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
  if (!UUID.test(portfolioId)) return { ok: false, error: messages.generic };
  const { error } = await supabase.from("follows").delete().eq("portfolio_id", portfolioId);
  if (error) return { ok: false, error: messages.generic };
  revalidatePath(`/public/p/${portfolioId}`);
  revalidatePath("/public");
  return { ok: true };
}

/** Marks one alert (or all of the user's alerts) as read. RLS limits this to the user's own alerts. */
export async function markNotificationsRead(id?: string): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (id) {
    if (!UUID.test(id)) return { ok: false, error: messages.generic };
    q = q.eq("id", id);
  }
  const { error } = await q;
  if (error) return { ok: false, error: messages.generic };
  return { ok: true };
}
