import { describe, expect, it } from "vitest";
import { mapSector, SECTORS } from "../../supabase/functions/market/sectors";
import { cleanTicker, isUsTicker, normalizeCurrency, toFinnhubSymbol, toMajor } from "../../supabase/functions/market/currency";

describe("mapSector", () => {
  it("has 9 main sectors plus Other", () => expect(SECTORS).toHaveLength(10));

  it("maps Yahoo sectors", () => {
    expect(mapSector({ yahooSector: "Technology" })).toBe("Technology");
    expect(mapSector({ yahooSector: "Financial Services" })).toBe("Financials & Real Estate");
    expect(mapSector({ yahooSector: "Real Estate" })).toBe("Financials & Real Estate");
    expect(mapSector({ yahooSector: "Consumer Cyclical" })).toBe("Consumer Discretionary");
    expect(mapSector({ yahooSector: "Consumer Defensive" })).toBe("Consumer Staples");
    expect(mapSector({ yahooSector: "Basic Materials" })).toBe("Industrials & Materials");
    expect(mapSector({ yahooSector: "Communication Services" })).toBe("Communication Services");
  });

  it("maps Finnhub industries", () => {
    expect(mapSector({ industry: "Semiconductors" })).toBe("Technology");
    expect(mapSector({ industry: "Pharmaceuticals" })).toBe("Healthcare");
    expect(mapSector({ industry: "Banking" })).toBe("Financials & Real Estate");
    expect(mapSector({ industry: "Hotels, Restaurants & Leisure" })).toBe("Consumer Discretionary");
    expect(mapSector({ industry: "Beverages" })).toBe("Consumer Staples");
    expect(mapSector({ industry: "Aerospace & Defense" })).toBe("Industrials & Materials");
    expect(mapSector({ industry: "Energy" })).toBe("Energy");
    expect(mapSector({ industry: "Utilities" })).toBe("Utilities");
  });

  it("falls back to keywords for unseen names", () => {
    expect(mapSector({ industry: "Oil & Gas Integrated" })).toBe("Energy");
    expect(mapSector({ industry: "Drug Manufacturers - General" })).toBe("Healthcare");
    expect(mapSector({ industry: "Telecom Services" })).toBe("Communication Services");
  });

  it("puts ETFs and unknowns in Other", () => {
    expect(mapSector({ quoteType: "ETF", yahooSector: "Technology" })).toBe("Other");
    expect(mapSector({ industry: "N/A" })).toBe("Other");
    expect(mapSector({})).toBe("Other");
  });

  it("prefers Yahoo sector over Finnhub industry", () => {
    expect(mapSector({ yahooSector: "Healthcare", industry: "Technology" })).toBe("Healthcare");
  });
});

describe("currency helpers", () => {
  it("converts London pence to pounds", () => {
    expect(toMajor(117.4, "GBp")).toEqual({ value: 1.174, currency: "GBP" });
    expect(normalizeCurrency("GBX")).toEqual({ currency: "GBP", divisor: 100 });
  });
  it("leaves normal currencies alone", () => {
    expect(toMajor(26.32, "SAR")).toEqual({ value: 26.32, currency: "SAR" });
    expect(toMajor(3414, "JPY")).toEqual({ value: 3414, currency: "JPY" });
  });
  it("handles missing values", () => {
    expect(toMajor(null, "USD").value).toBeNull();
    expect(normalizeCurrency(undefined).currency).toBe("USD");
  });
  it("detects US tickers", () => {
    expect(isUsTicker("AAPL")).toBe(true);
    expect(isUsTicker("BRK-B")).toBe(true);
    expect(isUsTicker("VOD.L")).toBe(false);
    expect(isUsTicker("2222.SR")).toBe(false);
    expect(isUsTicker("GBPUSD=X")).toBe(false);
  });
  it("converts class shares for Finnhub", () => expect(toFinnhubSymbol("BRK-B")).toBe("BRK.B"));
  it("cleans and validates tickers", () => {
    expect(cleanTicker(" lly ")).toBe("LLY");
    expect(cleanTicker("vod.l")).toBe("VOD.L");
    expect(cleanTicker("DROP TABLE")).toBeNull();
    expect(cleanTicker("")).toBeNull();
    expect(cleanTicker(42)).toBeNull();
  });
});
