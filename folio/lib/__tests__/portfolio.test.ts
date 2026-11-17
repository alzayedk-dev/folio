import { describe, expect, it } from "vitest";
import {
  replayLedger,
  valuePortfolio,
  stockWarning,
  sectorWarning,
  maxSellable,
  type Txn,
  type CashEntry,
  type QuoteLike,
  type SymbolLike,
} from "../portfolio";
import type { FxTable } from "../market";

const fx: FxTable = { base: "USD", date: "2026-11-17", rates: { USD: 1, EUR: 0.9, GBP: 0.75, SAR: 3.75, KWD: 0.3 } };

let n = 0;
const buy = (ticker: string, shares: number, price: number, date: string, extra: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`, ticker, type: "buy", shares, price, amount: null, fees: 0, currency: "USD", tradeDate: date, createdAt: `${date}T00:00:0${n % 10}Z`, ...extra,
});
const sell = (ticker: string, shares: number, price: number, date: string, extra: Partial<Txn> = {}): Txn => ({
  ...buy(ticker, shares, price, date, extra), type: "sell",
});
const dividend = (ticker: string, amount: number, date: string, extra: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`, ticker, type: "dividend", shares: null, price: null, amount, fees: 0, currency: "USD", tradeDate: date, createdAt: `${date}T00:00:00Z`, ...extra,
});
const cash = (kind: CashEntry["kind"], amount: number, currency = "USD", date = "2026-01-01"): CashEntry => ({ id: `c${++n}`, kind, amount, currency, entryDate: date });

describe("replayLedger: shares, average cost, realized P/L", () => {
  it("adds up shares and averages the cost including fees", () => {
    const l = replayLedger([buy("AAPL", 10, 100, "2026-01-02", { fees: 10 }), buy("AAPL", 10, 120, "2026-02-02")], []);
    const p = l.positions.AAPL;
    expect(p.shares).toBe(20);
    // (10*100 + 10 + 10*120) / 20 = 110.5
    expect(p.avgCost).toBeCloseTo(110.5);
    expect(p.costBasis).toBeCloseTo(2210);
  });

  it("selling keeps the average cost of the remaining shares and books realized P/L", () => {
    const l = replayLedger([buy("AAPL", 10, 100, "2026-01-02"), sell("AAPL", 4, 150, "2026-03-01", { fees: 5 })], []);
    const p = l.positions.AAPL;
    expect(p.shares).toBe(6);
    expect(p.avgCost).toBeCloseTo(100);
    expect(p.realizedPL).toBeCloseTo((150 - 100) * 4 - 5); // 195
    const ev = l.sells.find((s) => s.txnId);
    expect(ev?.proceeds).toBeCloseTo(4 * 150 - 5); // 595
    expect(ev?.realizedPL).toBeCloseTo(195);
  });

  it("selling everything closes the position", () => {
    const l = replayLedger([buy("AAPL", 5, 100, "2026-01-02"), sell("AAPL", 5, 90, "2026-01-05")], []);
    expect(l.positions.AAPL.shares).toBe(0);
    expect(l.positions.AAPL.realizedPL).toBeCloseTo(-50);
  });

  it("flags (and caps) a sell of more shares than owned", () => {
    const l = replayLedger([buy("AAPL", 2, 100, "2026-01-02"), sell("AAPL", 5, 100, "2026-01-03")], []);
    expect(l.positions.AAPL.shares).toBe(0);
    expect(l.problems.some((p) => p.code === "oversell")).toBe(true);
  });

  it("orders by trade date, not by the order rows were entered", () => {
    const l = replayLedger([sell("AAPL", 5, 120, "2026-02-01"), buy("AAPL", 10, 100, "2026-01-01")], []);
    expect(l.positions.AAPL.shares).toBe(5);
    expect(l.problems).toHaveLength(0);
  });

  it("records dividends per stock", () => {
    const l = replayLedger([buy("KO", 10, 60, "2026-01-02"), dividend("KO", 4.85, "2026-04-01")], []);
    expect(l.positions.KO.dividends).toBeCloseTo(4.85);
  });
});

