import { describe, expect, it } from "vitest";
import { buildDailySeries, rangeStart, sliceRange, rangeStats, rebaseBenchmark, addDays } from "../performance";
import type { Txn, CashEntry } from "../portfolio";
import type { FxTable } from "../market";

const fx: FxTable = { base: "USD", date: "2026-11-17", rates: { USD: 1, GBP: 0.75 } };
let n = 0;
const buy = (ticker: string, shares: number, price: number, date: string, extra: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`, ticker, type: "buy", shares, price, amount: null, fees: 0, currency: "USD", tradeDate: date, createdAt: `${date}T00:00:00Z`, ...extra,
});
const cash = (kind: CashEntry["kind"], amount: number, date: string, currency = "USD"): CashEntry => ({ id: `c${++n}`, kind, amount, currency, entryDate: date });

describe("addDays", () => {
  it("moves across month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("buildDailySeries", () => {
  it("values holdings at each day's close and returns +100% when the price doubles", () => {
    const s = buildDailySeries({
      txns: [buy("AAA", 10, 100, "2026-01-01")],
      cash: [],
      history: { AAA: [{ date: "2026-01-01", close: 100 }, { date: "2026-01-02", close: 150 }, { date: "2026-01-03", close: 200 }] },
      fx,
      base: "USD",
      today: "2026-01-03",
    });
    expect(s.points.map((p) => p.value)).toEqual([1000, 1500, 2000]);
    expect(s.points.at(-1)!.index).toBeCloseTo(2); // +100%
  });

  it("fills weekends and holidays with the last known price", () => {
    const s = buildDailySeries({
      txns: [buy("AAA", 1, 100, "2026-01-02")],
      cash: [],
      history: { AAA: [{ date: "2026-01-02", close: 100 }, { date: "2026-01-05", close: 110 }] },
      fx,
      base: "USD",
      today: "2026-01-05",
    });
    expect(s.points.map((p) => [p.date, p.value])).toEqual([
      ["2026-01-02", 100],
      ["2026-01-03", 100],
      ["2026-01-04", 100],
      ["2026-01-05", 110],
    ]);
  });

  it("money added does NOT count as a gain (time-weighted return)", () => {
    // $1,000 cash, then a balance update to $3,000 (= $2,000 deposited); nothing else changes
    const s = buildDailySeries({
      txns: [],
      cash: [cash("starting", 1000, "2026-01-01"), cash("balance", 3000, "2026-01-03")],
      history: {},
      fx,
      base: "USD",
      today: "2026-01-04",
    });
    expect(s.points.at(-1)!.value).toBeCloseTo(3000);
    expect(s.points.at(-1)!.index).toBeCloseTo(1); // 0% return
    expect(s.points.find((p) => p.date === "2026-01-03")!.flow).toBeCloseTo(2000);
  });

  it("a buy paid with new money is a deposit, then price moves are the return", () => {
    // No cash: buying $1,000 of AAA counts as $1,000 deposited; price +10% → +10%
    const s = buildDailySeries({
      txns: [buy("AAA", 10, 100, "2026-01-01")],
      cash: [],
      history: { AAA: [{ date: "2026-01-01", close: 100 }, { date: "2026-01-02", close: 110 }] },
      fx,
      base: "USD",
      today: "2026-01-02",
    });
    expect(s.points[0].flow).toBeCloseTo(1000);
    expect(s.points.at(-1)!.index).toBeCloseTo(1.1);
  });

  it("converts foreign holdings to the base currency", () => {
    const s = buildDailySeries({
      txns: [buy("VOD.L", 100, 1.5, "2026-01-01", { currency: "GBP" })],
      cash: [],
      history: { "VOD.L": [{ date: "2026-01-01", close: 1.5 }] },
      fx,
      base: "USD",
      today: "2026-01-01",
    });
    expect(s.points[0].value).toBeCloseTo(200); // 150 GBP / 0.75
  });

  it("uses the trade price before the first stored close", () => {
    const s = buildDailySeries({
      txns: [buy("AAA", 2, 50, "2026-01-01")],
      cash: [],
      history: { AAA: [{ date: "2026-01-03", close: 60 }] },
      fx,
      base: "USD",
      today: "2026-01-03",
    });
    expect(s.points.map((p) => p.value)).toEqual([100, 100, 120]);
  });

  it("returns no points for an empty portfolio", () => {
    expect(buildDailySeries({ txns: [], cash: [], history: {}, fx, base: "USD", today: "2026-01-03" }).points).toHaveLength(0);
  });
});

describe("ranges and stats", () => {
  const points = Array.from({ length: 400 }, (_, i) => {
    const date = addDays("2025-10-13", i);
    return { date, value: 1000 + i, flow: i === 0 ? 1000 : 0, index: (1000 + i) / 1000, dailyReturn: i === 0 ? 0 : 1 / (999 + i) };
  });
  const today = points.at(-1)!.date; // 2026-11-16

  it("picks range start dates", () => {
    expect(rangeStart("1M", today, points[0].date)).toBe("2026-10-16");
    expect(rangeStart("YTD", today, points[0].date)).toBe("2026-01-01");
    expect(rangeStart("1Y", today, points[0].date)).toBe("2025-11-16");
    expect(rangeStart("5Y", today, points[0].date)).toBe(points[0].date); // clamps to first trade
    expect(rangeStart("ALL", today, points[0].date)).toBe(points[0].date);
  });

  it("slices and computes return, value change, best and worst day", () => {
    const sl = sliceRange(points, "2026-10-16");
    expect(sl[0].date).toBe("2026-10-16");
    const st = rangeStats(sl);
    expect(st.returnPct).toBeCloseTo((sl.at(-1)!.index / sl[0].index - 1) * 100);
    expect(st.valueChange).toBeCloseTo(sl.at(-1)!.value - sl[0].value);
    expect(st.best!.date).toBe(sl[1].date); // biggest daily % is the earliest (smallest base)
    expect(st.worst!.date).toBe(sl.at(-1)!.date);
  });

  it("rebases a benchmark to 0% at the range start", () => {
    const closes = [
      { date: "2026-01-01", close: 400 },
      { date: "2026-01-02", close: 440 },
      { date: "2026-01-05", close: 380 },
    ];
    const b = rebaseBenchmark(closes, ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"]);
    expect(b.map((x) => Math.round(x.pct * 10) / 10)).toEqual([0, 10, 10, 10, -5]);
  });
});
