import type { Ledger } from "./portfolio";
import type { PositionSummary } from "@/components/TransactionModal";

/** Small, serialisable summary of open positions for the transaction pop-up. */
export function toPositionSummary(ledger: Ledger): PositionSummary {
  const out: PositionSummary = {};
  for (const p of Object.values(ledger.positions)) out[p.ticker] = { shares: p.shares, avgCost: p.avgCost, currency: p.currency };
  return out;
}