describe("replayLedger: cash", () => {
  it("starting cash pays for buys; sells and dividends add cash", () => {
    const l = replayLedger(
      [buy("AAPL", 10, 100, "2026-01-02", { fees: 1 }), sell("AAPL", 5, 120, "2026-02-01", { fees: 1 }), dividend("AAPL", 3, "2026-03-01")],
      [cash("starting", 5000)],
    );
    // 5000 - 1001 + 599 + 3 = 4601
    expect(l.cash.USD).toBeCloseTo(4601);
    expect(l.autoDeposits).toHaveLength(0);
  });

  it("a buy bigger than cash counts the gap as new money deposited (cash never negative)", () => {
    const l = replayLedger([buy("AAPL", 10, 100, "2026-01-02")], [cash("starting", 300)]);
    expect(l.cash.USD ?? 0).toBeCloseTo(0);
    expect(l.autoDeposits).toHaveLength(1);
    expect(l.autoDeposits[0].amount).toBeCloseTo(700);
    expect(l.netDeposited).toBeCloseTo(1000); // 300 starting + 700 auto
  });

  it("uses cash held in another currency (converted) before adding new money", () => {
    // 3000 SAR = 800 USD at 3.75
    const l = replayLedger([buy("AAPL", 10, 100, "2026-01-02")], [cash("starting", 3000, "SAR")], { fx, base: "USD" });
    expect(l.cash.SAR ?? 0).toBeCloseTo(0);
    expect(l.autoDeposits[0].amount).toBeCloseTo(200);
    expect(l.autoDeposits[0].currency).toBe("USD");
  });

  it("withdrawals reduce cash and count as money taken out", () => {
    const l = replayLedger([], [cash("starting", 1000), cash("withdrawal", 400, "USD", "2026-02-01")]);
    expect(l.cash.USD).toBeCloseTo(600);
    expect(l.netDeposited).toBeCloseTo(600);
  });

  it("sell proceeds land in the stock's currency", () => {
    const l = replayLedger(
      [buy("VOD.L", 100, 1.1, "2026-01-02", { currency: "GBP" }), sell("VOD.L", 100, 1.2, "2026-02-02", { currency: "GBP" })],
      [cash("starting", 110, "GBP")],
    );
    expect(l.cash.GBP).toBeCloseTo(120);
  });
});

