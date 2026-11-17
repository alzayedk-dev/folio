import { describe, expect, it } from "vitest";
import { COINS, GRAMS_PER_TROY_OUNCE, barFineOz, coinHoldings, coinsFor, customFineOz, findCoin, fromOunces, purityLabel, toOunces, toPricePerOunce, fromPricePerOunce } from "../metals";

const gramsPure = (oz: number) => oz * GRAMS_PER_TROY_OUNCE;

describe("coin list", () => {
  it("has the pure gold content of a Turkish quarter lira (1.754 g × 22k ≈ 1.61 g)", () => {
    expect(gramsPure(findCoin("tr_quarter")!.fineOz)).toBeCloseTo(1.607, 2);
  });
  it("matches the official pure content of an English lira (Sovereign) and Saudi Guinea (7.32 g)", () => {
    expect(gramsPure(findCoin("sovereign")!.fineOz)).toBeCloseTo(7.32, 1);
    expect(findCoin("saudi_guinea")!.fineOz).toBeCloseTo(findCoin("sovereign")!.fineOz, 6);
  });
  it("treats 1 oz bullion coins as exactly one troy ounce of pure metal", () => {
    for (const code of ["krugerrand", "gold_eagle", "gold_maple", "silver_eagle"]) expect(findCoin(code)!.fineOz).toBe(1);
  });
  it("lists gold and silver coins separately, with unique codes", () => {
    expect(coinsFor("gold").every((c) => c.metal === "gold")).toBe(true);
    expect(coinsFor("silver").length).toBeGreaterThan(0);
    expect(new Set(COINS.map((c) => c.code)).size).toBe(COINS.length);
  });
});

describe("pure weight", () => {
  it("bars: weight × purity (100 g of 21k = 87.5 g pure)", () => {
    expect(gramsPure(barFineOz(100, "g", 0.875))).toBeCloseTo(87.5, 6);
  });
  it("grams and ounces convert both ways", () => {
    expect(fromOunces(toOunces(31.1034768, "g"), "oz")).toBeCloseTo(1, 9);
    expect(fromPricePerOunce(toPricePerOunce(120, "g"), "g")).toBeCloseTo(120, 6);
  });
  it("custom coins: count × grams × purity", () => {
    expect(gramsPure(customFineOz(3, 8, 0.9))).toBeCloseTo(21.6, 6);
  });
  it("labels purities in plain words", () => {
    expect(purityLabel("gold", 0.875)).toBe("21k (87.5%)");
    expect(purityLabel("silver", 0.925)).toBe("Sterling (925)");
    expect(purityLabel("gold", 0.9)).toBe("90%");
  });
});

describe("coins still held", () => {
  it("adds buys and subtracts sells per coin, ignoring bars and stocks", () => {
    const held = coinHoldings([
      { ticker: "GC=F", type: "buy", metalForm: "coin", coinCode: "tr_quarter", coinCount: 5 },
      { ticker: "GC=F", type: "sell", metalForm: "coin", coinCode: "tr_quarter", coinCount: 1 },
      { ticker: "GC=F", type: "buy", metalForm: "coin", coinCode: "sovereign", coinCount: 2 },
      { ticker: "GC=F", type: "buy", metalForm: "bar", coinCount: null },
      { ticker: "GC=F", type: "buy", metalForm: "custom", coinCount: 3, coinGrams: 8, purity: 0.9 },
      { ticker: "AAPL", type: "buy", coinCount: 7 },
    ]);
    expect(held["GC=F"]).toEqual([
      { label: "Turkish Quarter Lira (Çeyrek)", count: 4 },
      { label: "English Lira (Sovereign)", count: 2 },
      { label: "Custom Coin (8 g, 90%)", count: 3 },
    ]);
    expect(held.AAPL).toBeUndefined();
  });
  it("drops coins that were all sold", () => {
    const held = coinHoldings([
      { ticker: "SI=F", type: "buy", metalForm: "coin", coinCode: "silver_eagle", coinCount: 2 },
      { ticker: "SI=F", type: "sell", metalForm: "coin", coinCode: "silver_eagle", coinCount: 2 },
    ]);
    expect(held["SI=F"]).toBeUndefined();
  });
});
