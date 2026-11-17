"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { market, MarketError, type SearchResult } from "@/lib/market";
import { messages } from "@/lib/messages";
import { money, price as fmtPrice, shares as fmtShares, todayLocal, gainClass } from "@/lib/format";
import { createTransaction, updateTransaction } from "@/app/(app)/actions/transactions";
import { METALS, METALS_SECTOR, fromOunces, fromPricePerOunce, isMetal, metalTicker, toOunces, toPricePerOunce, type WeightUnit } from "@/lib/metals";
import { SegmentedToggle } from "./SegmentedToggle";
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
  presetTicker,
}: {
  open: boolean;
  onClose: () => void;
  positions: PositionSummary;
  editing?: EditableTxn | null;
  initialType?: "buy" | "sell" | "dividend";
  /** Open straight on this stock/metal (e.g. from its stock page) instead of the search step. */
  presetTicker?: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [type, setType] = useState<"buy" | "sell" | "dividend">(initialType);
  const [form, setForm] = useState({ shares: "", price: "", amount: "", fees: "", tradeDate: "", notes: "" });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [unit, setUnitState] = useState<WeightUnit>("oz");
  const metal = !!picked && isMetal(picked.ticker);

  /** Switching oz ⇄ g converts whatever has been typed so the trade stays the same. */
  function setUnit(next: WeightUnit) {
    if (next === unit) return;
    setForm((f) => {
      // grams to 4 decimals, ounces to 6, so switching back and forth returns the typed number
      const factor = next === "g" ? 1e4 : 1e6;
      const conv = (s: string, fn: (v: number) => number) => (s.trim() === "" || !Number.isFinite(Number(s)) ? s : String(Math.round(fn(Number(s)) * factor) / factor));
      return {
        ...f,
        shares: conv(f.shares, (v) => fromOunces(toOunces(v, unit), next)),
        price: conv(f.price, (v) => fromPricePerOunce(toPricePerOunce(v, unit), next)),
      };
    });
    setUnitState(next);
  }

  async function pickMetal(key: "gold" | "silver") {
    setError(null);
    setLoadingInfo(true);
    const ticker = metalTicker(key);
    try {
      const q = await market.quotes(createClient(), [ticker]).catch(() => null);
      const quote = q?.quotes[ticker];
      setUnitState("oz");
      setType("buy");
      setPicked({ ticker, name: METALS[ticker].name, exchange: "COMEX", currency: "USD", sector: METALS_SECTOR, currentPrice: quote?.price ?? null, stale: quote?.stale });
    } finally {
      setLoadingInfo(false);
    }
  }

  // Reset every time the pop-up opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setUnitState("oz");
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
      setForm({ shares: "", price: "", amount: "", fees: "", tradeDate: "", notes: "" });
      if (presetTicker) {
        if (isMetal(presetTicker)) void pickMetal(METALS[presetTicker].key);
        else void pick({ ticker: presetTicker, name: presetTicker, exchange: null, type: "EQUITY" });
      }
    }
  }, [open, editing, initialType, presetTicker]);

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
  // For metals, positions are stored in troy ounces; show them in the chosen unit
  const ownedInUnit = metal ? fromOunces(owned, unit) : owned;
  const avgInUnit = pos ? (metal ? fromPricePerOunce(pos.avgCost, unit) : pos.avgCost) : 0;
  const currentInUnit = picked?.currentPrice != null ? (metal ? fromPricePerOunce(picked.currentPrice, unit) : picked.currentPrice) : null;
  const unitWord = unit === "oz" ? "Ounce" : "Gram";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return setError({ message: "Pick a stock from the list first.", field: "ticker" });
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("ticker", picked.ticker);
    fd.set("type", type);
    // No date picked: record the trade on today's date (the user's own calendar day)
    if (!String(fd.get("tradeDate") ?? "").trim()) fd.set("tradeDate", todayLocal());
    if (metal && type !== "dividend") {
      // store metals in troy ounces and price per troy ounce
      if (Number.isFinite(qty)) fd.set("shares", String(toOunces(qty, unit)));
      if (Number.isFinite(px)) fd.set("price", String(toPricePerOunce(px, unit)));
    }
    const res = editing ? await updateTransaction(editing.id, fd) : await createTransaction(fd);
    setSaving(false);
    if (!res.ok) return setError({ message: res.error, field: res.field });
    onClose();
    router.refresh();
  }

  const title = editing ? "Edit Transaction" : "Add Transaction";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {!picked ? (
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-sm text-muted">What did you trade?</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Asset type">
              <span className="rounded-lg border-2 border-brand bg-brand-soft py-2 text-center text-sm font-medium text-brand-strong">Stock</span>
              <button type="button" onClick={() => pickMetal("gold")} className="rounded-lg border border-line py-2 text-sm font-medium text-foreground hover:border-brand hover:text-brand">
                Gold
              </button>
              <button type="button" onClick={() => pickMetal("silver")} className="rounded-lg border border-line py-2 text-sm font-medium text-foreground hover:border-brand hover:text-brand">
                Silver
              </button>
            </div>
          </div>
          <TickerSearch onPick={pick} autoFocus />
          {loadingInfo && <p className="text-sm text-muted">{messages.loading}</p>}
          {error && <Alert>{error.message}</Alert>}
        </div>
      ) : (
        <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
          {/* Stock header */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-brand-soft/50 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{metal ? picked.name : picked.ticker}</p>
              <p className="truncate text-sm text-muted">{metal ? "Precious metal, priced per troy ounce" : picked.name}</p>
              {(picked.exchange || picked.sector) && (
                <p className="mt-0.5 text-xs text-muted">{[picked.exchange, picked.sector, picked.currency].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              {currentInUnit != null && (
                <>
                  <p className="text-xs text-muted">Current Price</p>
                  <p className="font-semibold tabular">
                    {fmtPrice(currentInUnit, ccy)}
                    {metal && <span className="text-xs font-normal text-muted"> / {unit}</span>}
                  </p>
                </>
              )}
              {!editing && (
                <button type="button" onClick={() => setPicked(null)} className="mt-1 text-xs font-medium text-brand hover:underline">
                  {metal ? "Change Asset" : "Change Stock"}
                </button>
              )}
            </div>
          </div>

          {error && <Alert>{error.message}</Alert>}

          {/* Buy / Sell / Dividend */}
          <div role="radiogroup" aria-label="Transaction type" className={`grid ${metal ? "grid-cols-2" : "grid-cols-3"} rounded-lg border border-line p-1`}>
            {TYPES.filter((t) => !metal || t.value !== "dividend").map((t) => (
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

          {metal && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Weight Unit</span>
              <SegmentedToggle
                label="Weight Unit"
                value={unit}
                onChange={setUnit}
                options={[
                  { value: "oz", label: "Troy Oz" },
                  { value: "g", label: "Grams" },
                ]}
              />
            </div>
          )}

          {type === "sell" && (
            <p className="text-sm text-muted">
              You own <span className="font-medium text-foreground">{fmtShares(Math.round(Math.max(ownedInUnit, 0) * 1e4) / 1e4)}</span> {metal ? (unit === "oz" ? "oz" : "g") : "shares"}
              {pos && pos.shares > 0 && <> at an average cost of {fmtPrice(avgInUnit, ccy)}{metal ? ` / ${unit}` : ""}</>}.
            </p>
          )}

          {type !== "dividend" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={metal ? `Weight (${unit === "oz" ? "Troy Oz" : "Grams"})` : "Number Of Shares"} htmlFor="shares">
                <Input id="shares" name="shares" type="number" inputMode="decimal" min="0" step="any" value={form.shares} onChange={set("shares")} aria-invalid={error?.field === "shares"} required />
              </Field>
              <Field label={metal ? `Price Per ${unitWord} (${ccy})` : `Price Per Share (${ccy})`} htmlFor="price">
                <Input
                  id="price"
                  name="price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.price}
                  onChange={set("price")}
                  placeholder={currentInUnit != null ? String(Math.round(currentInUnit * 100) / 100) : ""}
                  aria-invalid={error?.field === "price"}
                  required
                />
              </Field>
            </div>
          ) : (
            <Field label={`Dividend Received (${ccy})`} htmlFor="amount" hint="The total amount paid to you.">
              <Input id="amount" name="amount" type="number" inputMode="decimal" min="0" step="any" value={form.amount} onChange={set("amount")} aria-invalid={error?.field === "amount"} required />
            </Field>
          )}
          {type !== "dividend" && currentInUnit != null && form.price === "" && (
            <button type="button" onClick={() => setForm((f) => ({ ...f, price: String(Math.round(currentInUnit * 100) / 100) }))} className="-mt-2 text-xs font-medium text-brand hover:underline">
              Use Current Price ({fmtPrice(currentInUnit, ccy)}{metal ? ` / ${unit}` : ""})
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Trade Date (Optional)" htmlFor="tradeDate" hint="Leave empty to use today.">
              <Input id="tradeDate" name="tradeDate" type="date" max={todayLocal()} value={form.tradeDate} onChange={set("tradeDate")} aria-invalid={error?.field === "tradeDate"} />
            </Field>
            <Field label={`Fees (${ccy})`} htmlFor="fees">
              <Input id="fees" name="fees" type="number" inputMode="decimal" min="0" step="any" placeholder="0" value={form.fees} onChange={set("fees")} aria-invalid={error?.field === "fees"} />
            </Field>
          </div>

          <Field label="Notes (Optional)" htmlFor="notes">
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
              <Row label="Total Cost" value={valid ? money(qty * px + fee, ccy) : "—"} />
            )}
            {type === "sell" && (
              <>
                <Row label="Proceeds (To Cash)" value={valid ? money(qty * px - fee, ccy) : "—"} />
                {pos && pos.shares > 0 && (
                  <Row
                    label="Realized Profit / Loss"
                    value={valid ? money((px - avgInUnit) * qty - fee, ccy, { sign: true }) : "—"}
                    className={valid ? gainClass((px - avgInUnit) * qty - fee) : ""}
                  />
                )}
                {valid && qty > ownedInUnit + 1e-9 && <p className="mt-2 text-loss">{metal ? "You can't sell more metal than you own." : messages.oversell}</p>}
              </>
            )}
            {type === "dividend" && <Row label="Added To Cash" value={form.amount ? money(Number(form.amount) - (Number.isFinite(fee) ? fee : 0), ccy) : "—"} />}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? messages.savingTrade : editing ? "Save Changes" : `Save ${type[0].toUpperCase()}${type.slice(1)}`}
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
