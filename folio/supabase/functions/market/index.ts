// Folio market-data Edge Function.
// Holds the Finnhub key (Supabase secret) and talks to Finnhub + Yahoo Finance + exchange-rate APIs.
// Every call must come from a signed-in user. Results are cached in Supabase tables.
//
// POST body: { action: "status" | "search" | "quote" | "profile" | "history" | "earnings" | "news" | "fx" | "shariah", ... }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import YahooFinance from "npm:yahoo-finance2@4";
import { mapSector } from "./sectors.ts";
import { cleanTicker, isUsTicker, normalizeCurrency, toFinnhubSymbol, toMajor } from "./currency.ts";

// ---------- setup ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Accept the key under either spelling (secret names are case-sensitive)
const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY") ?? Deno.env.get("Finnhub_API_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const QUOTE_TTL_MS = 60_000;
const PROFILE_TTL_MS = 7 * 864e5;
const MAX_TICKERS = 50;
const SHARIAH_TTL_MS = 7 * 864e5; // balance sheets change quarterly

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function finnhub<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!FINNHUB_KEY) throw new AppError("finnhub_unconfigured", "Finnhub key missing", 503);
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://finnhub.io/api/v1${path}?${qs}`, {
    headers: { "X-Finnhub-Token": FINNHUB_KEY },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 429) throw new AppError("rate_limited", "Finnhub rate limit", 429);
  if (!res.ok) throw new AppError("upstream_error", `Finnhub ${res.status}`, 502);
  return (await res.json()) as T;
}

function parseTickers(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out = [...new Set(list.map(cleanTicker).filter((t): t is string => !!t))];
  if (out.length === 0) throw new AppError("bad_input", "No valid tickers");
  if (out.length > MAX_TICKERS) throw new AppError("bad_input", `At most ${MAX_TICKERS} tickers`);
  return out;
}

// ---------- search ----------
async function search(q: unknown) {
  const query = typeof q === "string" ? q.trim().slice(0, 50) : "";
  if (query.length < 1) return [];
  try {
    const r: any = await yf.search(query, { quotesCount: 10, newsCount: 0 });
    return (r.quotes ?? [])
      .filter((x: any) => x.symbol && (x.quoteType === "EQUITY" || x.quoteType === "ETF"))
      .slice(0, 8)
      .map((x: any) => ({
        ticker: String(x.symbol).toUpperCase(),
        name: x.longname ?? x.shortname ?? x.symbol,
        exchange: x.exchDisp ?? x.exchange ?? null,
        type: x.quoteType,
      }));
  } catch {
    // Fallback: Finnhub search (US-focused)
    const r = await finnhub<{ result: any[] }>("/search", { q: query });
    return (r.result ?? [])
      .filter((x) => x.type === "Common Stock" || x.type === "ETP")
      .slice(0, 8)
      .map((x) => ({ ticker: String(x.symbol).replace(".", "-"), name: x.description, exchange: null, type: x.type === "ETP" ? "ETF" : "EQUITY" }));
  }
}

// ---------- quotes ----------
type Quote = { ticker: string; price: number; change: number | null; changePct: number | null; currency: string; asOf: string; source: string; stale?: boolean };

async function quoteFromFinnhub(ticker: string): Promise<Quote | null> {
  const q = await finnhub<{ c: number; d: number | null; dp: number | null; t: number }>("/quote", { symbol: toFinnhubSymbol(ticker) });
  if (!q || !q.c) return null; // Finnhub returns 0s for unknown symbols
  return { ticker, price: q.c, change: q.d, changePct: q.dp, currency: "USD", asOf: new Date((q.t || Date.now() / 1000) * 1000).toISOString(), source: "finnhub" };
}

