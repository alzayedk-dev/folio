import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashEntry, SymbolLike, Txn } from "./portfolio";
import type { MetalForm } from "./metals";
import { getCurrentPortfolio } from "./currentPortfolio";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToTxn(r: any): Txn {
  return {
    id: r.id,
    ticker: r.ticker,
    type: r.type,
    shares: r.shares == null ? null : Number(r.shares),
    price: r.price == null ? null : Number(r.price),
    amount: r.amount == null ? null : Number(r.amount),
    fees: Number(r.fees ?? 0),
    currency: r.currency,
    tradeDate: r.trade_date,
    createdAt: r.created_at,
  };
}

export function rowToCash(r: any): CashEntry {
  return { id: r.id, kind: r.kind, amount: Number(r.amount), currency: r.currency, entryDate: r.entry_date, txnId: r.txn_id ?? null, createdAt: r.created_at };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** How a gold/silver trade was entered (display only; shares are pure troy oz). */
export type MetalDetails = { metalForm: MetalForm | null; coinCode: string | null; coinCount: number | null; coinGrams: number | null; purity: number | null };
export type TxnWithNotes = Txn & { notes: string | null } & MetalDetails;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToMetalDetails(r: any): MetalDetails {
  return {
    metalForm: r.metal_form ?? null,
    coinCode: r.coin_code ?? null,
    coinCount: r.coin_count == null ? null : Number(r.coin_count),
    coinGrams: r.coin_grams == null ? null : Number(r.coin_grams),
    purity: r.purity == null ? null : Number(r.purity),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Loads everything the calculation engine needs for one of the signed-in user's portfolios
 * (RLS limits rows to their own). `portfolioId`: a specific portfolio, "all" (every portfolio, e.g. for
 * earnings reminders), or omitted for the one chosen in the switcher.
 */
export async function loadLedgerData(supabase: SupabaseClient, portfolioId?: string) {
  const pid = portfolioId ?? (await getCurrentPortfolio())?.id ?? "none";
  let txQ = supabase.from("transactions").select("*");
  let cashQ = supabase.from("cash_entries").select("*");
  if (pid !== "all") {
    txQ = txQ.eq("portfolio_id", pid);
    cashQ = cashQ.eq("portfolio_id", pid);
  }
  const [{ data: txRows, error: txErr }, { data: cashRows, error: cashErr }, { data: profile }] = await Promise.all([
    txQ.order("trade_date", { ascending: false }).order("created_at", { ascending: false }),
    cashQ.order("entry_date", { ascending: false }),
    supabase.from("profiles").select("display_name, base_currency, show_shariah").single(),
  ]);
  if (txErr || cashErr) throw new Error("load_failed");

  const txns: TxnWithNotes[] = (txRows ?? []).map((r) => ({ ...rowToTxn(r), notes: r.notes ?? null, ...rowToMetalDetails(r) }));
  const cash = (cashRows ?? []).map(rowToCash);

  const tickers = [...new Set(txns.map((t) => t.ticker))];
  const symbols: Record<string, SymbolLike> = {};
  if (tickers.length) {
    const { data: symRows } = await supabase.from("symbols").select("ticker, name, sector, currency, logo, exchange").in("ticker", tickers);
    for (const s of symRows ?? []) symbols[s.ticker] = s as SymbolLike;
  }

  return { portfolioId: pid, txns, cash, symbols, baseCurrency: (profile?.base_currency as string) ?? "USD", showShariah: (profile?.show_shariah as boolean | undefined) ?? true };
}