describe("valuePortfolio", () => {
  const symbols: Record<string, SymbolLike> = {
    AAPL: { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", currency: "USD" },
    NVDA: { ticker: "NVDA", name: "NVIDIA", sector: "Technology", currency: "USD" },
    JPM: { ticker: "JPM", name: "JPMorgan", sector: "Financials & Real Estate", currency: "USD" },
    XOM: { ticker: "XOM", name: "Exxon", sector: "Energy", currency: "USD" },
    "VOD.L": { ticker: "VOD.L", name: "Vodafone", sector: "Communication Services", currency: "GBP" },
    SPY: { ticker: "SPY", name: "SPDR S&P 500", sector: "Other", currency: "USD" },
  };
  const q = (ticker: string, price: number, change = 0, currency = "USD"): QuoteLike => ({ ticker, price, change, changePct: price ? (change / (price - change)) * 100 : 0, currency });

  it("worked example from the PRD: Technology 60%, Financials 20%, Energy 20%", () => {
    const l = replayLedger(
      [buy("AAPL", 10, 200, "2026-01-02"), buy("NVDA", 5, 100, "2026-01-02"), buy("JPM", 4, 200, "2026-01-02"), buy("XOM", 8, 100, "2026-01-02")],
      [],
    );
    const v = valuePortfolio(l, { AAPL: q("AAPL", 230), NVDA: q("NVDA", 140), JPM: q("JPM", 250), XOM: q("XOM", 125) }, symbols, fx, "USD");
    expect(v.totalValue).toBeCloseTo(5000);
    const w = Object.fromEntries(v.holdings.map((h) => [h.ticker, h.weight]));
    expect(w.AAPL).toBeCloseTo(46);
    expect(w.NVDA).toBeCloseTo(14);
    const s = Object.fromEntries(v.sectors.map((x) => [x.sector, x.weight]));
    expect(s["Technology"]).toBeCloseTo(60);
    expect(s["Financials & Real Estate"]).toBeCloseTo(20);
    expect(s["Energy"]).toBeCloseTo(20);
    expect(v.holdings.reduce((a, h) => a + h.weight, 0)).toBeCloseTo(100);
    expect(v.sectors.reduce((a, x) => a + x.weight, 0)).toBeCloseTo(100);
  });

  it("warnings: AAPL at 46% is red, Technology at 60% is red, Energy at 20% is OK", () => {
    const l = replayLedger([buy("AAPL", 10, 200, "2026-01-02"), buy("NVDA", 5, 100, "2026-01-02"), buy("JPM", 4, 200, "2026-01-02"), buy("XOM", 8, 100, "2026-01-02")], []);
    const v = valuePortfolio(l, { AAPL: q("AAPL", 230), NVDA: q("NVDA", 140), JPM: q("JPM", 250), XOM: q("XOM", 125) }, symbols, fx, "USD");
    expect(v.holdings.find((h) => h.ticker === "AAPL")?.warning).toBe("red");
    expect(v.holdings.find((h) => h.ticker === "NVDA")?.warning).toBe("yellow");
    expect(v.sectors.find((s) => s.sector === "Technology")?.warning).toBe("red");
    expect(v.sectors.find((s) => s.sector === "Energy")?.warning).toBe("ok");
  });

  it("includes cash in the total and as its own row so weights add to 100%", () => {
    const l = replayLedger([buy("AAPL", 10, 100, "2026-01-02")], [cash("starting", 3000)]);
    const v = valuePortfolio(l, { AAPL: q("AAPL", 100) }, symbols, fx, "USD");
    expect(v.cashValue).toBeCloseTo(2000);
    expect(v.totalValue).toBeCloseTo(3000);
    expect(v.holdings[0].weight).toBeCloseTo(33.333, 2);
    const cashRow = v.sectors.find((s) => s.sector === "Cash");
    expect(cashRow?.weight).toBeCloseTo(66.667, 2);
    expect(cashRow?.warning).toBe("none");
  });

  it("unrealized P/L in $ and %, and day change", () => {
    const l = replayLedger([buy("AAPL", 10, 100, "2026-01-02", { fees: 10 })], []);
    const v = valuePortfolio(l, { AAPL: q("AAPL", 120, 2) }, symbols, fx, "USD");
    const h = v.holdings[0];
    expect(h.unrealizedPL).toBeCloseTo(1200 - 1010);
    expect(h.unrealizedPLPct).toBeCloseTo((190 / 1010) * 100);
    expect(h.dayChange).toBeCloseTo(20);
    expect(v.dayChange).toBeCloseTo(20);
  });

  it("converts foreign stocks and cash into the base currency", () => {
    const l = replayLedger([buy("VOD.L", 1000, 1.0, "2026-01-02", { currency: "GBP" })], [cash("starting", 1000, "GBP")]);
    const v = valuePortfolio(l, { "VOD.L": q("VOD.L", 1.5, 0, "GBP") }, symbols, fx, "USD");
    // 1000 shares * 1.5 GBP = 1500 GBP = 2000 USD
    expect(v.holdings[0].value).toBeCloseTo(2000);
    expect(v.holdings[0].valueLocal).toBeCloseTo(1500);
    expect(v.totalValue).toBeCloseTo(2000);
    // in EUR: 1500 GBP / 0.75 * 0.9 = 1800 EUR
    const e = valuePortfolio(l, { "VOD.L": q("VOD.L", 1.5, 0, "GBP") }, symbols, fx, "EUR");
    expect(e.totalValue).toBeCloseTo(1800);
  });

  it("falls back to average cost when a price is missing, and says so", () => {
    const l = replayLedger([buy("AAPL", 10, 100, "2026-01-02")], []);
    const v = valuePortfolio(l, {}, symbols, fx, "USD");
    expect(v.holdings[0].price).toBe(100);
    expect(v.holdings[0].priceMissing).toBe(true);
  });

  it("hides closed positions and gives ETFs (Other) no sector warning", () => {
    const l = replayLedger([buy("AAPL", 5, 100, "2026-01-02"), sell("AAPL", 5, 110, "2026-01-03"), buy("SPY", 10, 500, "2026-01-02")], []);
    const v = valuePortfolio(l, { SPY: q("SPY", 500) }, symbols, fx, "USD");
    expect(v.holdings.map((h) => h.ticker)).toEqual(["SPY"]);
    expect(v.sectors.find((s) => s.sector === "Other")?.warning).toBe("none");
    expect(v.realizedPL).toBeCloseTo(50);
  });

  it("an empty portfolio is all zeros, not NaN", () => {
    const v = valuePortfolio(replayLedger([], []), {}, symbols, fx, "USD");
    expect(v.totalValue).toBe(0);
    expect(v.holdings).toHaveLength(0);
    expect(Number.isNaN(v.dayChangePct)).toBe(false);
  });
});

describe("warning thresholds", () => {
  it("stock: above 10% yellow, above 20% red", () => {
    expect(stockWarning(10)).toBe("ok");
    expect(stockWarning(10.01)).toBe("yellow");
    expect(stockWarning(20)).toBe("yellow");
    expect(stockWarning(20.01)).toBe("red");
  });
  it("sector: above 25% yellow, above 40% red", () => {
    expect(sectorWarning("Energy", 25)).toBe("ok");
    expect(sectorWarning("Energy", 25.1)).toBe("yellow");
    expect(sectorWarning("Energy", 40.1)).toBe("red");
    expect(sectorWarning("Other", 90)).toBe("none");
    expect(sectorWarning("Cash", 90)).toBe("none");
  });
});

describe("maxSellable", () => {
  it("returns shares owned on a date, ignoring the transaction being edited", () => {
    const txns = [buy("AAPL", 10, 100, "2026-01-02"), sell("AAPL", 4, 100, "2026-02-01")];
    expect(maxSellable(txns, "AAPL", "2026-03-01")).toBe(6);
    expect(maxSellable(txns, "AAPL", "2026-01-15")).toBe(10);
    expect(maxSellable(txns, "AAPL", "2026-03-01", txns[1].id)).toBe(10);
    expect(maxSellable(txns, "MSFT", "2026-03-01")).toBe(0);
  });
});
