"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { market, MarketError, type SearchResult } from "@/lib/market";
import { messages } from "@/lib/messages";
import { money, price as fmtPrice, shares as fmtShares, todayLocal, gainClass } from "@/lib/format";
import { createTransaction, updateTransaction } from "@/app/(app)/actions/transactions";
import { Modal } from "./Modal";
import { TickerSearch } from "./TickerSearch";
import { Alert, Button, Field, Input } from "./ui";

export type PositionSummary = Record<string, { shares: number; avgCost: number; currency: string }>;

export type EditableTxn = {
  id: string;
  ticker: string;
  name: string;
  type: "buy" | "sell" | "dividend";
  shares: number | null;
  price: number | null;
  amount: number | null;
  fees: number;
  currency: string;
  tradeDate: string;
  notes: string | null;
};

type Picked = { ticker: string; name: string; exchange: string | null; currency: string; sector: string; currentPrice: number | null; stale?: boolean };

const TYPES = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "dividend", label: "Dividend" },
] as const;

export function TransactionModal({
  open,
  onClose,
  positions,
  editing,
  initialType = "buy",
}: {
  open: boolean;
  onClose: () => void;
  positions: PositionSummary;
  editing?: EditableTxn | null;
  initialType?: "buy" | "sell" | "dividend";
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [type, setType] = useState<"buy" | "sell" | "dividend">(initialType);
  const [form, setForm] = useState({ shares: "", price: "", amount: "", fees: "", tradeDate: todayLocal(), notes: "" });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset every time the pop-up opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    if (editing) {
      setPicked({ ticker: editing.ticker, name: editing.name, exchange: null, currency: editing.currency, sector: "", currentPrice: null });
      setType(editing.type);
      setForm({
        shares: editing.shares?.toString() ?? "",
        price: editing.price?.toString() ?? "",
        amount: editing.amount?.toString() ?? "",
        fees: editing.fees ? editing.fees.toString() : "",
        tradeDate: editing.tradeDate,
        notes: editing.notes ?? "",
      });
    } else {
      setPicked(null);
      setType(initialType);
      setForm({ shares: "", price: "", amount: "", fees: "", tradeDate: todayLocal(), notes: "" });
    }
  }, [open, editing, initialType]);

  async function pick(r: SearchResult) {
    setError(null);
    setLoadingInfo(true);
    const supabase = createClient();
    try {
      const [profile, q] = await Promise.all([market.profile(supabase, r.ticker), market.quotes(supabase, [r.ticker]).catch(() => null)]);
      const quote = q?.quotes[r.ticker];
      setPicked({
        ticker: profile.ticker,
        name: profile.name,
        exchange: profile.exchange,
        currency: profile.currency,
        sector: profile.sector,
        currentPrice: quote?.price ?? null,
        stale: quote?.stale,
      });
    } catch (e) {
      setError({ message: e instanceof MarketError ? e.friendly : messages.serverBusy });
    } finally {
      setLoadingInfo(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // ----- live preview -----
  const n = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const qty = n(form.shares);
  const px = n(form.price);
  const fee = form.fees.trim() === "" ? 0 : n(form.fees);
  const pos = picked ? positions[picked.ticker] : undefined;
  const owned = (pos?.shares ?? 0) + (editing?.type === "sell" && editing.shares ? editing.shares : 0) - (editing?.type === "buy" && editing.shares ? editing.shares : 0);
  const ccy = picked?.currency ?? "USD";
  const valid = Number.isFinite(qty) && Number.isFinite(px) && Number.isFinite(fee);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return setError({ message: "Pick a stock from the list first.", field: "ticker" });
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("ticker", picked.ticker);
    fd.set("type", type);
    const res = editing ? await updateTransaction(editing.id, fd) : await createTransaction(fd);
    setSaving(false);
    if (!res.ok) return setError({ message: res.error, field: res.field });
    onClose();
    router.refresh();
  }

  const title = editing ? "Edit transaction" : "Add transaction";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {!picked ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Which stock did you trade?</p>
          <TickerSearch onPick={pick} autoFocus />
          {loadingInfo && <p className="text-sm text-muted">{messages.loading}</p>}
          {error && <Alert>{error.message}</Alert>}
        </div>
      ) : (
        <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
          {/* Stock header */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-brand-soft/50 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{picked.ticker}</p>
              <p className="truncate text-sm text-muted">{picked.name}</p>
              {(picked.exchange || picked.sector) && (
                <p className="mt-0.5 text-xs text-muted">{[picked.exchange, picked.sector, picked.currency].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              {picked.currentPrice != null && (
                <>
                  <p className="text-xs text-muted">Current price</p>
                  <p className="font-semibold tabular">{fmtPrice(picked.currentPrice, ccy)}</p>
                </>
              )}
              {!editing && (
                <button type="button" onClick={() => setPicked(null)} className="mt-1 text-xs font-medium text-brand hover:underline">
                  Change stock
                </button>
              )}
            </div>
          </div>

          {error && <Alert>{error.message}</Alert>}

          {/* Buy / Sell / Dividend */}
          <div role="radiogroup" aria-label="Transaction type" className="grid grid-cols-3 rounded-lg border border-line p-1">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={type === t.value}
                onClick={() => setType(t.value)}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${type === t.value ? "bg-brand text-white" : "text-muted hover:text-brand"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {type === "sell" && (
            <p className="text-sm text-muted">
              You own <span className="font-medium text-foreground">{fmtShares(Math.max(owned, 0))}</span> shares
              {pos && pos.shares > 0 && <> at an average cost of {fmtPrice(pos.avgCost, ccy)}</>}.
            </p>
          )}

          {type !== "dividend" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Number of shares" htmlFor="shares">
                <Input id="shares" name="shares" type="number" inputMode="decimal" min="0" step="any" value={form.shares} onChange={set("shares")} aria-invalid={error?.field === "shares"} required />
              </Field>
              <Field label={`Price per share (${ccy})`} htmlFor="price">
                <Input
                  id="price"
                  name="price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.price}
                  onChange={set("price")}
                  placeholder={picked.currentPrice != null ? picked.currentPrice.toString() : ""}
                  aria-invalid={error?.field === "price"}
                  required
                />
              </Field>
            </div>
          ) : (
            <Field label={`Dividend received (${ccy})`} htmlFor="amount" hint="The total amount paid to you.">
              <Input id="amount" name="amount" type="number" inputMode="decimal" min="0" step="any" value={form.amount} onChange={set("amount")} aria-invalid={error?.field === "amount"} required />
            </Field>
          )}
          {type !== "dividend" && picked.currentPrice != null && form.price === "" && (
            <button type="button" onClick={() => setForm((f) => ({ ...f, price: String(picked.currentPrice) }))} className="-mt-2 text-xs font-medium text-brand hover:underline">
              Use current price ({fmtPrice(picked.currentPrice, ccy)})
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Trade date" htmlFor="tradeDate">
              <Input id="tradeDate" name="tradeDate" type="date" max={todayLocal()} value={form.tradeDate} onChange={set("tradeDate")} aria-invalid={error?.field === "tradeDate"} required />
            </Field>
            <Field label={`Fees (${ccy})`} htmlFor="fees">
              <Input id="fees" name="fees" type="number" inputMode="decimal" min="0" step="any" placeholder="0" value={form.fees} onChange={set("fees")} aria-invalid={error?.field === "fees"} />
            </Field>
          </div>

          <Field label="Notes (optional)" htmlFor="notes">
            <textarea
              id="notes"
              name="notes"
              rows={2}
              maxLength={500}
              value={form.notes}
              onChange={set("notes")}
              placeholder="e.g. Bought after the earnings dip"
              className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </Field>

          {/* Live preview */}
          <div className="rounded-xl bg-surface px-4 py-3 text-sm">
            {type === "buy" && (
              <Row label="Total cost" value={valid ? money(qty * px + fee, ccy) : "—"} />
            )}
            {type === "sell" && (
              <>
                <Row label="Proceeds (to cash)" value={valid ? money(qty * px - fee, ccy) : "—"} />
                {pos && pos.shares > 0 && (
                  <Row
                    label="Realized profit / loss"
                    value={valid ? money((px - pos.avgCost) * qty - fee, ccy, { sign: true }) : "—"}
                    className={valid ? gainClass((px - pos.avgCost) * qty - fee) : ""}
                  />
                )}
                {valid && qty > owned + 1e-9 && <p className="mt-2 text-loss">{messages.oversell}</p>}
              </>
            )}
            {type === "dividend" && <Row label="Added to cash" value={form.amount ? money(Number(form.amount) - (Number.isFinite(fee) ? fee : 0), ccy) : "—"} />}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? messages.savingTrade : editing ? "Save changes" : `Save ${type}`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tabular ${className}`}>{value}</span>
    </div>
  );
}
