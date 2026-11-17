"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HoldingRow } from "@/lib/portfolio";
import { STOCK_THRESHOLDS } from "@/lib/portfolio";
import { gainClass, money, pct, price as fmtPrice, shares as fmtShares } from "@/lib/format";
import { SegmentedToggle } from "./SegmentedToggle";
import { usePersistentState } from "./usePersistentState";
import { WarningBadge } from "./WarningBadge";
import { InfoTip } from "./InfoTip";

type Mode = "usd" | "pct";
type SortKey = "ticker" | "shares" | "avgCost" | "price" | "dayChange" | "value" | "weight" | "sector" | "pl";

const MODES = [
  { value: "usd", label: "$" },
  { value: "pct", label: "%" },
] as const;

type Sort = { key: SortKey; dir: 1 | -1 };

function SortHeader({ k, sort, onSort, children, align = "right", sticky = false, info }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; children: React.ReactNode; align?: "left" | "right"; sticky?: boolean; info?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`px-3 py-3 font-medium ${align === "left" ? "text-left" : "text-right"} ${sticky ? "sticky left-0 z-[1] bg-surface shadow-[1px_0_0_var(--border)]" : ""}`}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-brand ${active ? "text-brand" : ""}`}>
        {children}
        <span aria-hidden="true" className="text-[10px]">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
      </button>
      {info && (
        <span className="ml-1">
          <InfoTip text={info} label={`What ${typeof children === "string" ? children : "this column"} means`} />
        </span>
      )}
    </th>
  );
}

function PriceNote({ h }: { h: HoldingRow }) {
  if (h.priceMissing) return <span title="Live price unavailable: showing your average cost" className="ml-1 text-warn">•</span>;
  if (h.stale) return <span title="Last saved price: the market feed is catching its breath" className="ml-1 text-warn">•</span>;
  return null;
}

const WARNING_TITLE = `Guideline: above ${STOCK_THRESHOLDS.yellow}% of your portfolio is high, above ${STOCK_THRESHOLDS.red}% is very high. Not advice.`;

export function HoldingsTable({
  holdings,
  base,
  cashValue,
  metalsValue = 0,
  totalValue,
  dayChange,
  unrealizedPL,
}: {
  holdings: HoldingRow[];
  base: string;
  cashValue: number;
  metalsValue?: number;
  totalValue: number;
  dayChange: number;
  unrealizedPL: number;
}) {
  const [mode, setMode] = usePersistentState<Mode>("folio.plMode", "usd", ["usd", "pct"]);
  const [sort, setSort] = useState<Sort>({ key: "value", dir: -1 });

  const sorted = useMemo(() => {
    const val = (h: HoldingRow): number | string => {
      switch (sort.key) {
        case "ticker":
          return h.ticker;
        case "sector":
          return h.sector;
        case "dayChange":
          return mode === "usd" ? h.dayChange : h.dayChangePct ?? -Infinity;
        case "pl":
          return mode === "usd" ? h.unrealizedPL : h.unrealizedPLPct ?? -Infinity;
        default:
          return h[sort.key];
      }
    };
    return [...holdings].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
  }, [holdings, sort, mode]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "ticker" || key === "sector" ? 1 : -1 }));

  const plCell = (h: HoldingRow) =>
    mode === "usd" ? money(h.unrealizedPL, base, { sign: true }) : pct(h.unrealizedPLPct, { sign: true });
  const dayCell = (h: HoldingRow) =>
    mode === "usd" ? money(h.dayChange, base, { sign: true }) : pct(h.dayChangePct, { sign: true, digits: 2 });


  return (
    <section aria-labelledby="holdings-heading" className="rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="holdings-heading" className="font-semibold">
          Stocks <span className="font-normal text-muted">({holdings.length})</span>
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Show P/L &amp; Day Change In</span>
          <SegmentedToggle label="Show P/L in dollars or percent" value={mode} options={MODES} onChange={setMode} />
        </div>
      </div>

      {/* Table at every width; scrolls sideways inside the box on small screens */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="whitespace-nowrap border-b border-line bg-surface text-xs text-muted">
            <tr>
              <SortHeader k="ticker" align="left" sticky sort={sort} onSort={toggleSort}>Stock</SortHeader>
              <SortHeader k="shares" sort={sort} onSort={toggleSort}>Shares</SortHeader>
              <SortHeader k="avgCost" sort={sort} onSort={toggleSort} info="Average price you paid per share, including fees.">Buy Price</SortHeader>
              <SortHeader k="price" sort={sort} onSort={toggleSort}>Current Price</SortHeader>
              <SortHeader k="dayChange" sort={sort} onSort={toggleSort}>Day Change</SortHeader>
              <SortHeader k="value" sort={sort} onSort={toggleSort}>Total Value</SortHeader>
              <SortHeader k="weight" sort={sort} onSort={toggleSort}>% Of Portfolio</SortHeader>
              <SortHeader k="sector" align="left" sort={sort} onSort={toggleSort}>Sector</SortHeader>
              <SortHeader k="pl" sort={sort} onSort={toggleSort}>Profit / Loss</SortHeader>
              <th scope="col" className="px-3 py-3 text-left font-medium" title={WARNING_TITLE}>
                Warning
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular">
            {sorted.map((h) => (
              <tr key={h.ticker}>
                <td className="sticky left-0 z-[1] bg-white px-3 py-3 shadow-[1px_0_0_var(--border)]">
                  <Link href={`/stock/${encodeURIComponent(h.ticker)}`} className="block font-semibold text-foreground hover:text-brand hover:underline">
                    {h.ticker}
                  </Link>
                  <span className="block max-w-[7.5rem] truncate text-xs text-muted sm:max-w-[14rem]" title={h.name}>{h.name}</span>
                </td>
                <td className="px-3 py-3 text-right">{fmtShares(h.shares)}</td>
                <td className="px-3 py-3 text-right">{fmtPrice(h.avgCost, h.currency)}</td>
                <td className="px-3 py-3 text-right">
                  {fmtPrice(h.price, h.currency)}
                  <PriceNote h={h} />
                </td>
                <td className={`px-3 py-3 text-right ${gainClass(h.dayChange)}`}>{dayCell(h)}</td>
                <td className="px-3 py-3 text-right font-medium">{money(h.value, base)}</td>
                <td className="px-3 py-3 text-right">{pct(h.weight)}</td>
                <td className="px-3 py-3 text-left text-muted">{h.sector}</td>
                <td className={`px-3 py-3 text-right font-medium ${gainClass(h.unrealizedPL)}`}>{plCell(h)}</td>
                <td className="px-3 py-3">
                  <WarningBadge level={h.warning} title={WARNING_TITLE} />
                </td>
              </tr>
            ))}
            {metalsValue > 0.005 && (
              <tr className="text-muted">
                <td className="sticky left-0 z-[1] bg-white px-3 py-3 font-medium text-foreground shadow-[1px_0_0_var(--border)]">
                  <a href="#metals-heading" className="hover:text-brand">Precious Metals</a>
                </td>
                <td colSpan={4} />
                <td className="px-3 py-3 text-right font-medium text-foreground">{money(metalsValue, base)}</td>
                <td className="px-3 py-3 text-right">{pct(totalValue ? (metalsValue / totalValue) * 100 : 0)}</td>
                <td colSpan={3} />
              </tr>
            )}
            {cashValue > 0.005 && (
              <tr className="text-muted">
                <td className="sticky left-0 z-[1] bg-white px-3 py-3 font-medium text-foreground shadow-[1px_0_0_var(--border)]">Cash</td>
                <td colSpan={4} />
                <td className="px-3 py-3 text-right font-medium text-foreground">{money(cashValue, base)}</td>
                <td className="px-3 py-3 text-right">{pct(totalValue ? (cashValue / totalValue) * 100 : 0)}</td>
                <td colSpan={3} />
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-brand/30 bg-brand-soft/40 font-semibold tabular">
            <tr>
              <td className="sticky left-0 z-[1] bg-brand-soft px-3 py-3 shadow-[1px_0_0_var(--border)]">Total</td>
              <td colSpan={3} />
              <td className={`px-3 py-3 text-right ${gainClass(dayChange)}`}>{mode === "usd" ? money(dayChange, base, { sign: true }) : ""}</td>
              <td className="px-3 py-3 text-right">{money(totalValue, base)}</td>
              <td className="px-3 py-3 text-right">{totalValue > 0 ? "100%" : "—"}</td>
              <td />
              <td className={`px-3 py-3 text-right ${gainClass(unrealizedPL)}`}>{mode === "usd" ? money(unrealizedPL, base, { sign: true }) : ""}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

    </section>
  );
}