async function quotesFromYahoo(tickers: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (tickers.length === 0) return out;
  const rows: any[] = await yf.quote(tickers, { return: "array" } as any).catch(async () => {
    // one bad symbol can fail the batch: retry one by one
    const each = await Promise.all(tickers.map((t) => yf.quote(t).catch(() => null)));
    return each.filter(Boolean);
  });
  for (const r of rows ?? []) {
    if (!r?.symbol || r.regularMarketPrice == null) continue;
    const { divisor, currency } = normalizeCurrency(r.currency);
    const price = toMajor(r.regularMarketPrice, r.currency).value!;
    const change = r.regularMarketChange != null ? Math.round((r.regularMarketChange / divisor) * 1e6) / 1e6 : null;
    out.set(String(r.symbol).toUpperCase(), {
      ticker: String(r.symbol).toUpperCase(),
      price,
      change,
      changePct: r.regularMarketChangePercent ?? null,
      currency,
      asOf: r.regularMarketTime ? new Date(r.regularMarketTime).toISOString() : new Date().toISOString(),
      source: "yahoo",
    });
  }
  return out;
}

async function quotes(raw: unknown) {
  const tickers = parseTickers(raw);
  const { data: cached } = await admin.from("quote_cache").select("*").in("ticker", tickers);
  const cache = new Map((cached ?? []).map((c: any) => [c.ticker, c]));
  const result: Record<string, Quote> = {};
  const need: string[] = [];

  for (const t of tickers) {
    const c: any = cache.get(t);
    if (c && Date.now() - new Date(c.updated_at).getTime() < QUOTE_TTL_MS) {
      result[t] = { ticker: t, price: Number(c.price), change: c.change == null ? null : Number(c.change), changePct: c.change_pct == null ? null : Number(c.change_pct), currency: c.currency, asOf: c.updated_at, source: `${c.source}-cache` };
    } else need.push(t);
  }

  if (need.length) {
    const fresh = new Map<string, Quote>();
    // US: Finnhub first (official, real time)
    const us = need.filter(isUsTicker);
    await Promise.all(
      us.map(async (t) => {
        try {
          const q = await quoteFromFinnhub(t);
          if (q) fresh.set(t, q);
        } catch {
          /* fall through to Yahoo */
        }
      }),
    );
    // Everything still missing (international, or Finnhub failed): Yahoo
    const rest = need.filter((t) => !fresh.has(t));
    try {
      const y = await quotesFromYahoo(rest);
      y.forEach((q, t) => fresh.set(t, q));
    } catch {
      /* use stale cache below */
    }

    const upserts = [...fresh.values()].map((q) => ({ ticker: q.ticker, price: q.price, change: q.change, change_pct: q.changePct, currency: q.currency, source: q.source, updated_at: new Date().toISOString() }));
    if (upserts.length) await admin.from("quote_cache").upsert(upserts);

    for (const t of need) {
      const q = fresh.get(t);
      if (q) result[t] = q;
      else {
        const c: any = cache.get(t);
        if (c) result[t] = { ticker: t, price: Number(c.price), change: c.change == null ? null : Number(c.change), changePct: c.change_pct == null ? null : Number(c.change_pct), currency: c.currency, asOf: c.updated_at, source: `${c.source}-cache`, stale: true };
      }
    }
  }

  const missing = tickers.filter((t) => !result[t]);
  return { quotes: result, missing };
}

