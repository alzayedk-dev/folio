import { describe, expect, it } from "vitest";
import { fromOunces, fromPricePerOunce, isMetal, metalTicker, toOunces, toPricePerOunce, GRAMS_PER_TROY_OUNCE } from "../metals";

describe("metals helpers", () => {
  it("knows which tickers are metals", () => {
    expect(isMetal("GC=F")).toBe(true);
    expect(isMetal("SI=F")).toBe(true);
    expect(isMetal("AAPL")).toBe(false);
    expect(metalTicker("gold")).toBe("GC=F");
  });
  it("converts grams to troy ounces and back", () => {
    expect(toOunces(100, "g")).toBeCloseTo(3.2151, 4);
    expect(toOunces(2, "oz")).toBe(2);
    expect(fromOunces(1, "g")).toBeCloseTo(31.1035, 4);
    expect(fromOunces(toOunces(250, "g"), "g")).toBeCloseTo(250);
  });
  it("converts price per gram to price per ounce and back", () => {
    expect(toPricePerOunce(80, "g")).toBeCloseTo(80 * GRAMS_PER_TROY_OUNCE);
    expect(fromPricePerOunce(3110.34768, "g")).toBeCloseTo(100);
    expect(toPricePerOunce(2500, "oz")).toBe(2500);
  });
  it("cost is the same whichever unit is used", () => {
    const grams = 50, perGram = 85;
    const costInGrams = grams * perGram;
    const costInOunces = toOunces(grams, "g") * toPricePerOunce(perGram, "g");
    expect(costInOunces).toBeCloseTo(costInGrams);
  });
});
