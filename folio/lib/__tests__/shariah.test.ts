import { describe, expect, it } from "vitest";
import { screen, type ShariahFacts } from "../shariah";

const facts = (over: Partial<ShariahFacts>): ShariahFacts => ({
  ticker: "TEST",
  found: true,
  quote_type: "EQUITY",
  industry: "Semiconductors",
  yahoo_sector: "Technology",
  total_debt: 10,
  cash_investments: 10,
  market_cap: 100,
  data_date: "2026-09-30",
  ...over,
});

describe("Shariah screening (AAOIFI)", () => {
  it("passes an allowed business with low debt and cash", () => {
    const r = screen("TEST", facts({ total_debt: 29.9, cash_investments: 10 }));
    expect(r.status).toBe("compliant");
    expect(r.rules.find((x) => x.key === "debt")).toMatchObject({ value: "29.9%", limit: "Under 30%", result: "pass" });
    expect(r.rules.find((x) => x.key === "income")?.result).toBe("unknown");
    expect(r.dataDate).toBe("2026-09-30");
  });
  it("fails banks, brewers, casinos and tobacco on business activity", () => {
    for (const industry of ["Banks - Diversified", "Beverages - Brewers", "Resorts & Casinos", "Tobacco", "Insurance - Life"]) {
      expect(screen("X", facts({ industry })).status, industry).toBe("not_compliant");
    }
  });
  it("fails a known pork producer even though its industry looks fine", () => {
    expect(screen("HRL", facts({ industry: "Packaged Foods" })).status).toBe("not_compliant");
  });
  it("marks mixed-income businesses as doubtful", () => {
    expect(screen("MAR", facts({ industry: "Lodging" })).status).toBe("doubtful");
    expect(screen("O", facts({ industry: "REIT - Retail" })).status).toBe("doubtful");
  });
  it("fails when debt or interest-earning cash reach 30%", () => {
    const debt = screen("X", facts({ total_debt: 35 }));
    expect(debt.status).toBe("not_compliant");
    expect(debt.summary).toMatch(/Debt is above 30%/);
    expect(screen("X", facts({ cash_investments: 30 })).status).toBe("not_compliant");
  });
  it("a bad ratio beats a mixed business (Not Compliant, not Doubtful)", () => {
    expect(screen("LVS", facts({ industry: "Lodging", total_debt: 62 })).status).toBe("not_compliant");
  });
  it("is doubtful when financial data is missing", () => {
    expect(screen("X", facts({ total_debt: null })).status).toBe("doubtful");
    expect(screen("X", facts({ market_cap: 0 })).status).toBe("doubtful");
  });
  it("reads numbers stored as text (Postgres numeric)", () => {
    expect(screen("X", facts({ total_debt: "5", cash_investments: "2", market_cap: "100" })).status).toBe("compliant");
  });
  it("does not screen funds, metals or unknown tickers, except Shariah ETFs", () => {
    expect(screen("SPY", facts({ quote_type: "ETF", industry: null })).status).toBe("not_screened");
    expect(screen("GC=F", null).status).toBe("not_screened");
    expect(screen("ZZZZ", facts({ found: false })).status).toBe("not_screened");
    expect(screen("ZZZZ", null).status).toBe("not_screened");
    const spus = screen("SPUS", facts({ quote_type: "ETF" }));
    expect(spus).toMatchObject({ status: "compliant", label: "Compliant (Shariah ETF)" });
  });
  it("uses Financial Services sector as doubtful when the industry is missing", () => {
    expect(screen("X", facts({ industry: null, yahoo_sector: "Financial Services" })).status).toBe("doubtful");
  });
});