// ---------- profile (name, exchange, currency, sector) ----------
async function profile(raw: unknown) {
  const ticker = cleanTicker(raw);
  if (!ticker) throw new AppError("bad_input", "Invalid ticker");

  const { data: existing } = await admin.from("symbols").select("*").eq("ticker", ticker).maybeSingle();
  if (existing && Date.now() - new Date(existing.updated_at).getTime() < PROFILE_TTL_MS) return existing;

  let name: string | null = null, exchange: string | null = null, currency: string | null = null;
  let industry: string | null = null, yahooSector: string | null = null, logo: string | null = null, quoteType: string | null = null;

  // Yahoo first for name/currency/sector (works for every exchange)
  try {
    const q: any = await yf.quote(ticker);
    if (q?.symbol) {
      name = q.longName ?? q.shortName ?? null;
      exchange = q.fullExchangeName ?? q.exchange ?? null;
      currency = normalizeCurrency(q.currency).currency;
      quoteType = q.quoteType ?? null;
    }
    if (quoteType !== "ETF") {
      const s: any = await yf.quoteSummary(ticker, { modules: ["assetProfile"] }).catch(() => null);
      yahooSector = s?.assetProfile?.sector ?? null;
      industry = s?.assetProfile?.industry ?? null;
    }
  } catch {
    /* try Finnhub */
  }

  // Finnhub adds a logo (and fills gaps) for US stocks
  if (isUsTicker(ticker) && FINNHUB_KEY) {
    try {
      const p = await finnhub<any>("/stock/profile2", { symbol: toFinnhubSymbol(ticker) });
      if (p?.name) {
        name = name ?? p.name;
        exchange = exchange ?? p.exchange ?? null;
        currency = currency ?? p.currency ?? "USD";
        industry = industry ?? p.finnhubIndustry ?? null;
        logo = p.logo || null;
      }
    } catch {
      /* optional */
    }
  }

  if (!name) throw new AppError("unknown_ticker", "Ticker not found", 404);

  const row = {
    ticker,
    name: String(name).trim(),
    exchange,
    currency: currency ?? "USD",
    industry,
    sector: mapSector({ yahooSector, industry, quoteType }),
    logo,
    updated_at: new Date().toISOString(),
  };
  await admin.from("symbols").upsert(row);
  return row;
}

