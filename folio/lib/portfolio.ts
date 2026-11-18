// Folio's calculation engine. Pure functions only (no network, no database) so every rule is unit-tested.
// Rules follow docs/prd.md section 4.
import { convert, type FxTable } from "./market";
import { METALS_SECTOR } from "./metals";

// ---------- input types ----------
export type Txn = {
  id: string;
  ticker: string;
  type: "buy" | "sell" | "dividend";
  shares: number | null;
  price: number | null;
  amount: number | null; // dividends: total received
  fees: number;
  currency: string; // the stock's trading currency
  tradeDate: string; // YYYY-MM-DD
  createdAt: string;
};

export type CashEntry = {
  id: string;
  kind: "starting" | "balance" | "deposit" | "withdrawal";
  amount: number;
  currency: string;
  entryDate: string; // YYYY-MM-DD
  /** Set when this deposit was added because a buy was paid with new money. */
  txnId?: string | null;
  /** When it was recorded: same-day cash entries apply in this order (e.g. starting cash before a later deposit). */
  createdAt?: string;
};

export type QuoteLike = { ticker: string; price: number; change: number | null; changePct: number | null; currency: string; stale?: boolean };
export type SymbolLike = { ticker: string; name: string; sector: string; currency: string; logo?: string | null };

// ---------- ledger (replaying every transaction in date order) ----------
export type Position = {
  ticker: string;
  currency: string;
  shares: number;
  costBasis: number; // in stock currency, fees included
  avgCost: number; // costBasis / shares
  realizedPL: number; // in stock currency
  dividends: number; // in stock currency
};

export type SellEvent = { txnId: string; ticker: string; proceeds: number; realizedPL: number; currency: string };
export type AutoDeposit = { txnId: string; date: string; amount: number; currency: string };
export type Problem = { code: "oversell"; txnId: string; ticker: string; message: string };

export type Ledger = {
  positions: Record<string, Position>;
  cash: Record<string, number>; // balance per currency
  sells: SellEvent[];
  autoDeposits: AutoDeposit[];
  netDeposited: number; // money put in minus money taken out, in base currency (approx. at current rates)
  problems: Problem[];
};

const EPS = 1e-9;
const tidy = (x: number) => (Math.abs(x) < 1e-7 ? 0 : x);

type ReplayOptions = { fx?: FxTable | null; base?: string };

