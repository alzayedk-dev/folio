"use client";

import { useMemo, useState } from "react";
import type { HoldingRow } from "@/lib/portfolio";
import { STOCK_THRESHOLDS } from "@/lib/portfolio";
import { gainClass, money, pct, price as fmtPrice, shares as fmtShares } from "@/lib/format";
import { SegmentedToggle } from "./SegmentedToggle";
import { usePersistentState } from "./usePersistentState";
import { WarningBadge } from "./WarningBadge";

type Mode = "usd" | "pct";
type SortKey = "ticker" | "shares" | "avgCost" | "price" | "dayChange" | "value" | "weight" | "sector" | "pl";

const MODES = [
  { value: "usd", label: "$" },
  { value: "pct", label: "%" },
] as const;

type Sort = { key: SortKey; dir: 1 | -1 };

function SortHeader({ k, sort, onSort, children, align = "right" }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; children: React.ReactNode; align?: "left" | "right" }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`px-3 py-3 font-medium ${align === "left" ? "text-left" : "text-right"}`}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-brand ${active ? "text-brand" : ""}`}>
        {children}
        <span aria-hidden="true" className="text-[10px]">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
      </button>
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
  totalValue,
  dayChange,
  unrealizedPL,
}: {
  holdings: HoldingRow[];
  base: string;
  cashValue: number;
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
          Holdings <span className="font-normal text-muted">({holdings.length})</span>
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>P/L &amp; day change in</span>
          <SegmentedToggle label="Show P/L in dollars or percent" value={mode} options={MODES} onChange={setMode} />
        </div>
      </div>

      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface text-xs text-muted">
            <tr>
              <SortHeader k="ticker" align="left" sort={sort} onSort={toggleSort}>Stock</SortHeader>
              <SortHeader k="shares" sort={sort} onSort={toggleSort}>Shares</SortHeader>
              <SortHeader k="avgCost" sort={sort} onSort={toggleSort}>Avg. price</SortHeader>
              <SortHeader k="price" sort={sort} onSort={toggleSort}>Current</SortHeader>
              <SortHeader k="dayChange" sort={sort} onSort={toggleSort}>Day</SortHeader>
              <SortHeader k="value" sort={sort} onSort={toggleSort}>Total value</SortHeader>
              <SortHeader k="weight" sort={sort} onSort={toggleSort}>% of portfolio</SortHeader>
              <SortHeader k="sector" align="left" sort={sort} onSort={toggleSort}>Sector</SortHeader>
              <SortHeader k="pl" sort={sort} onSort={toggleSort}>P/L</SortHeader>
              <th scope="col" className="px-3 py-3 text-left font-medium" title={WARNING_TITLE}>
                Warning
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular">
            {sorted.map((h) => (
              <tr key={h.ticker} className="hover:bg-brand-soft/40">
                <td className="px-3 py-3">
                  <span className="block font-semibold text-foreground">{h.ticker}</span>
                  <span className="block max-w-[14rem] truncate text-xs text-muted" title={h.name}>{h.name}</span>
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
            {cashValue > 0.005 && (
              <tr className="text-muted">
                <td className="px-3 py-3 font-medium text-foreground">Cash</td>
                <td colSpan={4} />
                <td className="px-3 py-3 text-right font-medium text-foreground">{money(cashValue, base)}</td>
                <td className="px-3 py-3 text-right">{pct(totalValue ? (cashValue / totalValue) * 100 : 0)}</td>
                <td colSpan={3} />
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-brand/30 bg-brand-soft/40 font-semibold tabular">
            <tr>
              <td className="px-3 py-3">Total</td>
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

      {/* Phone cards */}
      <ul className="divide-y divide-line md:hidden">
        {sorted.map((h) => (
          <li key={h.ticker} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{h.ticker}</p>
                <p className="truncate text-xs text-muted">{h.name}</p>
              </div>
              <div className="shrink-0 text-right tabular">
                <p className="font-semibold">{money(h.value, base)}</p>
                <p className={`text-xs font-medium ${gainClass(h.unrealizedPL)}`}>{plCell(h)}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted tabular">
              <span>
                {fmtShares(h.shares)} × {fmtPrice(h.price, h.currency)}
                <PriceNote h={h} />
              </span>
              <span>avg {fmtPrice(h.avgCost, h.currency)}</span>
              <span className={gainClass(h.dayChange)}>Day {dayCell(h)}</span>
              <span>{pct(h.weight)} · {h.sector}</span>
              <WarningBadge level={h.warning} title={WARNING_TITLE} />
            </div>
          </li>
        ))}
        {cashValue > 0.005 && (
          <li className="flex justify-between px-4 py-3 text-sm">
            <span className="font-medium">Cash</span>
            <span className="tabular">
              {money(cashValue, base)} <span className="text-xs text-muted">· {pct(totalValue ? (cashValue / totalValue) * 100 : 0)}</span>
            </span>
          </li>
        )}
        <li className="flex justify-between bg-brand-soft/40 px-4 py-3 text-sm font-semibold">
          <span>Total</span>
          <span className="tabular">{money(totalValue, base)}</span>
        </li>
      </ul>
    </section>
  );
}
