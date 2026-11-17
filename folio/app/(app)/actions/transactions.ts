"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { refreshPublicSnapshot } from "@/lib/publicSnapshot";
import { createClient } from "@/lib/supabase/server";
import { transactionSchema } from "@/lib/validation";
import { replayLedger, type Txn } from "@/lib/portfolio";
import { rowToTxn } from "@/lib/loadPortfolio";
import { messages } from "@/lib/messages";
import { isMetal } from "@/lib/metals";

export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

const PATHS = ["/portfolio", "/transactions", "/performance"];
function refresh(supabase?: Awaited<ReturnType<typeof createClient>>) {
  PATHS.forEach((p) => revalidatePath(p));
  // keep the public % snapshot current (no-op for private users); runs after the response is sent
  if (supabase) after(() => refreshPublicSnapshot(supabase).catch(() => undefined));
}

async function getUserClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Re-plays all of this stock's trades with the change applied and makes sure no sell exceeds the shares owned at that time. */
async function oversellMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
  change: (txns: Txn[]) => Txn[],
): Promise<string | null> {
  const { data } = await supabase.from("transactions").select("*").eq("ticker", ticker);
  const txns = change((data ?? []).map(rowToTxn));
  const ledger = replayLedger(txns, []);
  if (!ledger.problems.some((p) => p.code === "oversell" && p.ticker === ticker)) return null;
  return isMetal(ticker) ? "You can't sell more metal than you own." : messages.oversell;
}

function parse(formData: FormData) {
  const parsed = transactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: { ok: false as const, error: issue?.message ?? messages.generic, field: issue?.path?.[0]?.toString() } };
  }
  return { value: parsed.data };
}

export async function createTransaction(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
  const p = parse(formData);
  if (p.error) return p.error;
  const v = p.value!;

  // The stock must be known (the pop-up looks it up first, which saves its name, currency and sector)
  const { data: sym } = await supabase.from("symbols").select("ticker, currency").eq("ticker", v.ticker).maybeSingle();
  if (!sym) return { ok: false, error: messages.unknownTicker, field: "ticker" };

  const row = {
    ticker: v.ticker,
    type: v.type,
    shares: v.type === "dividend" ? null : v.shares,
    price: v.type === "dividend" ? null : v.price,
    amount: v.type === "dividend" ? v.amount : null,
    fees: v.fees,
    currency: sym.currency,
    trade_date: v.tradeDate,
    notes: v.notes || null,
  };

  if (v.type === "sell") {
    const draft: Txn = { id: "new", ticker: v.ticker, type: "sell", shares: v.shares, price: v.price, amount: null, fees: v.fees, currency: sym.currency, tradeDate: v.tradeDate, createdAt: new Date().toISOString() };
    const problem = await oversellMessage(supabase, v.ticker, (txns) => [...txns, draft]);
    if (problem) return { ok: false, error: problem, field: "shares" };
  }

  const { error } = await supabase.from("transactions").insert(row);
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase);
  return { ok: true };
}

export async function updateTransaction(id: string, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
  const p = parse(formData);
  if (p.error) return p.error;
  const v = p.value!;

  const { data: existing } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "That trade isn't on your books anymore." };
  if (existing.ticker !== v.ticker) return { ok: false, error: "To change the stock, delete this trade and add a new one.", field: "ticker" };

  const updated: Txn = { ...rowToTxn(existing), type: v.type, shares: v.type === "dividend" ? null : v.shares, price: v.type === "dividend" ? null : v.price, amount: v.type === "dividend" ? v.amount : null, fees: v.fees, tradeDate: v.tradeDate };
  const problem = await oversellMessage(supabase, v.ticker, (txns) => txns.map((t) => (t.id === id ? updated : t)));
  if (problem) return { ok: false, error: problem, field: "shares" };

  const { error } = await supabase
    .from("transactions")
    .update({ type: updated.type, shares: updated.shares, price: updated.price, amount: updated.amount, fees: updated.fees, trade_date: updated.tradeDate, notes: v.notes || null })
    .eq("id", id);
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase);
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };

  const { data: existing } = await supabase.from("transactions").select("ticker").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "That trade isn't on your books anymore." };

  // Deleting a buy could leave a later sell with shares that were never owned
  const problem = await oversellMessage(supabase, existing.ticker, (txns) => txns.filter((t) => t.id !== id));
  if (problem) return { ok: false, error: "Deleting this buy would leave a later sell without enough shares. Delete or edit that sell first." };

  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase);
  return { ok: true };
}
