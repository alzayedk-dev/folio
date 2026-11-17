// Precious metals: stored like stocks in the transactions table, with quantity in troy ounces of PURE metal
// and price per pure troy ounce. Prices come from COMEX front-month futures on Yahoo Finance.
// Coins and bars below 24k are converted to their pure (fine) metal content and valued at melt value.

export const GRAMS_PER_TROY_OUNCE = 31.1034768;
export const METALS_SECTOR = "Precious Metals";

export const METALS = {
  "GC=F": { key: "gold", name: "Gold" },
  "SI=F": { key: "silver", name: "Silver" },
} as const;

export type MetalTicker = keyof typeof METALS;
export type MetalKey = "gold" | "silver";
export type WeightUnit = "oz" | "g";

export const WEIGHT_UNITS: { value: WeightUnit; label: string; short: string }[] = [
  { value: "g", label: "Grams", short: "g" },
  { value: "oz", label: "Troy Oz", short: "oz" },
];

const GRAMS_PER: Record<WeightUnit, number> = { oz: GRAMS_PER_TROY_OUNCE, g: 1 };

export function isMetal(ticker: string): ticker is MetalTicker {
  return ticker in METALS;
}

export function metalTicker(key: MetalKey): MetalTicker {
  return key === "gold" ? "GC=F" : "SI=F";
}

/** Weight in oz or grams → troy ounces (what we store). */
export function toOunces(weight: number, unit: WeightUnit): number {
  return unit === "oz" ? weight : (weight * GRAMS_PER[unit]) / GRAMS_PER_TROY_OUNCE;
}

/** Troy ounces → the unit the user wants to see. */
export function fromOunces(ounces: number, unit: WeightUnit): number {
  return unit === "oz" ? ounces : (ounces * GRAMS_PER_TROY_OUNCE) / GRAMS_PER[unit];
}

/** Price per oz or gram → price per troy ounce (what we store). */
export function toPricePerOunce(price: number, unit: WeightUnit): number {
  return unit === "oz" ? price : (price * GRAMS_PER_TROY_OUNCE) / GRAMS_PER[unit];
}

/** Price per troy ounce → price per the unit the user wants to see. */
export function fromPricePerOunce(pricePerOz: number, unit: WeightUnit): number {
  return unit === "oz" ? pricePerOz : (pricePerOz * GRAMS_PER[unit]) / GRAMS_PER_TROY_OUNCE;
}

// ---------- purity ----------
export type PurityOption = { value: number; label: string };
export const PURITIES: Record<MetalKey, PurityOption[]> = {
  gold: [
    { value: 1, label: "24k (Pure, 999.9)" },
    { value: 0.9167, label: "22k (91.67%)" },
    { value: 0.875, label: "21k (87.5%)" },
    { value: 0.75, label: "18k (75%)" },
  ],
  silver: [
    { value: 1, label: "Fine (999)" },
    { value: 0.925, label: "Sterling (925)" },
  ],
};

