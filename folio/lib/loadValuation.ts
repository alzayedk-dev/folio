import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLedgerData } from "./loadPortfolio";
import { market, MarketError, type FxTable, type Quote } from "./market";
import { replayLedger, valuePortfolio } from "./portfolio";
import { messages } from "./messages";

/**
 * Everything the Portfolio page needs: the user's trades and cash, live prices and exchange rates,
 * run through the calculation engine. Market problems never break the page: we fall back to
 * average cost and return a friendly notice instead.
 */
export async function loadValuation(supabase: SupabaseClient) {
  const data = await loadLedgerData(supabase);
  const { txns, cash, symbols, baseCurrency } = data;

  // Which stocks are still held (no need to price closed positions)
  const preliminary = replayLedger(txns, cash, { base: baseCurrency });
  const openTickers = Object.values(preliminary.positions)
    .filter((p) => p.shares > 0)
    .map((p) => p.ticker);
  const currencies = new Set([baseCurrency, ...txns.map((t) => t.currency), ...cash.map((c) => c.currency)]);
  const needFx = currencies.size > 1;

  let quotes: Record<string, Quote> = {};
  let fx: FxTable | null = null;
  let notice: string | null = null;

  const [qRes, fxRes] = await Promise.allSettled([
    openTickers.length ? market.quotes(supabase, openTickers) : Promise.resolve({ quotes: {}, missing: [] as string[] }),
    needFx ? market.fx(supabase) : Promise.resolve(null),
  ]);

  if (qRes.status === "fulfilled") {
    quotes = qRes.value.quotes;
    const stale = Object.values(quotes).filter((q) => q.stale);
    if (qRes.value.missing.length || stale.length) notice = messages.marketSlow();
  } else {
    notice = qRes.reason instanceof MarketError ? qRes.reason.friendly : messages.marketSlow();
  }
  if (fxRes.status === "fulfilled") fx = fxRes.value;
  else if (needFx) notice = notice ?? messages.marketSlow();

  // Replay again with exchange rates so cash in other currencies is used correctly
  const ledger = replayLedger(txns, cash, { base: baseCurrency, fx });
  const valuation = valuePortfolio(ledger, quotes, symbols, fx, baseCurrency);

  const asOf = Object.values(quotes)
    .map((q) => q.asOf)
    .sort()
    .at(-1) ?? null;

  return { ...data, ledger, valuation, notice, asOf };
}
