"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { refreshPublicSnapshot } from "@/lib/publicSnapshot";
import { createClient } from "@/lib/supabase/server";
import { transactionSchema, type TransactionInput } from "@/lib/validation";
import { replayLedger, type Txn } from "@/lib/portfolio";
import { rowToTxn } from "@/lib/loadPortfolio";
import { messages } from "@/lib/messages";
import { customFineOz, findCoin, isMetal, METALS } from "@/lib/metals";
import { txnMessages } from "@/lib/validation";
import { getCurrentPortfolio } from "@/lib/currentPortfolio";
import { portfolioMessages } from "@/lib/portfolios";

export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

const PATHS = ["/portfolio", "/transactions", "/performance"];
function refresh(supabase: Awaited<ReturnType<typeof createClient>>, portfolioId: string) {
  PATHS.forEach((p) => revalidatePath(p));
  // keep the public % snapshot current (no-op for private portfolios); runs after the response is sent
  after(() => refreshPublicSnapshot(supabase, portfolioId).catch(() => undefined));
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
  portfolioId: string,
  ticker: string,
  change: (txns: Txn[]) => Txn[],
): Promise<string | null> {
  const { data } = await supabase.from("transactions").select("*").eq("ticker", ticker).eq("portfolio_id", portfolioId);
  const txns = change((data ?? []).map(rowToTxn));
  const ledger = replayLedger(txns, []);
  if (!ledger.problems.some((p) => p.code === "oversell" && p.ticker === ticker)) return null;
  return isMetal(ticker) ? "You can't sell more metal than you own." : messages.oversell;
}

/**
 * Gold/silver details: works out the pure troy ounces for coins (so the stored weight always matches the coin)
 * and returns the columns to save. Stocks get empty details.
 */
function metalDetails(v: TransactionInput): { error?: ActionResult; shares?: number | null; price?: number | null; cols: Record<string, unknown> } {
  const empty = { metal_form: null, coin_code: null, coin_count: null, coin_grams: null, purity: null };
  if (!isMetal(v.ticker) || v.type === "dividend" || !v.metalForm) return { cols: empty };
  const metalKey = METALS[v.ticker].key;
  const paid = (v.shares ?? 0) * (v.price ?? 0); // client sent pure oz × price per pure oz
  if (v.metalForm === "coin") {
    const coin = findCoin(v.coinCode);
    if (!coin || coin.metal !== metalKey) return { error: { ok: false, error: txnMessages.coin, field: "coinCode" }, cols: empty };
    const fine = v.coinCount! * coin.fineOz;
    return { shares: fine, price: fine > 0 ? paid / fine : v.price, cols: { metal_form: "coin", coin_code: coin.code, coin_count: v.coinCount, coin_grams: null, purity: coin.purity } };
  }
  if (v.metalForm === "custom") {
    const fine = customFineOz(v.coinCount!, v.coinGrams!, v.purity!);
    return { shares: fine, price: fine > 0 ? paid / fine : v.price, cols: { metal_form: "custom", coin_code: null, coin_count: v.coinCount, coin_grams: v.coinGrams, purity: v.purity } };
  }
  return { shares: v.shares, price: v.price, cols: { metal_form: "bar", coin_code: null, coin_count: null, coin_grams: null, purity: v.purity } };
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
  const portfolio = await getCurrentPortfolio();
  if (!portfolio) return { ok: false, error: portfolioMessages.gone };

  // The stock must be known (the pop-up looks it up first, which saves its name, currency and sector)
  const { data: sym } = await supabase.from("symbols").select("ticker, currency").eq("ticker", v.ticker).maybeSingle();
  if (!sym) return { ok: false, error: messages.unknownTicker, field: "ticker" };

  const md = metalDetails(v);
  if (md.error) return md.error;
  if (md.shares !== undefined) v.shares = md.shares;
  if (md.price !== undefined) v.price = md.price;
  const row = {
    portfolio_id: portfolio.id,
    ticker: v.ticker,
    type: v.type,
    shares: v.type === "dividend" ? null : v.shares,
    price: v.type === "dividend" ? null : v.price,
    ...md.cols,
    amount: v.type === "dividend" ? v.amount : null,
    fees: v.fees,
    currency: sym.currency,
    trade_date: v.tradeDate,
    notes: v.notes || null,
  };

  if (v.type === "sell") {
    const draft: Txn = { id: "new", ticker: v.ticker, type: "sell", shares: v.shares, price: v.price, amount: null, fees: v.fees, currency: sym.currency, tradeDate: v.tradeDate, createdAt: new Date().toISOString() };
    const problem = await oversellMessage(supabase, portfolio.id, v.ticker, (txns) => [...txns, draft]);
    if (problem) return { ok: false, error: problem, field: "shares" };
  }

  const { error } = await supabase.from("transactions").insert(row);
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase, portfolio.id);
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
  const md = metalDetails(v);
  if (md.error) return md.error;
  if (md.shares !== undefined) v.shares = md.shares;
  if (md.price !== undefined) v.price = md.price;

  const updated: Txn = { ...rowToTxn(existing), type: v.type, shares: v.type === "dividend" ? null : v.shares, price: v.type === "dividend" ? null : v.price, amount: v.type === "dividend" ? v.amount : null, fees: v.fees, tradeDate: v.tradeDate };
  const problem = await oversellMessage(supabase, existing.portfolio_id, v.ticker, (txns) => txns.map((t) => (t.id === id ? updated : t)));
  if (problem) return { ok: false, error: problem, field: "shares" };

  const { error } = await supabase
    .from("transactions")
    .update({ type: updated.type, shares: updated.shares, price: updated.price, amount: updated.amount, fees: updated.fees, trade_date: updated.tradeDate, notes: v.notes || null, ...md.cols })
    .eq("id", id);
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase, existing.portfolio_id);
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };

  const { data: existing } = await supabase.from("transactions").select("ticker, portfolio_id").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "That trade isn't on your books anymore." };

  // Deleting a buy could leave a later sell with shares that were never owned
  const problem = await oversellMessage(supabase, existing.portfolio_id, existing.ticker, (txns) => txns.filter((t) => t.id !== id));
  if (problem) return { ok: false, error: "Deleting this buy would leave a later sell without enough shares. Delete or edit that sell first." };

  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase, existing.portfolio_id);
  return { ok: true };
}