export function purityLabel(metal: MetalKey, purity: number): string {
  return PURITIES[metal].find((p) => Math.abs(p.value - purity) < 1e-4)?.label ?? `${(purity * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

// ---------- coins ----------
export type Coin = {
  code: string;
  metal: MetalKey;
  name: string;
  /** Total coin weight in grams. */
  grossGrams: number;
  /** Share of the weight that is pure metal (0.9167 = 22k). */
  purity: number;
  /** Pure metal content in troy ounces (official figure for bullion coins). */
  fineOz: number;
};

const coin = (code: string, metal: MetalKey, name: string, grossGrams: number, purity: number, fineOz?: number): Coin => ({
  code,
  metal,
  name,
  grossGrams,
  purity,
  fineOz: fineOz ?? (grossGrams * purity) / GRAMS_PER_TROY_OUNCE,
});

/** Common gold and silver coins with their official weight and purity. Valued at melt value (pure content × live price). */
export const COINS: Coin[] = [
  // Turkish / Ottoman lira coins (22k)
  coin("tr_full", "gold", "Turkish Full Lira (Ata / Cumhuriyet)", 7.216, 0.916),
  coin("rashadi", "gold", "Rashadi Lira (Reşat)", 7.216, 0.916),
  coin("tr_half", "gold", "Turkish Half Lira (Yarım)", 3.608, 0.916),
  coin("tr_quarter", "gold", "Turkish Quarter Lira (Çeyrek)", 1.754, 0.916),
  coin("gremse", "gold", "Gremse (2.5 Lira)", 18.04, 0.916),
  // English lira (Sovereign) and the Saudi Guinea (same specification)
  coin("sovereign", "gold", "English Lira (Sovereign)", 7.98805, 0.9167),
  coin("half_sovereign", "gold", "Half English Lira (Half Sovereign)", 3.99403, 0.9167),
  coin("saudi_guinea", "gold", "Saudi Guinea", 7.98805, 0.9167),
  // 1 oz gold bullion coins (exactly 1 troy oz of pure gold)
  coin("krugerrand", "gold", "Krugerrand (1 oz)", 33.93, 0.9167, 1),
  coin("gold_eagle", "gold", "American Gold Eagle (1 oz)", 33.93, 0.9167, 1),
  coin("gold_maple", "gold", "Gold Maple Leaf (1 oz)", 31.11, 0.9999, 1),
  coin("gold_britannia", "gold", "Gold Britannia (1 oz)", 31.1, 0.9999, 1),
  // 1 oz silver bullion coins
  coin("silver_eagle", "silver", "American Silver Eagle (1 oz)", 31.103, 0.999, 1),
  coin("silver_maple", "silver", "Silver Maple Leaf (1 oz)", 31.11, 0.9999, 1),
  coin("silver_britannia", "silver", "Silver Britannia (1 oz)", 31.21, 0.999, 1),
  coin("silver_krugerrand", "silver", "Silver Krugerrand (1 oz)", 31.1, 0.999, 1),
];

export function findCoin(code: string | null | undefined): Coin | undefined {
  return COINS.find((c) => c.code === code);
}

export function coinsFor(metal: MetalKey): Coin[] {
  return COINS.filter((c) => c.metal === metal);
}

export type MetalForm = "bar" | "coin" | "custom";

/** Pure troy ounces for a bar/pure entry: weight in a unit × purity. */
export function barFineOz(weight: number, unit: WeightUnit, purity: number): number {
  return toOunces(weight, unit) * purity;
}

/** Pure troy ounces for a custom coin: count × grams per coin × purity. */
export function customFineOz(count: number, gramsPerCoin: number, purity: number): number {
  return (count * gramsPerCoin * purity) / GRAMS_PER_TROY_OUNCE;
}

/** Short label for a custom coin, e.g. "Custom Coin (8 g, 90%)". */
export function customCoinLabel(gramsPerCoin: number, purity: number): string {
  const g = Math.round(gramsPerCoin * 1000) / 1000;
  const p = Math.round(purity * 10000) / 100;
  return `Custom Coin (${g} g, ${p}%)`;
}

/**
 * Coins still held per metal, from buy/sell trades that recorded coin details.
 * Returns e.g. { "GC=F": [{ label: "Turkish Quarter Lira (Çeyrek)", count: 4 }] }.
 */
export function coinHoldings(
  txns: { ticker: string; type: string; metalForm?: MetalForm | null; coinCode?: string | null; coinCount?: number | null; coinGrams?: number | null; purity?: number | null }[],
): Record<string, { label: string; count: number }[]> {
  const counts = new Map<string, { ticker: string; label: string; count: number }>();
  for (const t of txns) {
    if (!isMetal(t.ticker) || (t.type !== "buy" && t.type !== "sell") || !t.coinCount) continue;
    let key: string | null = null;
    let label = "";
    if (t.metalForm === "coin" && findCoin(t.coinCode)) {
      key = `${t.ticker}|${t.coinCode}`;
      label = findCoin(t.coinCode)!.name;
    } else if (t.metalForm === "custom" && t.coinGrams && t.purity) {
      key = `${t.ticker}|custom|${t.coinGrams}|${t.purity}`;
      label = customCoinLabel(t.coinGrams, t.purity);
    }
    if (!key) continue;
    const cur = counts.get(key) ?? { ticker: t.ticker, label, count: 0 };
    cur.count += t.type === "buy" ? t.coinCount : -t.coinCount;
    counts.set(key, cur);
  }
  const out: Record<string, { label: string; count: number }[]> = {};
  for (const c of counts.values()) {
    if (c.count <= 0) continue;
    (out[c.ticker] ??= []).push({ label: c.label, count: c.count });
  }
  return out;
}
