import { describe, expect, it } from "vitest";
import { convert, type FxTable } from "../market";

const fx: FxTable = { base: "USD", date: "2026-11-17", rates: { GBP: 0.75, EUR: 0.9, SAR: 3.75, KWD: 0.31 } };

describe("convert", () => {
  it("returns the same amount for the same currency", () => expect(convert(100, "USD", "USD", fx)).toBe(100));
  it("converts USD to other currencies", () => expect(convert(100, "USD", "SAR", fx)).toBeCloseTo(375));
  it("converts other currencies to USD", () => expect(convert(75, "GBP", "USD", fx)).toBeCloseTo(100));
  it("converts between two non-USD currencies", () => expect(convert(375, "SAR", "EUR", fx)).toBeCloseTo(90));
  it("returns null when a rate is missing", () => {
    expect(convert(1, "XYZ", "USD", fx)).toBeNull();
    expect(convert(1, "GBP", "USD", null)).toBeNull();
  });
});
