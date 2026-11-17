// Turns a valuation into a short, percentages-only portfolio summary for the AI analyst.
// No dollar amounts, share counts or cash balances are sent to the AI provider.
import type { Valuation } from "./portfolio";
import { isMetal, METALS } from "./metals";

export function buildAiContext(v: Valuation): string {
  if (v.totalValue <= 0) return "The user has no holdings or cash recorded yet.";
  const total = v.totalValue;
  const p = (x: number) => `${((x / total) * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`Asset mix: Stocks ${p(v.stocksValue)}, Precious metals ${p(v.metalsValue)}, Cash ${p(v.cashValue)}.`);
  if (v.holdings.length) {
    lines.push("Holdings (% of total portfolio, sector, unrealized return):");
    for (const h of v.holdings.slice(0, 40)) {
      const name = isMetal(h.ticker) ? METALS[h.ticker].name : `${h.ticker} (${h.name})`;
      const ret = h.unrealizedPLPct == null ? "n/a" : `${h.unrealizedPLPct >= 0 ? "+" : ""}${h.unrealizedPLPct.toFixed(1)}%`;
      lines.push(`- ${name}: ${h.weight.toFixed(1)}%, ${h.sector}, ${ret}`);
    }
  }
  const sectors = v.sectors.filter((s) => s.sector !== "Cash");
  if (sectors.length) lines.push(`Sector weights: ${sectors.map((s) => `${s.sector} ${s.weight.toFixed(1)}%`).join(", ")}.`);
  lines.push("Folio's concentration guidelines: one stock above 10% is high, above 20% very high; one sector above 25% high, above 40% very high.");
  return lines.join("\n");
}
