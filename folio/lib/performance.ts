// Portfolio performance over time. Pure functions only (unit-tested).
//
// For every calendar day from the first transaction to today:
//   value = Σ (units held × that day's close, converted to the base currency) + cash
//   flow  = money added (+) or taken out (−) that day (deposits, balance updates, buys paid with new money)
//   daily return r = (value − flow) / previous value − 1   → time-weighted, so deposits are never "gains"
//   index = product of (1 + r), starting at 1
// Prices are carried forward over weekends/holidays. Exchange rates: today's rates are used for all days
// (a simplification; historical FX can be added later).

import { convert, type FxTable, type PricePoint } from "./market";
import { replayLedger, type CashEntry, type Txn } from "./portfolio";

export type DailyPoint = { date: string; value: number; flow: number; index: number; dailyReturn: number };
export type Range = "1M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";
export const RANGES: Range[] = ["1M", "6M", "YTD", "1Y", "5Y", "ALL"];

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function subMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function buildDailySeries(input: {
  txns: Txn[];
  cash: CashEntry[];
  history: Record<string, PricePoint[]>;
  fx: FxTable | null;
  base: string;
  today: string;
}): { points: DailyPoint[]; firstDate: string | null } {
  const { txns, cash, history, fx, base, today } = input;
  const dates = [...txns.map((t) => t.tradeDate), ...cash.map((c) => c.entryDate)].sort();
  if (dates.length === 0) return { points: [], firstDate: null };
  const firstDate = dates[0];

  const sortedTxns = [...txns].sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0));
  const sortedCash = [...cash].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0));
  const hist: Record<string, PricePoint[]> = {};
  for (const [t, pts] of Object.entries(history)) hist[t] = [...pts].sort((a, b) => (a.date < b.date ? -1 : 1));
  const ptr: Record<string, number> = {};

  const toBase = (amount: number, ccy: string) => convert(amount, ccy, base, fx) ?? amount;
  const points: DailyPoint[] = [];
  let ti = 0;
  let ci = 0;
  let prevValue = 0;
  let prevDeposited = 0;
  let index = 1;

  for (let d = firstDate; d <= today; d = addDays(d, 1)) {
    while (ti < sortedTxns.length && sortedTxns[ti].tradeDate <= d) ti++;
    while (ci < sortedCash.length && sortedCash[ci].entryDate <= d) ci++;
    const ledger = replayLedger(sortedTxns.slice(0, ti), sortedCash.slice(0, ci), { fx, base });

    let value = 0;
    for (const p of Object.values(ledger.positions)) {
      if (p.shares <= 1e-9) continue;
      const series = hist[p.ticker] ?? [];
      let i = ptr[p.ticker] ?? -1;
      while (i + 1 < series.length && series[i + 1].date <= d) i++;
      ptr[p.ticker] = i;
      const close = i >= 0 ? series[i].close : p.avgCost; // before the first stored close, use the trade price
      value += toBase(p.shares * close, p.currency);
    }
    for (const [ccy, amt] of Object.entries(ledger.cash)) value += toBase(amt, ccy);

    const flow = ledger.netDeposited - prevDeposited;
    const r = prevValue > 1e-9 ? (value - flow) / prevValue - 1 : 0;
    index *= 1 + r;
    points.push({ date: d, value, flow, index, dailyReturn: r });
    prevValue = value;
    prevDeposited = ledger.netDeposited;
  }
  return { points, firstDate };
}

export function rangeStart(range: Range, today: string, firstDate: string): string {
  let start: string;
  switch (range) {
    case "1M":
      start = subMonths(today, 1);
      break;
    case "6M":
      start = subMonths(today, 6);
      break;
    case "YTD":
      start = `${today.slice(0, 4)}-01-01`;
      break;
    case "1Y":
      start = subMonths(today, 12);
      break;
    case "5Y":
      start = subMonths(today, 60);
      break;
    default:
      start = firstDate;
  }
  return start < firstDate ? firstDate : start;
}

export function sliceRange<T extends { date: string }>(points: T[], start: string): T[] {
  return points.filter((p) => p.date >= start);
}

export function rangeStats(points: DailyPoint[]) {
  if (points.length === 0) return { returnPct: 0, valueChange: 0, netFlows: 0, best: null, worst: null };
  const first = points[0];
  const last = points[points.length - 1];
  const days = points.slice(1); // the first point's daily return belongs to the day before the range
  const best = days.length ? days.reduce((a, p) => (p.dailyReturn > a.dailyReturn ? p : a)) : null;
  const worst = days.length ? days.reduce((a, p) => (p.dailyReturn < a.dailyReturn ? p : a)) : null;
  return {
    returnPct: first.index > 0 ? (last.index / first.index - 1) * 100 : 0,
    valueChange: last.value - first.value,
    netFlows: days.reduce((a, p) => a + p.flow, 0),
    best: best ? { date: best.date, pct: best.dailyReturn * 100 } : null,
    worst: worst ? { date: worst.date, pct: worst.dailyReturn * 100 } : null,
  };
}

/** Benchmark % change on each given date, rebased to 0% at the first date (prices carried forward). */
export function rebaseBenchmark(closes: PricePoint[], dates: string[]): { date: string; pct: number }[] {
  const sorted = [...closes].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!sorted.length || !dates.length) return [];
  let i = -1;
  const at = (d: string) => {
    while (i + 1 < sorted.length && sorted[i + 1].date <= d) i++;
    return i >= 0 ? sorted[i].close : sorted[0].close;
  };
  const base = at(dates[0]);
  return dates.map((d) => ({ date: d, pct: (at(d) / base - 1) * 100 }));
}

/**
 * Another portfolio's growth index on the given dates, rebased to 0% at the first date where it exists.
 * Days before that portfolio started are null (no line yet). Index values are carried forward.
 */
export function rebaseIndex(series: { date: string; index: number }[], dates: string[]): (number | null)[] {
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  let i = -1;
  let base: number | null = null;
  return dates.map((d) => {
    while (i + 1 < sorted.length && sorted[i + 1].date <= d) i++;
    if (i < 0) return null;
    const v = sorted[i].index;
    if (base == null) base = v;
    return base > 0 ? (v / base - 1) * 100 : null;
  });
}
