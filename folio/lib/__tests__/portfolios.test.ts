import { describe, expect, it } from "vitest";
import { newPortfolioSchema, pickPortfolio, portfolioMessages, sameName, sortPortfolios } from "../portfolios";

const list = [
  { id: "b", position: 1, created_at: "2026-11-17T10:00:00Z" },
  { id: "a", position: 0, created_at: "2026-11-17T11:00:00Z" },
];

describe("portfolio selection", () => {
  it("uses the saved choice when it is still one of the user's portfolios", () => {
    expect(pickPortfolio(list, "b")?.id).toBe("b");
  });
  it("falls back to the first portfolio for a missing, deleted or someone else's id", () => {
    expect(pickPortfolio(sortPortfolios(list), undefined)?.id).toBe("a");
    expect(pickPortfolio(sortPortfolios(list), "someone-elses")?.id).toBe("a");
    expect(pickPortfolio([], "a")).toBeNull();
  });
  it("sorts by position, then creation time", () => {
    expect(sortPortfolios(list).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("new portfolio form", () => {
  it("accepts a Real portfolio without starting cash", () => {
    expect(newPortfolioSchema.parse({ name: " Retirement ", kind: "real", startingCash: "", currency: "USD" })).toMatchObject({ name: "Retirement", startingCash: 0 });
  });
  it("requires pretend cash for a Paper portfolio", () => {
    const r = newPortfolioSchema.safeParse({ name: "Growth Lab", kind: "paper", startingCash: "", currency: "USD" });
    expect(r.error?.issues[0].message).toBe(portfolioMessages.paperCash);
    expect(newPortfolioSchema.parse({ name: "Growth Lab", kind: "paper", startingCash: "10000", currency: "USD" }).startingCash).toBe(10000);
  });
  it("rejects empty or long names, negative cash and unknown currencies", () => {
    expect(newPortfolioSchema.safeParse({ name: "  ", kind: "real", currency: "USD" }).success).toBe(false);
    expect(newPortfolioSchema.safeParse({ name: "x".repeat(41), kind: "real", currency: "USD" }).success).toBe(false);
    expect(newPortfolioSchema.safeParse({ name: "A", kind: "real", startingCash: "-5", currency: "USD" }).success).toBe(false);
    expect(newPortfolioSchema.safeParse({ name: "A", kind: "real", currency: "BTC" }).success).toBe(false);
    expect(newPortfolioSchema.safeParse({ name: "A", kind: "simulation", currency: "USD" }).success).toBe(false);
  });
  it("treats names that differ only by case or spaces as the same", () => {
    expect(sameName(" Growth Lab", "growth lab ")).toBe(true);
    expect(sameName("Growth", "Growth Lab")).toBe(false);
  });
});
