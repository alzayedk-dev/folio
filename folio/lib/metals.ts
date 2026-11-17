// Precious metals: stored like stocks in the transactions table, with quantity in troy ounces
// and price per troy ounce in USD. Prices come from COMEX front-month futures on Yahoo Finance.

export const GRAMS_PER_TROY_OUNCE = 31.1034768;
export const METALS_SECTOR = "Precious Metals";

export const METALS = {
  "GC=F": { key: "gold", name: "Gold" },
  "SI=F": { key: "silver", name: "Silver" },
} as const;

export type MetalTicker = keyof typeof METALS;
export type WeightUnit = "oz" | "g";

export function isMetal(ticker: string): ticker is MetalTicker {
  return ticker in METALS;
}

export function metalTicker(key: "gold" | "silver"): MetalTicker {
  return key === "gold" ? "GC=F" : "SI=F";
}

/** Weight entered in oz or grams → troy ounces (what we store). */
export function toOunces(weight: number, unit: WeightUnit): number {
  return unit === "oz" ? weight : weight / GRAMS_PER_TROY_OUNCE;
}

/** Troy ounces → the unit the user wants to see. */
export function fromOunces(ounces: number, unit: WeightUnit): number {
  return unit === "oz" ? ounces : ounces * GRAMS_PER_TROY_OUNCE;
}

/** Price per oz or per gram → price per troy ounce (what we store). */
export function toPricePerOunce(price: number, unit: WeightUnit): number {
  return unit === "oz" ? price : price * GRAMS_PER_TROY_OUNCE;
}

/** Price per troy ounce → price per the unit the user wants to see. */
export function fromPricePerOunce(pricePerOz: number, unit: WeightUnit): number {
  return unit === "oz" ? pricePerOz : pricePerOz / GRAMS_PER_TROY_OUNCE;
}