// ---------- price history (daily closes, stored permanently) ----------
async function history(rawTicker: unknown, rawFrom: unknown) {
  const ticker = cleanTicker(rawTicker);
  if (!ticker) throw new AppError("bad_input", "Invalid ticker");
  const from = typeof rawFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : daysAgo(365 * 5);

  const { data: bounds } = await admin
    .from("price_history")
    .select("date")
    .eq("ticker", ticker)
    .order("date", { ascending: true })
    .limit(1);
  const { data: last } = await admin.from("price_history").select("date").eq("ticker", ticker).order("date", { ascending: false }).limit(1);
  const minDate = bounds?.[0]?.date as string | undefined;
  const maxDate = last?.[0]?.date as string | undefined;

  const ranges: [string, string | null][] = [];
  if (!minDate) ranges.push([from, null]);
  else {
    // only re-fetch older data if it's more than a week before what we have (weekends/holidays/IPO dates leave small gaps)
    if (Date.parse(minDate) - Date.parse(from) > 7 * 864e5) ranges.push([from, minDate]);
    if (maxDate! < daysAgo(1)) ranges.push([maxDate!, null]);
  }

  for (const [start, end] of ranges) {
    try {
      const opts: any = { period1: new Date(start + "T00:00:00Z"), interval: "1d" };
      if (end) opts.period2 = new Date(end + "T00:00:00Z");
      const chart: any = await yf.chart(ticker, opts);
      const ccy = chart?.meta?.currency;
      const rows = (chart?.quotes ?? [])
        .filter((q: any) => q.close != null && q.date)
        .map((q: any) => ({ ticker, date: new Date(q.date).toISOString().slice(0, 10), close: toMajor(q.close, ccy).value }));
      for (let i = 0; i < rows.length; i += 1000) {
        await admin.from("price_history").upsert(rows.slice(i, i + 1000), { onConflict: "ticker,date" });
      }
    } catch {
      if (!minDate) throw new AppError("upstream_error", "History unavailable", 502);
    }
  }

  // Read back in pages (PostgREST caps rows per request)
  const all: { date: string; close: number }[] = [];
  for (let page = 0; page < 10; page++) {
    const { data } = await admin
      .from("price_history")
      .select("date, close")
      .eq("ticker", ticker)
      .gte("date", from)
      .order("date", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (!data?.length) break;
    all.push(...data.map((d: any) => ({ date: d.date, close: Number(d.close) })));
    if (data.length < 1000) break;
  }
  return { ticker, from, points: all };
}

// ---------- earnings ----------
async function earnings(raw: unknown) {
  const tickers = parseTickers(raw);
  const out: Record<string, string | null> = {};
  await Promise.all(
    tickers.map(async (t) => {
      let date: string | null = null;
      if (isUsTicker(t) && FINNHUB_KEY) {
        try {
          const r = await finnhub<{ earningsCalendar: { date: string }[] }>("/calendar/earnings", { symbol: toFinnhubSymbol(t), from: today(), to: daysAgo(-120) });
          date = (r.earningsCalendar ?? []).map((e) => e.date).filter((d) => d >= today()).sort()[0] ?? null;
        } catch {
          /* Yahoo fallback */
        }
      }
      if (!date) {
        try {
          const s: any = await yf.quoteSummary(t, { modules: ["calendarEvents"] });
          const dates: Date[] = s?.calendarEvents?.earnings?.earningsDate ?? [];
          date = dates.map((d) => new Date(d).toISOString().slice(0, 10)).filter((d) => d >= today()).sort()[0] ?? null;
        } catch {
          /* unknown */
        }
      }
      out[t] = date;
    }),
  );
  return out;
}

// ---------- news ----------
async function news(raw: unknown) {
  const ticker = cleanTicker(raw);
  if (!ticker) throw new AppError("bad_input", "Invalid ticker");
  if (isUsTicker(ticker) && FINNHUB_KEY) {
    try {
      const r = await finnhub<any[]>("/company-news", { symbol: toFinnhubSymbol(ticker), from: daysAgo(14), to: today() });
      if (r?.length) {
        return r.slice(0, 8).map((n) => ({ title: n.headline, url: n.url, source: n.source, publishedAt: new Date(n.datetime * 1000).toISOString(), summary: n.summary || null }));
      }
    } catch {
      /* Yahoo fallback */
    }
  }
  try {
    const r: any = await yf.search(ticker, { quotesCount: 0, newsCount: 8 });
    return (r.news ?? []).map((n: any) => ({ title: n.title, url: n.link, source: n.publisher, publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : null, summary: null }));
  } catch {
    return [];
  }
}

// ---------- Shariah screening facts (the rules themselves run in the app: lib/shariah.ts) ----------
async function latestRates(): Promise<Record<string, number>> {
  const { data: latest } = await admin.from("fx_rates").select("date").eq("base", "USD").order("date", { ascending: false }).limit(1);
  if (!latest?.[0]) return {};
  const { data } = await admin.from("fx_rates").select("quote, rate").eq("base", "USD").eq("date", latest[0].date);
  return Object.fromEntries((data ?? []).map((r: any) => [r.quote, Number(r.rate)]));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function shariahFacts(ticker: string, rates: () => Promise<Record<string, number>>) {
  const base = { ticker, updated_at: new Date().toISOString() };
  let s: any;
  try {
    s = await yf.quoteSummary(ticker, { modules: ["price", "financialData", "defaultKeyStatistics", "assetProfile"] });
  } catch {
    return { ...base, found: false, quote_type: null, industry: null, yahoo_sector: null, total_debt: null, cash_investments: null, market_cap: null, currency: null, data_date: null };
  }
  const quoteType = s?.price?.quoteType ?? null;
  // Yahoo gives market value in major units (pounds, not pence); balance sheet may be in another currency
  const { currency } = normalizeCurrency(s?.price?.currency);
  const marketCap = num(s?.price?.marketCap);
  let debt = num(s?.financialData?.totalDebt);
  let cash = num(s?.financialData?.totalCash);
  const fin = normalizeCurrency(s?.financialData?.financialCurrency ?? currency).currency;
  if (fin !== currency && (debt != null || cash != null)) {
    const r = await rates();
    const rFrom = fin === "USD" ? 1 : r[fin], rTo = currency === "USD" ? 1 : r[currency];
    const k = rFrom && rTo ? rTo / rFrom : null;
    debt = k != null && debt != null ? debt * k : null;
    cash = k != null && cash != null ? cash * k : null;
  }
  const mrq = s?.defaultKeyStatistics?.mostRecentQuarter;
  return {
    ...base,
    found: true,
    quote_type: quoteType,
    industry: s?.assetProfile?.industry ?? null,
    yahoo_sector: s?.assetProfile?.sector ?? null,
    total_debt: debt,
    cash_investments: cash,
    market_cap: marketCap,
    currency,
    data_date: mrq ? new Date(mrq).toISOString().slice(0, 10) : null,
  };
}

async function shariah(raw: unknown) {
  const tickers = parseTickers(raw);
  const { data: cached } = await admin.from("shariah_cache").select("*").in("ticker", tickers);
  const out: Record<string, any> = {};
  const need: string[] = [];
  for (const c of cached ?? []) if (Date.now() - new Date(c.updated_at).getTime() < SHARIAH_TTL_MS) out[c.ticker] = { ...c, source: "cache" };
  for (const t of tickers) if (!out[t] && !t.includes("=")) need.push(t); // metals/futures: not screened
  let ratesCache: Record<string, number> | null = null;
  const rates = async () => (ratesCache ??= await latestRates());
  const fresh: any[] = [];
  for (let i = 0; i < need.length; i += 5) {
    fresh.push(...(await Promise.all(need.slice(i, i + 5).map((t) => shariahFacts(t, rates)))));
  }
  if (fresh.length) await admin.from("shariah_cache").upsert(fresh);
  for (const r of fresh) out[r.ticker] = { ...r, source: "yahoo" };
  return out;
}

// ---------- exchange rates (USD-based table) ----------
async function fx() {
  const { data: latest } = await admin.from("fx_rates").select("date").eq("base", "USD").order("date", { ascending: false }).limit(1);
  const lastDate = latest?.[0]?.date as string | undefined;
  const { data: lastRow } = lastDate
    ? await admin.from("fx_rates").select("quote, rate").eq("base", "USD").eq("date", lastDate)
    : { data: null };

  const fresh = lastDate === today();
  if (!fresh) {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
      const j = await res.json();
      if (j?.result === "success" && j.rates) {
        const rows = Object.entries(j.rates as Record<string, number>)
          .filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && rate > 0)
          .map(([quote, rate]) => ({ base: "USD", quote, date: today(), rate }));
        await admin.from("fx_rates").upsert(rows, { onConflict: "base,quote,date" });
        return { base: "USD", date: today(), rates: Object.fromEntries(rows.map((r) => [r.quote, r.rate])) };
      }
    } catch {
      /* fall back to stored */
    }
  }
  if (lastRow?.length) return { base: "USD", date: lastDate, stale: !fresh, rates: Object.fromEntries(lastRow.map((r: any) => [r.quote, Number(r.rate)])) };
  throw new AppError("upstream_error", "Exchange rates unavailable", 502);
}

