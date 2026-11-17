// Number and money formatting shared by tables, cards and the pop-up.

export function money(value: number | null | undefined, currency: string, opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1000 || ["JPY", "KRW"].includes(currency) ? 0 : 2;
  const precise = ["KWD", "BHD", "OMR"].includes(currency) ? 3 : digits;
  try {
    const s = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      minimumFractionDigits: opts.compact ? 0 : precise,
      maximumFractionDigits: opts.compact ? 1 : Math.max(precise, 2),
      signDisplay: opts.sign ? "exceptZero" : "auto",
    }).format(value);
    return s;
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Price per share: keeps more decimals for small prices (e.g. 1.1725 GBP). */
export function price(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const decimals = value < 10 ? 4 : 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: decimals }).format(value);
  } catch {
    return `${value.toFixed(decimals)} ${currency}`;
  }
}

export function pct(value: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const d = opts.digits ?? 1;
  const s = value.toFixed(d);
  return `${opts.sign && value > 0 ? "+" : ""}${s}%`;
}

export function shares(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

export function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the user's time zone
}

export function gainClass(value: number | null | undefined): string {
  if (value == null || Math.abs(value) < 1e-9) return "text-muted";
  return value > 0 ? "text-gain" : "text-loss";
}