export function replayLedger(txns: Txn[], cashEntries: CashEntry[], opts: ReplayOptions = {}): Ledger {
  const base = opts.base ?? "USD";
  const fx = opts.fx ?? null;
  const positions: Record<string, Position> = {};
  const cash: Record<string, number> = {};
  const sells: SellEvent[] = [];
  const autoDeposits: AutoDeposit[] = [];
  const problems: Problem[] = [];
  let netDeposited = 0;

  const toBase = (amount: number, ccy: string) => convert(amount, ccy, base, fx) ?? amount;
  const addCash = (ccy: string, amt: number) => (cash[ccy] = tidy((cash[ccy] ?? 0) + amt));

  // Pay `cost` in currency `ccy`: same-currency cash first, then other balances (base first), then new money.
  function pay(cost: number, ccy: string, txnId: string, date: string) {
    let remaining = cost;
    const fromSame = Math.min(cash[ccy] ?? 0, remaining);
    if (fromSame > 0) {
      addCash(ccy, -fromSame);
      remaining -= fromSame;
    }
    if (remaining > EPS && fx) {
      const others = Object.keys(cash)
        .filter((c) => c !== ccy && (cash[c] ?? 0) > EPS)
        .sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
      for (const other of others) {
        if (remaining <= EPS) break;
        const availInCcy = convert(cash[other], other, ccy, fx);
        if (availInCcy == null || availInCcy <= 0) continue;
        const use = Math.min(availInCcy, remaining);
        const useInOther = convert(use, ccy, other, fx)!;
        addCash(other, -useInOther);
        remaining -= use;
      }
    }
    if (remaining > EPS) {
      autoDeposits.push({ txnId, date, amount: remaining, currency: ccy });
      netDeposited += toBase(remaining, ccy);
    }
  }

  // Merge cash entries and trades into one timeline; cash entries first on the same day.
  type Event = { date: string; order: number; tie: string; run: () => void };
  const events: Event[] = [];

  for (const c of cashEntries) {
    events.push({
      date: c.entryDate,
      order: 0,
      tie: (c.createdAt ?? "") + c.id,
      run: () => {
        if (c.kind === "starting" || c.kind === "balance") {
          // Balance check-point: "this is the cash in my account on this date". It already includes
          // everything that happened before, so it replaces all balances; the difference counts as money in/out.
          const before = Object.entries(cash).reduce((a, [ccy, amt]) => a + toBase(amt, ccy), 0);
          for (const k of Object.keys(cash)) delete cash[k];
          cash[c.currency] = c.amount;
          netDeposited += toBase(c.amount, c.currency) - before;
        } else if (c.kind === "withdrawal") {
          addCash(c.currency, -c.amount);
          netDeposited -= toBase(c.amount, c.currency);
        } else {
          addCash(c.currency, c.amount);
          netDeposited += toBase(c.amount, c.currency);
        }
      },
    });
  }

  for (const t of txns) {
    events.push({
      date: t.tradeDate,
      order: 1,
      tie: t.createdAt + t.id,
      run: () => {
        const p = (positions[t.ticker] ??= { ticker: t.ticker, currency: t.currency, shares: 0, costBasis: 0, avgCost: 0, realizedPL: 0, dividends: 0 });
        const fees = t.fees ?? 0;
        if (t.type === "buy") {
          const shares = t.shares ?? 0;
          const cost = shares * (t.price ?? 0) + fees;
          p.shares += shares;
          p.costBasis += cost;
          p.avgCost = p.shares > EPS ? p.costBasis / p.shares : 0;
          pay(cost, t.currency, t.id, t.tradeDate);
        } else if (t.type === "sell") {
          let shares = t.shares ?? 0;
          if (shares > p.shares + EPS) {
            problems.push({ code: "oversell", txnId: t.id, ticker: t.ticker, message: `Sold ${shares} ${t.ticker} but only ${p.shares} were owned on ${t.tradeDate}` });
            shares = p.shares;
          }
          const price = t.price ?? 0;
          const proceeds = shares * price - fees;
          const realized = (price - p.avgCost) * shares - fees;
          p.realizedPL += realized;
          p.costBasis -= p.avgCost * shares;
          p.shares = tidy(p.shares - shares);
          if (p.shares === 0) p.costBasis = 0;
          addCash(t.currency, proceeds);
          sells.push({ txnId: t.id, ticker: t.ticker, proceeds, realizedPL: realized, currency: t.currency });
        } else {
          const amt = (t.amount ?? 0) - fees;
          p.dividends += amt;
          addCash(t.currency, amt);
        }
      },
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order || (a.tie < b.tie ? -1 : 1)));
  for (const e of events) e.run();

  return { positions, cash, sells, autoDeposits, netDeposited, problems };
}

/** Shares of `ticker` owned at the end of `date` (optionally ignoring one transaction, e.g. the one being edited). */
export function maxSellable(txns: Txn[], ticker: string, date: string, excludeId?: string): number {
  const relevant = txns.filter((t) => t.ticker === ticker && t.id !== excludeId && t.tradeDate <= date);
  return replayLedger(relevant, []).positions[ticker]?.shares ?? 0;
}

// ---------- warnings ----------
export type Warning = "ok" | "yellow" | "red" | "none";

export const STOCK_THRESHOLDS = { yellow: 10, red: 20 } as const;
export const SECTOR_THRESHOLDS = { yellow: 25, red: 40 } as const;

export function stockWarning(weightPct: number): Warning {
  if (weightPct > STOCK_THRESHOLDS.red) return "red";
  if (weightPct > STOCK_THRESHOLDS.yellow) return "yellow";
  return "ok";
}

/** "Other" (mostly ETFs, already diversified), precious metals and cash get no concentration warning. */
export function sectorWarning(sector: string, weightPct: number): Warning {
  if (sector === "Other" || sector === "Cash" || sector === METALS_SECTOR) return "none";
  if (weightPct > SECTOR_THRESHOLDS.red) return "red";
  if (weightPct > SECTOR_THRESHOLDS.yellow) return "yellow";
  return "ok";
}

// ---------- valuation ----------
export type HoldingRow = {
  ticker: string;
  name: string;
  sector: string;
  logo: string | null;
  currency: string;
  shares: number;
  avgCost: number; // stock currency
  price: number; // stock currency
  priceMissing: boolean;
  stale: boolean;
  valueLocal: number; // stock currency
  value: number; // base currency
  dayChange: number; // base currency
  dayChangePct: number | null;
  unrealizedPL: number; // base currency
  unrealizedPLPct: number | null;
  unrealizedPLLocal: number; // stock currency
  /** No exchange rate to the base currency: value is shown in its own currency and left out of totals. */
  fxMissing: boolean;
  weight: number; // % of total portfolio (cash included)
  warning: Warning;
};

export type SectorRow = { sector: string; value: number; weight: number; warning: Warning; tickers: string[] };

export type Valuation = {
  base: string;
  holdings: HoldingRow[];
  sectors: SectorRow[];
  cashByCurrency: { currency: string; amount: number; value: number }[];
  cashValue: number;
  investedValue: number;
  stocksValue: number;
  metalsValue: number;
  totalValue: number;
  dayChange: number;
  dayChangePct: number;
  unrealizedPL: number;
  unrealizedPLPct: number | null;
  realizedPL: number;
  dividends: number;
  fxMissing: string[];
};

export function valuePortfolio(
  ledger: Ledger,
  quotes: Record<string, QuoteLike>,
  symbols: Record<string, SymbolLike>,
  fx: FxTable | null,
  base: string,
): Valuation {
  const fxMissing = new Set<string>();
  // Never show an unconverted amount as if it were in the base currency: without a rate it counts as 0 in
  // base-currency totals, and the row is flagged so it can be shown in its own currency instead.
  const canConvert = (ccy: string) => convert(1, ccy, base, fx) != null;
  const toBase = (amount: number, ccy: string) => {
    const v = convert(amount, ccy, base, fx);
    if (v == null) {
      fxMissing.add(ccy);
      return 0;
    }
    return v;
  };

  const rows: Omit<HoldingRow, "weight" | "warning">[] = [];
  let realizedPL = 0;
  let dividends = 0;

  for (const p of Object.values(ledger.positions)) {
    realizedPL += toBase(p.realizedPL, p.currency);
    dividends += toBase(p.dividends, p.currency);
    if (p.shares <= EPS) continue;

    const sym = symbols[p.ticker];
    const q = quotes[p.ticker];
    const priceMissing = !q || !Number.isFinite(q.price);
    const price = priceMissing ? p.avgCost : q.price;
    const valueLocal = p.shares * price;
    const value = toBase(valueLocal, p.currency);
    const dayChangeLocal = !priceMissing && q.change != null ? q.change * p.shares : 0;
    const plLocal = valueLocal - p.costBasis;

    rows.push({
      ticker: p.ticker,
      name: sym?.name ?? p.ticker,
      sector: sym?.sector ?? "Other",
      logo: sym?.logo ?? null,
      currency: p.currency,
      shares: p.shares,
      avgCost: p.avgCost,
      price,
      priceMissing,
      stale: !!q?.stale,
      valueLocal,
      value,
      dayChange: toBase(dayChangeLocal, p.currency),
      dayChangePct: priceMissing ? null : q.changePct,
      unrealizedPL: toBase(plLocal, p.currency),
      unrealizedPLPct: p.costBasis > EPS ? (plLocal / p.costBasis) * 100 : null,
      unrealizedPLLocal: plLocal,
      fxMissing: !canConvert(p.currency),
    });
  }

  const cashByCurrency = Object.entries(ledger.cash)
    .filter(([, amt]) => Math.abs(amt) > 0.005)
    .map(([currency, amount]) => ({ currency, amount, value: toBase(amount, currency) }))
    .sort((a, b) => b.value - a.value);
  const cashValue = cashByCurrency.reduce((a, c) => a + c.value, 0);
  const investedValue = rows.reduce((a, r) => a + r.value, 0);
  const totalValue = investedValue + cashValue;
  const pct = (v: number) => (totalValue > EPS ? (v / totalValue) * 100 : 0);

  const holdings: HoldingRow[] = rows
    .map((r) => {
      const weight = pct(r.value);
      return { ...r, weight, warning: r.sector === METALS_SECTOR || r.fxMissing ? ("none" as Warning) : stockWarning(weight) };
    })
    .sort((a, b) => b.value - a.value || b.valueLocal - a.valueLocal);

  const bySector = new Map<string, { value: number; tickers: string[] }>();
  for (const h of holdings) {
    const s = bySector.get(h.sector) ?? { value: 0, tickers: [] };
    s.value += h.value;
    s.tickers.push(h.ticker);
    bySector.set(h.sector, s);
  }
  const sectors: SectorRow[] = [...bySector.entries()]
    .map(([sector, s]) => ({ sector, value: s.value, weight: pct(s.value), warning: sectorWarning(sector, pct(s.value)), tickers: s.tickers }))
    .sort((a, b) => b.value - a.value);
  if (cashValue > 0.005) sectors.push({ sector: "Cash", value: cashValue, weight: pct(cashValue), warning: "none", tickers: [] });

  const metalsValue = holdings.filter((h) => h.sector === METALS_SECTOR).reduce((a, h) => a + h.value, 0);
  const dayChange = holdings.reduce((a, h) => a + h.dayChange, 0);
  const prevValue = totalValue - dayChange;
  const unrealizedPL = holdings.reduce((a, h) => a + h.unrealizedPL, 0);
  const costBase = holdings.reduce((a, h) => a + (h.value - h.unrealizedPL), 0);

  return {
    base,
    holdings,
    sectors,
    cashByCurrency,
    cashValue,
    investedValue,
    stocksValue: investedValue - metalsValue,
    metalsValue,
    totalValue,
    dayChange,
    dayChangePct: prevValue > EPS ? (dayChange / prevValue) * 100 : 0,
    unrealizedPL,
    unrealizedPLPct: costBase > EPS ? (unrealizedPL / costBase) * 100 : null,
    realizedPL,
    dividends,
    fxMissing: [...fxMissing],
  };
}
