// Shariah (halal) screening based on AAOIFI rules, using free public data.
// Pure functions: the facts come from the "market" Edge Function (shariah_cache), the rules live here.
// A screening guide, not a religious ruling.

export type ShariahStatus = "compliant" | "doubtful" | "not_compliant" | "not_screened";
export type RuleResult = "pass" | "fail" | "doubtful" | "unknown";

export type ShariahFacts = {
  ticker: string;
  found: boolean;
  quote_type: string | null;
  industry: string | null;
  yahoo_sector: string | null;
  total_debt: number | string | null;
  cash_investments: number | string | null;
  market_cap: number | string | null;
  data_date: string | null;
};

export type ShariahRule = { key: "business" | "debt" | "cash" | "income"; name: string; value: string; limit: string; result: RuleResult };

export type ShariahResult = {
  ticker: string;
  status: ShariahStatus;
  label: string;
  summary: string;
  rules: ShariahRule[];
  dataDate: string | null;
};

export const SHARIAH_NOTE = "A screening guide based on AAOIFI rules and public data, not a religious ruling. Check with a qualified scholar.";
export const DEBT_LIMIT = 0.3;
export const CASH_LIMIT = 0.3;

export const STATUS_LABEL: Record<ShariahStatus, string> = {
  compliant: "Compliant",
  doubtful: "Doubtful",
  not_compliant: "Not Compliant",
  not_screened: "Not Screened",
};

/** Well-known Shariah-screened ETFs (screened by their own Shariah boards). */
export const SHARIAH_ETFS = new Set(["SPUS", "HLAL", "SPSK", "SPRE", "UMMA", "SPTE", "SPWO", "AMAGX", "AMANX"]);

/** Companies whose main business is pork (industry names alone can't show this). */
const PORK_TICKERS = new Set(["HRL", "SFD", "0288.HK"]);

// Yahoo Finance industry names (lower case)
const NOT_ALLOWED = new Set([
  "banks - diversified",
  "banks - regional",
  "mortgage finance",
  "credit services",
  "capital markets",
  "insurance - life",
  "insurance - property & casualty",
  "insurance - diversified",
  "insurance - reinsurance",
  "insurance - specialty",
  "insurance brokers",
  "reit - mortgage",
  "beverages - brewers",
  "beverages - wineries & distilleries",
  "tobacco",
  "gambling",
  "resorts & casinos",
]);
const NOT_ALLOWED_WORDS = /\bbank|insurance|brewer|distiller|winer|casino|gambling|tobacco|mortgage|adult entertainment/i;

const MIXED = new Set([
  "lodging",
  "restaurants",
  "airlines",
  "entertainment",
  "broadcasting",
  "leisure",
  "travel services",
  "grocery stores",
  "discount stores",
  "department stores",
  "food distribution",
  "asset management",
  "financial data & stock exchanges",
  "financial conglomerates",
  "shell companies",
]);
const isReit = (industry: string) => industry.startsWith("reit");

const n = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function businessCheck(ticker: string, industry: string | null, yahooSector: string | null): { result: RuleResult; value: string } {
  if (PORK_TICKERS.has(ticker)) return { result: "fail", value: "Pork products" };
  const ind = (industry ?? "").trim().toLowerCase();
  if (!ind) {
    if ((yahooSector ?? "").toLowerCase() === "financial services") return { result: "doubtful", value: "Financial services (type unknown)" };
    return { result: "unknown", value: "Information not available" };
  }
  if (NOT_ALLOWED.has(ind) || NOT_ALLOWED_WORDS.test(ind)) return { result: "fail", value: industry! };
  if (MIXED.has(ind) || isReit(ind)) return { result: "doubtful", value: `${industry} (mixed income)` };
  return { result: "pass", value: industry! };
}

function ratioRule(key: "debt" | "cash", name: string, part: number | null, cap: number | null, limit: number): ShariahRule {
  const limitText = `Under ${pct(limit).replace(".0", "")}`;
  if (part == null || cap == null || cap <= 0) return { key, name, value: "Information not available", limit: limitText, result: "unknown" };
  const ratio = part / cap;
  return { key, name, value: pct(ratio), limit: limitText, result: ratio < limit ? "pass" : "fail" };
}

const notScreened = (ticker: string, summary: string): ShariahResult => ({
  ticker,
  status: "not_screened",
  label: STATUS_LABEL.not_screened,
  summary,
  rules: [],
  dataDate: null,
});