// ---------- auth + router ----------
// The Supabase gateway verifies the token's signature before this code runs (verify_jwt = true),
// so we only need to read it and insist it belongs to a logged-in user (not the public anon key).
function requireUser(req: Request): string {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role !== "authenticated" || !payload.sub) throw new Error("not a user");
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) throw new Error("expired");
    return payload.sub as string;
  } catch {
    throw new AppError("unauthorized", "Please log in", 401);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: { code: "method", message: "Use POST" } }, 405);

  try {
    requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    let data: unknown;
    switch (action) {
      case "status":
        data = { finnhubConfigured: !!FINNHUB_KEY };
        break;
      case "search":
        data = await search(body.q);
        break;
      case "quote":
        data = await quotes(body.tickers);
        break;
      case "profile":
        data = await profile(body.ticker);
        break;
      case "history":
        data = await history(body.ticker, body.from);
        break;
      case "earnings":
        data = await earnings(body.tickers);
        break;
      case "news":
        data = await news(body.ticker);
        break;
      case "fx":
        data = await fx();
        break;
      case "shariah":
        data = await shariah(body.tickers);
        break;
      default:
        throw new AppError("bad_input", "Unknown action");
    }
    return json({ ok: true, data });
  } catch (e) {
    const err = e instanceof AppError ? e : new AppError("server_error", "Unexpected error", 500);
    if (!(e instanceof AppError)) console.error(e);
    return json({ ok: false, error: { code: err.code, message: err.message } }, err.status);
  }
});
