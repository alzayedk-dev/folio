import { describe, expect, it } from "vitest";
import { transactionSchema, txnMessages, latestTradeDate } from "../validation";

const base = { ticker: "lly", type: "buy", shares: "10", price: "780.5", fees: "", tradeDate: "2026-11-01", notes: "" };
const firstError = (input: Record<string, unknown>) => transactionSchema.safeParse(input).error?.issues[0]?.message;

describe("transactionSchema", () => {
  it("accepts a valid buy and normalises values", () => {
    const r = transactionSchema.parse(base);
    expect(r).toMatchObject({ ticker: "LLY", type: "buy", shares: 10, price: 780.5, fees: 0, amount: null });
  });
  it("accepts a dividend with only an amount", () => {
    const r = transactionSchema.parse({ ...base, type: "dividend", shares: "", price: "", amount: "12.40" });
    expect(r.amount).toBe(12.4);
  });
  it("rejects zero or missing shares for buys and sells", () => {
    expect(firstError({ ...base, shares: "0" })).toBe(txnMessages.shares);
    expect(firstError({ ...base, type: "sell", shares: "" })).toBe(txnMessages.shares);
  });
  it("rejects a negative price and negative fees", () => {
    expect(firstError({ ...base, price: "-1" })).toBe(txnMessages.price);
    expect(firstError({ ...base, fees: "-2" })).toBe(txnMessages.fees);
  });
  it("rejects text where numbers belong", () => {
    expect(transactionSchema.safeParse({ ...base, shares: "ten" }).success).toBe(false);
  });
  it("rejects future dates but allows today", () => {
    expect(firstError({ ...base, tradeDate: "2999-01-01" })).toBe(txnMessages.date);
    expect(transactionSchema.safeParse({ ...base, tradeDate: new Date().toISOString().slice(0, 10) }).success).toBe(true);
    expect(latestTradeDate(new Date("2026-11-17T12:00:00Z"))).toBe("2026-11-18");
  });
  it("rejects a dividend without an amount", () => {
    expect(firstError({ ...base, type: "dividend", amount: "" })).toBe(txnMessages.amount);
  });
  it("rejects bad tickers and very long notes", () => {
    expect(firstError({ ...base, ticker: "<script>" })).toBe(txnMessages.ticker);
    expect(firstError({ ...base, notes: "x".repeat(501) })).toBe(txnMessages.notes);
  });
});
