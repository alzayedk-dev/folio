import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../snapshot";
import { replayLedger, valuePortfolio, type Txn, type CashEntry } from "../portfolio";
import { buildDailySeries } from "../performance";
import type { FxTable } from "../market";

const fx: FxTable = { base: "USD", date: "2026-11-17", rates: { USD: 1 } };
const t = (ticker: string, shares: number, price: number): Txn => ({ id: ticker, ticker, type: "buy", shares, price, amount: null, fees: 0, currency: "USD", tradeDate: "2026-01-02", createdAt: "2026-01-02T00:00:00Z" });
const cash: CashEntry[] = [{ id: "c", kind: "starting", amount: 5000, currency: "USD", entryDate: "2026-01-01" }];
const symbols = {
  AAA: { ticker: "AAA", name: "Alpha", sector: "Technology", currency: "USD" },
  BBB: { ticker: "BBB", name: "Beta", sector: "Energy", currency: "USD" },
};

function make() {
  const txns = [t("AAA", 30, 100), t("BBB", 10, 100)];
  const v = valuePortfolio(replayLedger(txns, cash), { AAA: { ticker: "AAA", price: 100, change: 0, changePct: 0, currency: "USD" }, BBB: { ticker: "BBB", price: 100, change: 0, changePct: 0, currency: "USD" } }, symbols, fx, "USD");
  const { points } = buildDailySeries({ txns, cash, history: { AAA: [{ date: "2026-01-02", close: 100 }], BBB: [{ date: "2026-01-02", close: 100 }] }, fx, base: "USD", today: "2026-03-01" });
  return buildSnapshot(v, points, "2026-03-01");
}

describe("buildSnapshot", () => {
  it("gives weights of invested assets only (cash excluded), summing to 100", () => {
    const s = make();
    expect(s.holdings.map((h) => [h.ticker, h.weight])).toEqual([["AAA", 75], ["BBB", 25]]);
    expect(s.sectors).toEqual([{ sector: "Technology", weight: 75 }, { sector: "Energy", weight: 25 }]);
    expect(s.holdings_count).toBe(2);
  });

  it("never contains amounts, share counts, prices or cash", () => {
    const json = JSON.stringify(make());
    for (const banned of ["value", "shares", "price", "cash", "avgCost", "costBasis", "amount", "5000", "3000"]) {
      expect(json.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it("includes returns and a light weekly performance line", () => {
    const s = make();
    expect(s.returns.all).toBe(0);
    expect(s.performance.length).toBeLessThan(15);
    expect(s.performance.at(-1)!.date).toBe("2026-03-01");
  });
});
