"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cashBalanceSchema, cashMessages } from "@/lib/validation";
import { messages } from "@/lib/messages";
import type { ActionResult } from "./transactions";
import { after } from "next/server";
import { refreshPublicSnapshot } from "@/lib/publicSnapshot";
import { getCurrentPortfolio } from "@/lib/currentPortfolio";
import { portfolioMessages } from "@/lib/portfolios";

function refresh(supabase: Awaited<ReturnType<typeof createClient>>, portfolioId: string) {
  ["/portfolio", "/performance"].forEach((p) => revalidatePath(p));
  after(() => refreshPublicSnapshot(supabase, portfolioId).catch(() => undefined));
}

/** "This is how much cash I have": records a balance check-point (replaces earlier balances from that date). */
export async function setCashBalance(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };

  const parsed = cashBalanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? messages.generic, field: issue?.path?.[0]?.toString() };
  }
  const v = parsed.data;
  const portfolio = await getCurrentPortfolio();
  if (!portfolio) return { ok: false, error: portfolioMessages.gone };
  const { error } = await supabase.from("cash_entries").insert({
    portfolio_id: portfolio.id,
    kind: "balance",
    amount: v.amount,
    currency: v.currency,
    entry_date: v.entryDate,
    note: v.note || "Balance update",
  });
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase, portfolio.id);
  return { ok: true };
}

/** "I added money": a deposit on top of the current cash (not counted as a gain in performance). */
export async function addCashDeposit(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };

  const parsed = cashBalanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.path?.[0] === "amount" ? cashMessages.added : issue?.message ?? messages.generic, field: issue?.path?.[0]?.toString() };
  }
  const v = parsed.data;
  if (!(v.amount > 0)) return { ok: false, error: cashMessages.added, field: "amount" };
  const portfolio = await getCurrentPortfolio();
  if (!portfolio) return { ok: false, error: portfolioMessages.gone };
  const { error } = await supabase.from("cash_entries").insert({
    portfolio_id: portfolio.id,
    kind: "deposit",
    amount: v.amount,
    currency: v.currency,
    entry_date: v.entryDate,
    note: v.note || "Money added",
  });
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase, portfolio.id);
  return { ok: true };
}

export async function deleteCashEntry(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
  // RLS guarantees users can only delete their own rows; .select() tells us whether anything was deleted
  const { data, error } = await supabase.from("cash_entries").delete().eq("id", id).select("id, portfolio_id");
  if (error || !data?.length) return { ok: false, error: "That cash entry isn't on your books anymore." };
  refresh(supabase, data[0].portfolio_id);
  return { ok: true };
}
