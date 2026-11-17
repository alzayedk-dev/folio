// Typed helper for calling the "market" Supabase Edge Function from the app
// (works with the browser client or the server client; both send the user's login token).
import type { SupabaseClient } from "@supabase/supabase-js";
import { messages } from "./messages";
import type { ShariahFacts } from "./shariah";

export type SearchResult = { ticker: string; name: string; exchange: string | null; type: "EQUITY" | "ETF" | string };
export type Quote = {
  ticker: string;
  price: number;
  change: number | null;
  changePct: number | null;
  currency: string;
  asOf: string;
  source: string;
  stale?: boolean;
};
export type SymbolProfile = {
  ticker: string;
  name: string;
  exchange: string | null;
  currency: string;
  industry: string | null;
  sector: string;
  logo: string | null;
  updated_at: string;
};
export type PricePoint = { date: string; close: number };
export type NewsItem = { title: string; url: string; source: string | null; publishedAt: string | null; summary: string | null };
export type FxTable = { base: "USD"; date: string; stale?: boolean; rates: Record<string, number> };

export class MarketError extends Error {
  constructor(public code: string, public friendly: string) {
    super(code);
  }
}

function friendlyFor(code: string): string {
  switch (code) {
    case "unknown_ticker":
      return messages.unknownTicker;
    case "rate_limited":
    case "upstream_error":
      return messages.marketSlow();
    case "unauthorized":
      return "Your session has expired. Please log in again.";
    default:
      return messages.serverBusy;
  }
}

async function call<T>(supabase: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("market", { body });
  if (error) {
    // Non-2xx responses still carry our JSON error body
    let code = "server_error";
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      code = j?.error?.code ?? code;
    } catch {
      /* keep default */
    }
    throw new MarketError(code, friendlyFor(code));
  }
  if (!data?.ok) {
    const code = data?.error?.code ?? "server_error";
    throw new MarketError(code, friendlyFor(code));
  }
  return data.data as T;
}

export const market = {
  search: (s: SupabaseClient, q: string) => call<SearchResult[]>(s, { action: "search", q }),
  quotes: (s: SupabaseClient, tickers: string[]) =>
    call<{ quotes: Record<string, Quote>; missing: string[] }>(s, { action: "quote", tickers }),
  profile: (s: SupabaseClient, ticker: string) => call<SymbolProfile>(s, { action: "profile", ticker }),
  history: (s: SupabaseClient, ticker: string, from?: string) =>
    call<{ ticker: string; from: string; points: PricePoint[] }>(s, { action: "history", ticker, from }),
  earnings: (s: SupabaseClient, tickers: string[]) => call<Record<string, string | null>>(s, { action: "earnings", tickers }),
  news: (s: SupabaseClient, ticker: string) => call<NewsItem[]>(s, { action: "news", ticker }),
  fx: (s: SupabaseClient) => call<FxTable>(s, { action: "fx" }),
  shariah: (s: SupabaseClient, tickers: string[]) => call<Record<string, ShariahFacts>>(s, { action: "shariah", tickers }),
};

/** Converts an amount between currencies using a USD-based rate table (1 USD = rates[X] X). */
export function convert(amount: number, from: string, to: string, fx: FxTable | null | undefined): number | null {
  if (from === to) return amount;
  if (!fx) return null;
  const rFrom = from === "USD" ? 1 : fx.rates[from];
  const rTo = to === "USD" ? 1 : fx.rates[to];
  if (!rFrom || !rTo) return null;
  return (amount / rFrom) * rTo;
}
