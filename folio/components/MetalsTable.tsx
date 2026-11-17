"use client";

import Link from "next/link";
import type { HoldingRow } from "@/lib/portfolio";
import { WEIGHT_UNITS, fromOunces, fromPricePerOunce, type WeightUnit } from "@/lib/metals";
import { gainClass, money, pct, price as fmtPrice, shares as fmtShares } from "@/lib/format";
import { SegmentedToggle } from "./SegmentedToggle";
import { usePersistentState } from "./usePersistentState";
import { InfoTip } from "./InfoTip";

const UNITS = WEIGHT_UNITS.map((u) => ({ value: u.value, label: u.label }));
const PL = [
  { value: "usd", label: "$" },
  { value: "pct", label: "%" },
] as const;

/** Gold / silver positions: pure metal weight (coins converted to their pure content), valued at melt value. */
export function MetalsTable({ metals, base, coins = {} }: { metals: HoldingRow[]; base: string; coins?: Record<string, { label: string; count: number }[]> }) {
  const [unit, setUnit] = usePersistentState<WeightUnit>("folio.metalUnit", "oz", ["oz", "g", "tola"]);
  const [mode, setMode] = usePersistentState<"usd" | "pct">("folio.plMode", "usd", ["usd", "pct"]);
  const per = WEIGHT_UNITS.find((u) => u.value === unit)?.short ?? "oz";
  const total = metals.reduce((a, m) => a + m.value, 0);
  const totalWeight = metals.reduce((a, m) => a + m.weight, 0);
  const totalPL = metals.reduce((a, m) => a + m.unrealizedPL, 0);

  return (
    <section aria-labelledby="metals-heading" className="rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="metals-heading" className="font-semibold">
          Precious Metals <span className="font-normal text-muted">({metals.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <SegmentedToggle label="Weight unit" value={unit} options={UNITS} onChange={setUnit} />
          <SegmentedToggle label="Show profit and loss in dollars or percent" value={mode} options={PL} onChange={setMode} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="whitespace-nowrap border-b border-line bg-surface text-xs text-muted">
            <tr>
              <th scope="col" className="sticky left-0 z-[1] bg-surface px-3 py-3 text-left font-medium shadow-[1px_0_0_var(--border)]">Metal</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Pure Weight</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                Buy Price{" "}
                <span className="ml-1">
                  <InfoTip text={`Average price you paid per ${unit === "oz" ? "troy ounce" : unit === "g" ? "gram" : "tola"} of pure metal, including fees and any coin premium.`} label="What Buy Price means" />
                </span>
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Current Price</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Total Value</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">% Of Portfolio</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Profit / Loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular">
            {metals.map((m) => (
              <tr key={m.ticker}>
                <td className="sticky left-0 z-[1] bg-white px-3 py-3 shadow-[1px_0_0_var(--border)]">
                  <Link href={`/stock/${encodeURIComponent(m.ticker)}`} className="block py-0.5 font-semibold hover:text-brand hover:underline">
                    {m.name}
                  </Link>
                  {coins[m.ticker]?.length ? (
                    <span className="block max-w-[16rem] text-xs text-muted">{coins[m.ticker].map((c) => `${c.count} × ${c.label}`).join(" · ")}</span>
                  ) : null}
                  <span className="block text-xs text-muted">Melt value, COMEX price{m.priceMissing || m.stale ? " (delayed)" : ""}</span>
                </td>
                <td className="px-3 py-3 text-right">{fmtShares(Math.round(fromOunces(m.shares, unit) * 1e4) / 1e4)} {per}</td>
                <td className="px-3 py-3 text-right">{fmtPrice(fromPricePerOunce(m.avgCost, unit), m.currency)} <span className="text-xs text-muted">/ {per}</span></td>
                <td className="px-3 py-3 text-right">{fmtPrice(fromPricePerOunce(m.price, unit), m.currency)} <span className="text-xs text-muted">/ {per}</span></td>
                <td className="px-3 py-3 text-right font-medium">{money(m.value, base)}</td>
                <td className="px-3 py-3 text-right">{pct(m.weight)}</td>
                <td className={`px-3 py-3 text-right font-medium ${gainClass(m.unrealizedPL)}`}>
                  {mode === "usd" ? money(m.unrealizedPL, base, { sign: true }) : pct(m.unrealizedPLPct, { sign: true })}
                </td>
              </tr>
            ))}
          </tbody>
          {metals.length > 1 && (
            <tfoot className="border-t-2 border-brand/30 bg-brand-soft/40 font-semibold tabular">
              <tr>
                <td className="sticky left-0 z-[1] bg-brand-soft px-3 py-3 shadow-[1px_0_0_var(--border)]">Total</td>
                <td colSpan={3} />
                <td className="px-3 py-3 text-right">{money(total, base)}</td>
                <td className="px-3 py-3 text-right">{pct(totalWeight)}</td>
                <td className={`px-3 py-3 text-right ${gainClass(totalPL)}`}>{mode === "usd" ? money(totalPL, base, { sign: true }) : ""}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
