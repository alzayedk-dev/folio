// Some exchanges quote prices in minor units (pence, cents). Folio stores everything in major units.
// Pure TypeScript: used by the Edge Function and tested with Vitest.

const MINOR_UNITS: Record<string, { major: string; divisor: number }> = {
  GBp: { major: "GBP", divisor: 100 }, // London pence
  GBX: { major: "GBP", divisor: 100 },
  ZAc: { major: "ZAR", divisor: 100 }, // Johannesburg cents
  ZAC: { major: "ZAR", divisor: 100 },
  ILA: { major: "ILS", divisor: 100 }, // Tel Aviv agorot
  KWF: { major: "KWD", divisor: 1000 }, // Kuwait fils (Boursa Kuwait prices on Yahoo)
};

/** Returns the major currency code and the number to divide prices by. */
export function normalizeCurrency(code: string | null | undefined): { currency: string; divisor: number } {
  if (!code) return { currency: "USD", divisor: 1 };
  const minor = MINOR_UNITS[code];
  if (minor) return { currency: minor.major, divisor: minor.divisor };
  return { currency: code.toUpperCase(), divisor: 1 };
}

/** Converts a price to major units (e.g. 117.4 GBp -> 1.174 GBP). */
export function toMajor(price: number | null | undefined, code: string | null | undefined): { value: number | null; currency: string } {
  const { currency, divisor } = normalizeCurrency(code);
  if (price == null || !Number.isFinite(price)) return { value: null, currency };
  // round to 6 decimals (database precision) to avoid float noise like 1.1740000000000002
  return { value: divisor === 1 ? price : Math.round((price / divisor) * 1e6) / 1e6, currency };
}

/** Folio tickers use Yahoo format. US tickers have no exchange suffix (class shares use a dash, e.g. BRK-B). */
export function isUsTicker(ticker: string): boolean {
  return !ticker.includes(".") && !ticker.includes("=") && !ticker.startsWith("^");
}

/** Finnhub writes US class shares with a dot (BRK.B) where Yahoo uses a dash (BRK-B). */
export function toFinnhubSymbol(ticker: string): string {
  return ticker.replace("-", ".");
}

export const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,19}$/;

export function cleanTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}
