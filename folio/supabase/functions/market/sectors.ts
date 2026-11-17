// Maps provider industry/sector names to Folio's 9 main sectors (+ Other).
// Pure TypeScript: used by the Edge Function and tested with Vitest.

export const SECTORS = [
  "Technology",
  "Communication Services",
  "Healthcare",
  "Financials & Real Estate",
  "Consumer Discretionary",
  "Consumer Staples",
  "Industrials & Materials",
  "Energy",
  "Utilities",
  "Other",
] as const;

export type Sector = (typeof SECTORS)[number];

// Yahoo Finance sector names (assetProfile.sector)
const YAHOO_SECTORS: Record<string, Sector> = {
  "technology": "Technology",
  "communication services": "Communication Services",
  "healthcare": "Healthcare",
  "financial services": "Financials & Real Estate",
  "real estate": "Financials & Real Estate",
  "consumer cyclical": "Consumer Discretionary",
  "consumer defensive": "Consumer Staples",
  "industrials": "Industrials & Materials",
  "basic materials": "Industrials & Materials",
  "energy": "Energy",
  "utilities": "Utilities",
};

// Finnhub industry names (profile2.finnhubIndustry)
const FINNHUB_INDUSTRIES: Record<string, Sector> = {
  "technology": "Technology",
  "semiconductors": "Technology",
  "software": "Technology",
  "electrical equipment": "Industrials & Materials",
  "communications": "Communication Services",
  "telecommunication": "Communication Services",
  "media": "Communication Services",
  "entertainment": "Communication Services",
  "pharmaceuticals": "Healthcare",
  "biotechnology": "Healthcare",
  "health care": "Healthcare",
  "life sciences tools & services": "Healthcare",
  "banking": "Financials & Real Estate",
  "banks": "Financials & Real Estate",
  "insurance": "Financials & Real Estate",
  "financial services": "Financials & Real Estate",
  "real estate": "Financials & Real Estate",
  "retail": "Consumer Discretionary",
  "automobiles": "Consumer Discretionary",
  "auto components": "Consumer Discretionary",
  "hotels, restaurants & leisure": "Consumer Discretionary",
  "textiles, apparel & luxury goods": "Consumer Discretionary",
  "leisure products": "Consumer Discretionary",
  "diversified consumer services": "Consumer Discretionary",
  "distributors": "Consumer Discretionary",
  "consumer products": "Consumer Staples",
  "food products": "Consumer Staples",
  "beverages": "Consumer Staples",
  "tobacco": "Consumer Staples",
  "aerospace & defense": "Industrials & Materials",
  "airlines": "Industrials & Materials",
  "machinery": "Industrials & Materials",
  "building": "Industrials & Materials",
  "construction": "Industrials & Materials",
  "chemicals": "Industrials & Materials",
  "metals & mining": "Industrials & Materials",
  "packaging": "Industrials & Materials",
  "paper & forest": "Industrials & Materials",
  "industrial conglomerates": "Industrials & Materials",
  "logistics & transportation": "Industrials & Materials",
  "road & rail": "Industrials & Materials",
  "marine": "Industrials & Materials",
  "transportation infrastructure": "Industrials & Materials",
  "commercial services & supplies": "Industrials & Materials",
  "professional services": "Industrials & Materials",
  "trading companies & distributors": "Industrials & Materials",
  "energy": "Energy",
  "oil & gas": "Energy",
  "utilities": "Utilities",
};

// Keyword fallback for names we haven't seen yet (checked in order)
const KEYWORDS: [RegExp, Sector][] = [
  [/semiconductor|software|tech|computer|electronic|internet|it services/i, "Technology"],
  [/telecom|media|entertainment|broadcast|advertis|publishing|interactive/i, "Communication Services"],
  [/pharma|biotech|health|medical|drug|diagnostic|life science/i, "Healthcare"],
  [/bank|insur|financ|capital market|asset manage|credit|reit|real estate|brokerage|exchange/i, "Financials & Real Estate"],
  [/retail|auto|apparel|luxury|restaurant|hotel|leisure|travel|homebuild|household durable|e-?commerce|gaming/i, "Consumer Discretionary"],
  [/food|beverage|tobacco|grocery|household|personal product|consumer staple|agricult/i, "Consumer Staples"],
  [/aerospace|defen|machinery|industrial|construct|chemical|metal|mining|steel|transport|airline|rail|logistic|packag|material|engineering/i, "Industrials & Materials"],
  [/oil|gas|energy|coal|petrol|refin/i, "Energy"],
  [/utilit|electric power|water|renewable/i, "Utilities"],
];

/** Picks Folio's sector from whatever the providers return. Yahoo's sector wins, then Finnhub's industry, then keywords. */
export function mapSector(input: { yahooSector?: string | null; industry?: string | null; quoteType?: string | null }): Sector {
  const qt = (input.quoteType ?? "").toUpperCase();
  if (qt === "ETF" || qt === "MUTUALFUND") return "Other";

  const ys = input.yahooSector?.trim().toLowerCase();
  if (ys && YAHOO_SECTORS[ys]) return YAHOO_SECTORS[ys];

  const ind = input.industry?.trim().toLowerCase();
  if (ind) {
    if (FINNHUB_INDUSTRIES[ind]) return FINNHUB_INDUSTRIES[ind];
    for (const [re, sector] of KEYWORDS) if (re.test(ind)) return sector;
  }
  if (ys) for (const [re, sector] of KEYWORDS) if (re.test(ys)) return sector;
  return "Other";
}
