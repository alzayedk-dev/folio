import { describe, expect, it } from "vitest";
import { money, pct } from "../format";

describe("money", () => {
  it("always shows 2 decimals for normal currencies", () => {
    expect(money(3854.7, "USD")).toBe("$3,854.70");
    expect(money(10000, "USD")).toBe("$10,000.00");
    expect(money(9.5, "USD")).toBe("$9.50");
  });
  it("uses 0 decimals for yen and 3 for dinars", () => {
    expect(money(3414, "JPY")).toBe("¥3,414");
    expect(money(1.5, "KWD")).toContain("1.500");
  });
  it("shows signs when asked and a dash for missing values", () => {
    expect(money(12.3, "USD", { sign: true })).toBe("+$12.30");
    expect(money(-12.3, "USD", { sign: true })).toBe("-$12.30");
    expect(money(null, "USD")).toBe("—");
  });
});

describe("pct", () => {
  it("formats percentages", () => {
    expect(pct(42.6845)).toBe("42.7%");
    expect(pct(5, { sign: true })).toBe("+5.0%");
    expect(pct(undefined)).toBe("—");
  });
});
