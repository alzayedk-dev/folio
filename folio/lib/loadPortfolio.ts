import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashEntry, SymbolLike, Txn } from "./portfolio";

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
  return { id: r.id, kind: r.kind, amount: Number(r.amount), currency: r.currency, entryDate: r.entry_date };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type TxnWithNotes = Txn & { notes: string | null };

/** Loads everything the calculation engine needs for the signed-in user (RLS limits rows to their own). */
export async function loadLedgerData(supabase: SupabaseClient) {
  const [{ data: txRows, error: txErr }, { data: cashRows, error: cashErr }, { data: profile }] = await Promise.all([
    supabase.from("transactions").select("*").order("trade_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("cash_entries").select("*").order("entry_date", { ascending: false }),
    supabase.from("profiles").select("display_name, base_currency, show_shariah").single(),
  ]);
  if (txErr || cashErr) throw new Error("load_failed");

  const txns: TxnWithNotes[] = (txRows ?? []).map((r) => ({ ...rowToTxn(r), notes: r.notes ?? null }));
  const cash = (cashRows ?? []).map(rowToCash);

  const tickers = [...new Set(txns.map((t) => t.ticker))];
  const symbols: Record<string, SymbolLike> = {};
  if (tickers.length) {
    const { data: symRows } = await supabase.from("symbols").select("ticker, name, sector, currency, logo, exchange").in("ticker", tickers);
    for (const s of symRows ?? []) symbols[s.ticker] = s as SymbolLike;
  }

  return { txns, cash, symbols, baseCurrency: (profile?.base_currency as string) ?? "USD", showShariah: (profile?.show_shariah as boolean | undefined) ?? true };
}
