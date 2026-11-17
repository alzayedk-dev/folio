"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTransaction } from "@/app/(app)/actions/transactions";
import { gainClass, money, price as fmtPrice, shares as fmtShares } from "@/lib/format";
import { TransactionModal, type EditableTxn, type PositionSummary } from "./TransactionModal";
import { Alert, Select } from "./ui";
import { isMetal } from "@/lib/metals";

export type TxnRow = EditableTxn & { proceeds: number | null; realizedPL: number | null; total: number };

const TYPE_STYLE: Record<TxnRow["type"], string> = {
  buy: "bg-brand-soft text-brand-strong",
  sell: "bg-amber-50 text-warn",
  dividend: "bg-surface text-foreground",
};
const TYPE_LABEL: Record<TxnRow["type"], string> = { buy: "Buy", sell: "Sell", dividend: "Dividend" };

function TypeBadge({ type }: { type: TxnRow["type"] }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[type]}`}>{TYPE_LABEL[type]}</span>;
}

function RowActions({ row, onEdit, onDelete, busy }: { row: TxnRow; onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const label = `${TYPE_LABEL[row.type]} ${row.ticker} on ${row.tradeDate}`;
  return (
    <span className="inline-flex gap-1">
      <button type="button" onClick={onEdit} aria-label={`Edit ${label}`} className="rounded p-1.5 text-muted hover:bg-brand-soft hover:text-brand">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      <button type="button" onClick={onDelete} disabled={busy} aria-label={`Delete ${label}`} className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-loss disabled:opacity-50">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      </button>
    </span>
  );
}

export function TransactionList({ rows, positions }: { rows: TxnRow[]; positions: PositionSummary }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("all");
  const [type, setType] = useState<"all" | TxnRow["type"]>("all");
  const [editing, setEditing] = useState<EditableTxn | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tickers = useMemo(() => [...new Set(rows.map((r) => r.ticker))].sort(), [rows]);
  const shown = rows.filter((r) => (ticker === "all" || r.ticker === ticker) && (type === "all" || r.type === type));

  async function remove(row: TxnRow) {
    if (!window.confirm(`Delete this ${TYPE_LABEL[row.type].toLowerCase()} of ${row.ticker} on ${row.tradeDate}? Holdings and cash will be recalculated.`)) return;
    setError(null);
    setBusyId(row.id);
    const res = await deleteTransaction(row.id);
    setBusyId(null);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  const qtyCell = (r: TxnRow) => (r.type === "dividend" ? "—" : `${fmtShares(Math.round((r.shares ?? 0) * 1e4) / 1e4)}${isMetal(r.ticker) ? " oz" : ""}`);
  const priceCell = (r: TxnRow) => (r.type === "dividend" ? "—" : `${fmtPrice(r.price, r.currency)}${isMetal(r.ticker) ? " / oz" : ""}`);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          <span className="mb-1 block">Stock</span>
          <Select value={ticker} onChange={(e) => setTicker(e.target.value)} className="w-40 py-2" aria-label="Filter by stock">
            <option value="all">All Stocks</option>
            {tickers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-muted">
          <span className="mb-1 block">Type</span>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-36 py-2" aria-label="Filter by type">
            <option value="all">All Types</option>
            <option value="buy">Buys</option>
            <option value="sell">Sells</option>
            <option value="dividend">Dividends</option>
          </Select>
        </label>
        <p className="ml-auto text-xs text-muted" aria-live="polite">
          {shown.length} of {rows.length} trade{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="rounded-2xl border border-line bg-white shadow-sm">
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No trades match these filters.</p>
        ) : (
          <>
            {/* Table at every width; scrolls sideways inside the box on small screens */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] text-sm">
                <thead className="whitespace-nowrap border-b border-line bg-surface text-xs text-muted">
                  <tr>
                    <th scope="col" className="sticky left-0 z-[1] bg-surface px-3 py-3 text-left font-medium shadow-[1px_0_0_var(--border)]">Stock</th>
                    <th scope="col" className="px-3 py-3 text-left font-medium">Date</th>
                    <th scope="col" className="px-3 py-3 text-left font-medium">Type</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Shares</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Price Per Share</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Fees</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Total</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Realized P/L</th>
                    <th scope="col" className="px-3 py-3 text-left font-medium">Notes</th>
                    <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular">
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td className="sticky left-0 z-[1] bg-white px-3 py-3 shadow-[1px_0_0_var(--border)]">
                        <Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="block font-semibold hover:text-brand hover:underline">
                          {isMetal(r.ticker) ? r.name : r.ticker}
                        </Link>
                        <span className="block max-w-[7.5rem] truncate text-xs text-muted sm:max-w-[12rem]" title={r.name}>{r.name}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{r.tradeDate}</td>
                      <td className="px-3 py-3"><TypeBadge type={r.type} /></td>
                      <td className="px-3 py-3 text-right">{qtyCell(r)}</td>
                      <td className="px-3 py-3 text-right">{priceCell(r)}</td>
                      <td className="px-3 py-3 text-right text-muted">{r.fees ? money(r.fees, r.currency) : "—"}</td>
                      <td className="px-3 py-3 text-right font-medium" title={r.type === "sell" ? "Proceeds after fees" : r.type === "buy" ? "Cost incl. fees" : "Added to cash"}>
                        {money(r.total, r.currency)}
                      </td>
                      <td className={`px-3 py-3 text-right ${gainClass(r.realizedPL)}`}>{r.realizedPL == null ? "—" : money(r.realizedPL, r.currency, { sign: true })}</td>
                      <td className="max-w-[12rem] truncate px-3 py-3 text-muted" title={r.notes ?? ""}>{r.notes || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <RowActions row={r} onEdit={() => setEditing(r)} onDelete={() => remove(r)} busy={busyId === r.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </>
        )}
      </div>

      <TransactionModal open={!!editing} onClose={() => setEditing(null)} positions={positions} editing={editing} />
    </section>
  );
}
