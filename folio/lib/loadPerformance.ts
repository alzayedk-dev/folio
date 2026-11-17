import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLedgerData } from "./loadPortfolio";
import { market, type FxTable, type PricePoint } from "./market";
import { buildDailySeries, type DailyPoint } from "./performance";
import { messages } from "./messages";

export const BENCHMARKS = [
  { key: "SPY", label: "S&P 500" },
  { key: "QQQ", label: "Nasdaq 100" },
  { key: "DIA", label: "Dow Jones" },
] as const;
export type BenchmarkKey = (typeof BENCHMARKS)[number]["key"];

/**
 * Loads everything the Performance tab needs and builds the daily value series on the server.
 * Market problems degrade gracefully: missing history falls back to trade prices, with a notice.
 */
export async function loadPerformance(supabase: SupabaseClient): Promise<{
  points: DailyPoint[];
  firstDate: string | null;
  today: string;
  base: string;
  benchmarks: Record<BenchmarkKey, PricePoint[]>;
  notice: string | null;
  usesTodaysFx: boolean;
}> {
  const { txns, cash, baseCurrency } = await loadLedgerData(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const empty = { SPY: [], QQQ: [], DIA: [] } as Record<BenchmarkKey, PricePoint[]>;
  const dates = [...txns.map((t) => t.tradeDate), ...cash.map((c) => c.entryDate)].sort();
  if (!dates.length) return { points: [], firstDate: null, today, base: baseCurrency, benchmarks: empty, notice: null, usesTodaysFx: false };

  const firstDate = dates[0];
  const tickers = [...new Set(txns.map((t) => t.ticker))];
  const currencies = new Set([baseCurrency, ...txns.map((t) => t.currency), ...cash.map((c) => c.currency)]);
  const needFx = currencies.size > 1;

  const [histRes, benchRes, fxRes] = await Promise.all([
    Promise.allSettled(tickers.map((t) => market.history(supabase, t, firstDate))),
    Promise.allSettled(BENCHMARKS.map((b) => market.history(supabase, b.key, firstDate))),
    needFx ? market.fx(supabase).catch(() => null) : Promise.resolve(null as FxTable | null),
  ]);

  const history: Record<string, PricePoint[]> = {};
  let missing = 0;
  histRes.forEach((r, i) => {
    if (r.status === "fulfilled") history[tickers[i]] = r.value.points;
    else missing++;
  });
  const benchmarks = { ...empty };
  benchRes.forEach((r, i) => {
    if (r.status === "fulfilled") benchmarks[BENCHMARKS[i].key] = r.value.points;
  });

  const { points } = buildDailySeries({ txns, cash, history, fx: fxRes, base: baseCurrency, today });
  const notice = missing || (needFx && !fxRes) ? messages.marketSlow() : null;
  return { points, firstDate, today, base: baseCurrency, benchmarks, notice, usesTodaysFx: needFx };
}