// ---------- Islamic financial institutions ----------
// Islamic banks and Takaful (Islamic insurance) companies work under their own Shariah supervisory boards.
// Conventional "no banks / insurance" and debt-ratio rules don't apply to them: customer deposits and
// financing are Shariah-structured, not interest-bearing debt.
/** Well-known listed Islamic banks (Yahoo tickers). */
export const ISLAMIC_BANK_TICKERS = new Set([
  "KFH.KW", // Kuwait Finance House
  "BOUBYAN.KW", // Boubyan Bank
  "WARBABANK.KW", // Warba Bank
  "KIB.KW", // Kuwait International Bank
  "1120.SR", // Al Rajhi Bank
  "1150.SR", // Alinma Bank
  "1140.SR", // Bank Albilad
  "1020.SR", // Bank AlJazira
  "QIBK.QA", // Qatar Islamic Bank
  "MARK.QA", // Masraf Al Rayan
  "QIIK.QA", // Qatar International Islamic Bank
  "DUKB.QA", // Dukhan Bank
  "DIB.AE", // Dubai Islamic Bank
  "ADIB.AE", // Abu Dhabi Islamic Bank
]);
const ISLAMIC_BANK_WORDS = /\bislamic\b|finance house|al ?rajhi|alinma|albilad|al ?jazira bank|bank al ?jazira|masraf al ?rayan|boubyan|warba bank|dukhan bank|\bshari'?a\b|\bshariah\b/i;
const TAKAFUL_WORDS = /\btakaful\b/i;

/** "bank" or "takaful" when this is an Islamic financial institution, otherwise null. */
export function islamicFinance(ticker: string, name: string | null | undefined): "bank" | "takaful" | null {
  if (ISLAMIC_BANK_TICKERS.has(ticker.toUpperCase())) return "bank";
  if (name && TAKAFUL_WORDS.test(name)) return "takaful";
  if (name && ISLAMIC_BANK_WORDS.test(name)) return "bank";
  return null;
}

/**
 * Screens one stock. Pass `facts` = null when no data came back. `name` (company name) lets Folio recognise
 * Islamic banks and Takaful companies.
 */
export function screen(ticker: string, facts: ShariahFacts | null, name?: string | null): ShariahResult {
  const t = ticker.toUpperCase();
  if (SHARIAH_ETFS.has(t)) {
    return { ticker: t, status: "compliant", label: "Compliant (Shariah ETF)", summary: "This fund is screened by its own Shariah board.", rules: [], dataDate: null };
  }
  if (t.includes("=")) return notScreened(t, "Gold and silver aren't screened in this version.");
  const islamic = islamicFinance(t, name);
  if (islamic) {
    const kind = islamic === "bank" ? "Islamic bank" : "Takaful (Islamic insurance) company";
    const na = "Not applicable to Islamic financial institutions";
    return {
      ticker: t,
      status: "compliant",
      label: islamic === "bank" ? "Compliant (Islamic Bank)" : "Compliant (Takaful)",
      summary: `An ${kind} supervised by its own Shariah board. Its deposits and financing are Shariah-structured, so the debt and cash ratios don't apply.`,
      rules: [
        { key: "business", name: "Business Activity", value: kind === "Islamic bank" ? "Islamic banking" : "Takaful (Islamic insurance)", limit: "Allowed business", result: "pass" },
        { key: "debt", name: "Interest-Bearing Debt ÷ Market Value", value: na, limit: "Under 30%", result: "unknown" },
        { key: "cash", name: "Cash & Interest-Earning Investments ÷ Market Value", value: na, limit: "Under 30%", result: "unknown" },
      ],
      dataDate: facts?.data_date ?? null,
    };
  }
  if (!facts || !facts.found) return notScreened(t, "We couldn't find screening data for this stock.");
  const qt = (facts.quote_type ?? "").toUpperCase();
  if (qt === "ETF" || qt === "MUTUALFUND") return notScreened(t, "Funds hold many companies, so Folio can't screen them.");

  const biz = businessCheck(t, facts.industry, facts.yahoo_sector);
  const cap = n(facts.market_cap);
  const rules: ShariahRule[] = [
    { key: "business", name: "Business Activity", value: biz.value, limit: "Allowed business", result: biz.result },
    ratioRule("debt", "Interest-Bearing Debt ÷ Market Value", n(facts.total_debt), cap, DEBT_LIMIT),
    ratioRule("cash", "Cash & Interest-Earning Investments ÷ Market Value", n(facts.cash_investments), cap, CASH_LIMIT),
    { key: "income", name: "Non-Halal Income ÷ Total Income", value: "Information not available", limit: "Under 5%", result: "unknown" },
  ];
  const [business, debt, cash] = rules;

  let status: ShariahStatus;
  let summary: string;
  if (business.result === "fail") {
    status = "not_compliant";
    summary = "The company's main business isn't allowed.";
  } else if (debt.result === "fail" || cash.result === "fail") {
    status = "not_compliant";
    summary = debt.result === "fail" && cash.result === "fail" ? "Debt and interest-earning cash are both above 30% of market value." : debt.result === "fail" ? "Debt is above 30% of market value." : "Interest-earning cash is above 30% of market value.";
  } else if (business.result !== "pass") {
    status = "doubtful";
    summary = business.result === "doubtful" ? "The business has mixed income, so some of it may not be halal." : "We couldn't confirm what the company does.";
  } else if (debt.result === "unknown" || cash.result === "unknown") {
    status = "doubtful";
    summary = "Some financial data is missing.";
  } else {
    status = "compliant";
    summary = "Passes the business and financial-ratio checks.";
  }
  return { ticker: t, status, label: STATUS_LABEL[status], summary, rules, dataDate: facts.data_date };
}
