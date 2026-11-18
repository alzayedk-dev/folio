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

  it("starting cash is a balance check-point: older back-dated trades don't change it", () => {
    // Signed up today with $10,000 in the account, then recorded older trades
    const l = replayLedger(
      [buy("LLY", 10, 780, "2025-11-03", { fees: 4.95 }), dividend("LLY", 9, "2026-03-10"), sell("LLY", 4, 900, "2026-06-15", { fees: 4.95 })],
      [cash("starting", 10000, "USD", "2026-11-17")],
    );
    expect(l.cash.USD).toBeCloseTo(10000);
    // A trade after the check-point moves cash from there
    const later = replayLedger([buy("AAPL", 1, 200, "2026-11-20")], [cash("starting", 10000, "USD", "2026-11-17")]);
    expect(later.cash.USD).toBeCloseTo(9800);
  });

  it("a balance check-point replaces balances in other currencies too", () => {
    const l = replayLedger(
      [buy("VOD.L", 100, 1, "2026-01-02", { currency: "GBP" }), sell("VOD.L", 100, 1.2, "2026-02-02", { currency: "GBP" })],
      [cash("starting", 500, "USD", "2026-03-01")],
      { fx, base: "USD" },
    );
    expect(l.cash).toEqual({ USD: 500 });
  });

  it("a later balance update (Cash card) resets cash; the change counts as money moved", () => {
    const l = replayLedger([buy("AAPL", 1, 100, "2026-02-01")], [cash("starting", 1000), cash("balance", 600, "USD", "2026-03-01")]);
    expect(l.cash.USD).toBeCloseTo(600);
    // 1000 in, then 900 left after the buy, then set to 600 = 300 withdrawn
    expect(l.netDeposited).toBeCloseTo(700);
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

  it("a buy paid with new money (linked deposit) leaves cash untouched; from cash reduces it", () => {
    const start = cash("starting", 1000, "USD", "2026-01-01");
    const t1 = buy("AAPL", 5, 100, "2026-02-01");
    const linked = { ...cash("deposit", 500, "USD", "2026-02-01"), txnId: t1.id };
    expect(replayLedger([t1], [start, linked]).cash.USD).toBeCloseTo(1000);
    expect(replayLedger([t1], [start]).cash.USD).toBeCloseTo(500);
  });

  it("converts Kuwaiti dinar stocks (500 × 0.765 KWD = 382.50 KWD = 1,275 USD at 0.3)", () => {
    const l = replayLedger([buy("KFH.KW", 500, 0.765, "2026-11-18", { currency: "KWD" })], []);
    const v = valuePortfolio(l, { "KFH.KW": q("KFH.KW", 0.765, 0, "KWD") }, symbols, fx, "USD");
    expect(v.holdings[0].valueLocal).toBeCloseTo(382.5);
    expect(v.holdings[0].value).toBeCloseTo(1275);
    expect(v.holdings[0].fxMissing).toBe(false);
  });

  it("never shows an unconverted amount as dollars when an exchange rate is missing", () => {
    const l = replayLedger([buy("AAPL", 1, 100, "2026-01-02"), buy("XYZ.QQ", 100, 50, "2026-01-02", { currency: "QQQ" })], []);
    const v = valuePortfolio(l, { AAPL: q("AAPL", 100), "XYZ.QQ": q("XYZ.QQ", 50, 0, "QQQ") }, symbols, fx, "USD");
    const odd = v.holdings.find((h) => h.ticker === "XYZ.QQ")!;
    expect(odd.fxMissing).toBe(true);
    expect(odd.value).toBe(0); // left out of USD totals
    expect(odd.valueLocal).toBe(5000); // still shown in its own currency
    expect(odd.warning).toBe("none");
    expect(v.totalValue).toBeCloseTo(100);
    expect(v.fxMissing).toEqual(["QQQ"]);
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

  it("precious metals count in value and P/L, split out as their own asset, with no concentration warning", () => {
    const syms: Record<string, SymbolLike> = { ...symbols, "GC=F": { ticker: "GC=F", name: "Gold", sector: "Precious Metals", currency: "USD" } };
    // 2 oz gold bought at $2,000/oz, now $2,500/oz; plus $1,000 of AAPL; no cash
    const l = replayLedger([buy("GC=F", 2, 2000, "2026-01-02"), buy("AAPL", 10, 100, "2026-01-02")], []);
    const v = valuePortfolio(l, { "GC=F": q("GC=F", 2500), AAPL: q("AAPL", 100) }, syms, fx, "USD");
    expect(v.metalsValue).toBeCloseTo(5000);
    expect(v.stocksValue).toBeCloseTo(1000);
    expect(v.totalValue).toBeCloseTo(6000);
    const gold = v.holdings.find((h) => h.ticker === "GC=F")!;
    expect(gold.unrealizedPL).toBeCloseTo(1000);
    expect(gold.weight).toBeCloseTo(83.33, 1);
    expect(gold.warning).toBe("none");
    expect(v.sectors.find((s) => s.sector === "Precious Metals")?.warning).toBe("none");
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

describe("same-day cash entries", () => {
  it("apply in the order they were recorded (starting cash, then a deposit for a buy)", () => {
    const start = { id: "zzz", kind: "starting" as const, amount: 1000, currency: "USD", entryDate: "2026-11-18", createdAt: "2026-11-18T07:59:07Z" };
    const t = buy("GLD", 1, 1211.7, "2026-11-18");
    const dep = { id: "aaa", kind: "deposit" as const, amount: 1211.7, currency: "USD", entryDate: "2026-11-18", createdAt: "2026-11-18T07:59:33Z", txnId: t.id };
    // "aaa" would sort before "zzz" by id alone; recorded time puts the deposit after the starting cash
    expect(replayLedger([t], [dep, start]).cash.USD).toBeCloseTo(1000);
  });
});

describe("same-day order: as recorded", () => {
  it("a cash balance entered after today's buys is the final balance (the $10,000 case)", () => {
    const morning = { ...buy("KFH.KW", 500, 0.765, "2026-11-18", { currency: "USD" }), createdAt: "2026-11-18T07:39:12Z" };
    const silver = { ...buy("SI=F", 6.4, 46.03, "2026-11-18"), createdAt: "2026-11-18T08:06:56.611Z" };
    const silverDeposit = { id: "dep1", kind: "deposit" as const, amount: 6.4 * 46.03, currency: "USD", entryDate: "2026-11-18", createdAt: "2026-11-18T08:06:56.680Z", txnId: silver.id };
    const balance = { id: "bal1", kind: "balance" as const, amount: 10000, currency: "USD", entryDate: "2026-11-18", createdAt: "2026-11-18T08:07:12Z" };
    const start = { id: "s0", kind: "balance" as const, amount: 20000, currency: "USD", entryDate: "2026-11-17", createdAt: "2026-11-17T20:29:58Z" };
    const l = replayLedger([morning, silver], [start, silverDeposit, balance]);
    expect(l.cash.USD).toBeCloseTo(10000);
  });
  it("a new-money deposit always lands just before its own buy, even when cash is short", () => {
    const t = { ...buy("AAPL", 2, 100, "2026-11-18"), createdAt: "2026-11-18T09:00:00.000Z" };
    const dep = { id: "d", kind: "deposit" as const, amount: 200, currency: "USD", entryDate: "2026-11-18", createdAt: "2026-11-18T09:00:00.050Z", txnId: t.id };
    const l = replayLedger([t], [dep]);
    expect(l.cash.USD ?? 0).toBeCloseTo(0);
    expect(l.autoDeposits).toHaveLength(0);
  });
});

describe("back-filled trades after setting a balance", () => {
  const bal = { id: "b1", kind: "balance" as const, amount: 10000, currency: "USD", entryDate: "2026-11-18", createdAt: "2026-11-18T08:07:12Z" };
  const add500 = { id: "d1", kind: "deposit" as const, amount: 500, currency: "USD", entryDate: "2026-11-18", createdAt: "2026-11-18T08:23:42Z" };
  const add200 = { id: "d2", kind: "deposit" as const, amount: 200, currency: "USD", entryDate: "2026-11-18", createdAt: "2026-11-18T09:46:32Z" };
  it("a buy from cash entered after the balance reduces today's cash even if it's dated earlier", () => {
    const spcx = { ...buy("SPCX", 40, 155, "2026-08-18"), createdAt: "2026-11-18T09:47:27Z" };
    const l = replayLedger([spcx], [bal, add500, add200]);
    expect(l.cash.USD).toBeCloseTo(10700 - 6200);
    expect(l.positions.SPCX.shares).toBe(40); // shares still count from August
  });
  it("a buy larger than the cash uses it all and counts the rest as new money (Micron: 15 × 760 vs 10,700)", () => {
    const mu = { ...buy("MU", 15, 760, "2026-11-09"), createdAt: "2026-11-18T10:00:00Z" };
    const l = replayLedger([mu], [bal, add500, add200]);
    expect(l.cash.USD ?? 0).toBeCloseTo(0);
    expect(l.autoDeposits[0].amount).toBeCloseTo(700);
  });
  it("a back-filled buy paid with new money leaves today's cash alone", () => {
    const nok = { ...buy("NOK", 100, 7.59, "2026-11-10"), createdAt: "2026-11-18T10:05:00.000Z" };
    const dep = { id: "d3", kind: "deposit" as const, amount: 759, currency: "USD", entryDate: "2026-11-10", createdAt: "2026-11-18T10:05:00.060Z", txnId: nok.id };
    const l = replayLedger([nok], [bal, add500, add200, dep]);
    expect(l.cash.USD).toBeCloseTo(10700);
  });
  it("trades recorded before the balance are still covered by it", () => {
    const lly = { ...buy("LLY", 20, 1100, "2026-07-17"), createdAt: "2026-11-17T20:16:32Z" };
    expect(replayLedger([lly], [bal]).cash.USD).toBeCloseTo(10000);
  });
});
