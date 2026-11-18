"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { convert, market, MarketError, type FxTable, type SearchResult } from "@/lib/market";
import { messages } from "@/lib/messages";
import { money, price as fmtPrice, shares as fmtShares, todayLocal, gainClass } from "@/lib/format";
import { createTransaction, updateTransaction } from "@/app/(app)/actions/transactions";
import {
  GRAMS_PER_TROY_OUNCE,
  METALS,
  METALS_SECTOR,
  PURITIES,
  WEIGHT_UNITS,
  barFineOz,
  coinsFor,
  customFineOz,
  findCoin,
  fromOunces,
  fromPricePerOunce,
  isMetal,
  metalTicker,
  toOunces,
  toPricePerOunce,
  type MetalForm,
  type WeightUnit,
} from "@/lib/metals";
import { SegmentedToggle } from "./SegmentedToggle";
import { Modal } from "./Modal";
import { TickerSearch } from "./TickerSearch";
import { Alert, Button, Field, Input, Select } from "./ui";

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
  metalForm?: MetalForm | null;
  coinCode?: string | null;
  coinCount?: number | null;
  coinGrams?: number | null;
  purity?: number | null;
};

const METAL_FORMS: { value: MetalForm; label: string }[] = [
  { value: "bar", label: "Bar / Pure" },
  { value: "coin", label: "Coin" },
  { value: "custom", label: "Custom Coin" },
];

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
  cash = {},
}: {
  open: boolean;
  onClose: () => void;
  positions: PositionSummary;
  editing?: (EditableTxn & { funding?: "cash" | "new" | null }) | null;
  initialType?: "buy" | "sell" | "dividend";
  /** Open straight on this stock/metal (e.g. from its stock page) instead of the search step. */
  presetTicker?: string;
  /** Cash in this portfolio by currency, to show what a buy "from cash" would use. */
  cash?: Record<string, number>;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [type, setType] = useState<"buy" | "sell" | "dividend">(initialType);
  const [form, setForm] = useState({ shares: "", price: "", amount: "", fees: "", tradeDate: "", notes: "" });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Buys: paid from cash already in Folio, or with new money (then a matching deposit is recorded)
  const [funding, setFunding] = useState<"cash" | "new" | null>(null);
  // Exchange rates, loaded when the buy could use cash held in another currency (e.g. USD cash for a KWD stock)
  const [fx, setFx] = useState<FxTable | null>(null);
  const [unit, setUnitState] = useState<WeightUnit>("g"); // grams by default; Troy Oz one click away
  const metal = !!picked && isMetal(picked.ticker);
  const metalKey = picked && isMetal(picked.ticker) ? METALS[picked.ticker].key : "gold";
  // How gold/silver is entered: a bar (weight + purity), a coin from the list, or a custom coin
  const [metalForm, setMetalForm] = useState<MetalForm>("bar");
  const [coinCode, setCoinCode] = useState<string>("");
  const [purity, setPurity] = useState<number>(1);
  const [coinGrams, setCoinGrams] = useState<string>("");
  const [customPurity, setCustomPurity] = useState<string>("");

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
      setUnitState("g");
      setType("buy");
      setMetalForm("bar");
      setPurity(1);
      setCoinCode(coinsFor(key)[0]?.code ?? "");
      setCoinGrams("");
      setCustomPurity("");
      setPicked({ ticker, name: METALS[ticker].name, exchange: "COMEX", currency: "USD", sector: METALS_SECTOR, currentPrice: quote?.price ?? null, stale: quote?.stale });
    } finally {
      setLoadingInfo(false);
    }
  }

  const pickedCcy = picked?.currency ?? null;
  const otherCcyCash = !!pickedCcy && Object.entries(cash).some(([c, a]) => c !== pickedCcy && a > 0.005);
  useEffect(() => {
    if (!open || !otherCcyCash || fx) return;
    let cancelled = false;
    market
      .fx(createClient())
      .then((t) => {
        if (!cancelled) setFx(t);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, otherCcyCash, fx]);

  // Reset every time the pop-up opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setUnitState("g");
    if (editing) {
      setPicked({ ticker: editing.ticker, name: editing.name, exchange: null, currency: editing.currency, sector: "", currentPrice: null });
      setType(editing.type);
      setFunding(editing.type === "buy" ? editing.funding ?? "cash" : null);
      let shares = editing.shares?.toString() ?? "";
      let price = editing.price?.toString() ?? "";
      const round = (x: number, d = 6) => String(Math.round(x * 10 ** d) / 10 ** d);
      const paid = (editing.shares ?? 0) * (editing.price ?? 0);
      const form = isMetal(editing.ticker) ? editing.metalForm ?? "bar" : "bar";
      setMetalForm(form);
      setCoinCode(editing.coinCode ?? coinsFor(isMetal(editing.ticker) ? METALS[editing.ticker].key : "gold")[0]?.code ?? "");
      setCoinGrams(editing.coinGrams ? String(editing.coinGrams) : "");
      setCustomPurity(editing.metalForm === "custom" && editing.purity ? round(editing.purity * 100, 3) : "");
      setPurity(editing.metalForm === "bar" && editing.purity ? editing.purity : 1);
      if (isMetal(editing.ticker) && (form === "coin" || form === "custom") && editing.coinCount) {
        // back to "number of coins" and "price per coin"
        shares = String(editing.coinCount);
        price = round(paid / editing.coinCount, 2); // cents: stored price-per-ounce rounding would otherwise show e.g. 210.0002
      } else if (isMetal(editing.ticker) && editing.shares) {
        // bars open in grams: the bar's full weight (pure weight ÷ purity) and price per gram of bar
        const p = form === "bar" && editing.purity ? editing.purity : 1;
        shares = round(fromOunces(editing.shares / p, "g"), 4);
        price = round(fromPricePerOunce(editing.price ?? 0, "g") * p, 4);
      }
      setForm({
        shares,
        price,
        amount: editing.amount?.toString() ?? "",
        fees: editing.fees ? editing.fees.toString() : "",
        tradeDate: editing.tradeDate,
        notes: editing.notes ?? "",
      });
    } else {
      setPicked(null);
      setType(initialType);
      setFunding(null);
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
  // For metals, positions are stored in PURE troy ounces; coins and bars below 24k are converted to pure content
  const coin = findCoin(coinCode);
  const customP = Number(customPurity) / 100;
  const isCoinForm = metal && (metalForm === "coin" || metalForm === "custom");
  const fineOzPerCoin = metalForm === "coin" ? coin?.fineOz ?? NaN : customFineOz(1, Number(coinGrams), customP);
  const fineOz = !metal ? NaN : metalForm === "bar" ? barFineOz(qty, unit, purity) : qty * fineOzPerCoin;
  const unitLabel = WEIGHT_UNITS.find((u) => u.value === unit)?.label ?? "Troy Oz";
  const unitShort = WEIGHT_UNITS.find((u) => u.value === unit)?.short ?? "oz";
  const unitWord = unit === "oz" ? "Ounce" : "Gram";
  const ownedLabel = metal ? `${fmtShares(Math.round(Math.max(fromOunces(owned, isCoinForm ? "g" : unit), 0) * 1e4) / 1e4)} ${isCoinForm ? "g" : unitShort} pure` : `${fmtShares(Math.round(Math.max(owned, 0) * 1e4) / 1e4)} shares`;
  // Cash this buy would use (when editing a buy paid from cash, its own cost is still in the balance)
  const editingCost = editing && editing.type === "buy" && editing.funding !== "new" ? (editing.shares ?? 0) * (editing.price ?? 0) + (editing.fees ?? 0) : 0;
  const balances: Record<string, number> = { ...cash };
  if (editingCost) balances[ccy] = (balances[ccy] ?? 0) + editingCost;
  const held = Object.entries(balances).filter(([, a]) => a > 0.005);
  const needsFx = held.some(([c]) => c !== ccy);
  const ratesReady = !needsFx || !!fx;
  const cost = valid ? qty * px + fee : 0;
  // Same order as the books: same-currency cash first, then other currencies (largest first); the rest is new money
  const after = (() => {
    const out: Record<string, number> = { ...Object.fromEntries(held) };
    let remaining = funding === "cash" ? cost : 0;
    const take = (c: string) => {
      if (remaining <= 1e-9 || !(out[c] > 0)) return;
      const availInCcy = c === ccy ? out[c] : convert(out[c], c, ccy, fx);
      if (availInCcy == null || availInCcy <= 0) return;
      const use = Math.min(availInCcy, remaining);
      out[c] -= c === ccy ? use : convert(use, ccy, c, fx) ?? 0;
      remaining -= use;
    };
    take(ccy);
    held
      .filter(([c]) => c !== ccy)
      .sort((a, b) => (convert(b[1], b[0], ccy, fx) ?? 0) - (convert(a[1], a[0], ccy, fx) ?? 0))
      .forEach(([c]) => take(c));
    return { balances: Object.entries(out).filter(([, a]) => a > 0.005), shortfall: remaining };
  })();
  const cashText = (list: [string, number][]) => (list.length ? list.map(([c, a]) => money(a, c)).join(" + ") : money(0, ccy));
  const cashLine = !held.length
    ? `Your cash: ${money(0, ccy)}`
    : `Your cash: ${cashText(held)}`;
  const spot = picked?.currentPrice ?? null;
  // Current price in the same terms the user types: per share, per unit of bar weight, or melt value per coin
  const currentInUnit =
    spot == null ? null : !metal ? spot : metalForm === "bar" ? fromPricePerOunce(spot, unit) * purity : Number.isFinite(fineOzPerCoin) && fineOzPerCoin > 0 ? spot * fineOzPerCoin : null;
  const avgInUnit = pos ? (metal ? fromPricePerOunce(pos.avgCost, "g") : pos.avgCost) : 0;
  const costOfSold = pos ? (metal ? pos.avgCost * fineOz : pos.avgCost * qty) : 0;
  const sellingTooMuch = valid && (metal ? fineOz > owned + 1e-9 : qty > owned + 1e-9);
  const pureGramsLabel = metal && Number.isFinite(fineOz) && fineOz > 0 ? `${fmtShares(Math.round(fineOz * GRAMS_PER_TROY_OUNCE * 1000) / 1000)} g pure ${METALS[picked!.ticker as keyof typeof METALS].name.toLowerCase()}` : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return setError({ message: "Pick a stock from the list first.", field: "ticker" });
    if (type === "buy" && !funding) return setError({ message: "Tell Folio how you paid: from your cash, or with new money you added.", field: "funding" });
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("ticker", picked.ticker);
    fd.set("type", type);
    if (type === "buy" && funding) fd.set("funding", funding);
    // No date picked: record the trade on today's date (the user's own calendar day)
    if (!String(fd.get("tradeDate") ?? "").trim()) fd.set("tradeDate", todayLocal());
    if (metal && type !== "dividend") {
      // store metals as PURE troy ounces and price per pure troy ounce (melt value basis)
      if (Number.isFinite(fineOz) && fineOz > 0) {
        fd.set("shares", String(fineOz));
        if (Number.isFinite(px)) fd.set("price", String((qty * px) / fineOz));
      }
      fd.set("metalForm", metalForm);
      if (metalForm === "bar") fd.set("purity", String(purity));
      if (metalForm === "coin") {
        fd.set("coinCode", coinCode);
        fd.set("coinCount", form.shares);
      }
      if (metalForm === "custom") {
        fd.set("coinCount", form.shares);
        fd.set("coinGrams", coinGrams);
        fd.set("purity", Number.isFinite(customP) ? String(customP) : "");
      }
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
              <p className="truncate text-sm text-muted">{metal ? "Valued at melt value: pure metal × live price" : picked.name}</p>
              {(picked.exchange || picked.sector) && (
                <p className="mt-0.5 text-xs text-muted">{[picked.exchange, picked.sector, picked.currency].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              {currentInUnit != null && (
                <>
                  <p className="text-xs text-muted">{isCoinForm ? "Melt Value" : "Current Price"}</p>
                  <p className="font-semibold tabular">
                    {fmtPrice(currentInUnit, ccy)}
                    {metal && <span className="text-xs font-normal text-muted"> / {isCoinForm ? "coin" : unitShort}</span>}
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
            <div role="radiogroup" aria-label="How is it held?" className="grid grid-cols-3 gap-1 rounded-lg bg-surface p-1">
              {METAL_FORMS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={metalForm === f.value}
                  onClick={() => {
                    if (f.value === metalForm) return;
                    // amount and price mean different things per form (weight vs. coins), so start fresh
                    setMetalForm(f.value);
                    setForm((s) => ({ ...s, shares: "", price: "" }));
                    setError(null);
                  }}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors ${metalForm === f.value ? "bg-white text-brand shadow-sm" : "text-muted hover:text-brand"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {metal && metalForm === "bar" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2 sm:col-span-2">
                <span className="text-sm text-muted">Weight Unit</span>
                <SegmentedToggle label="Weight Unit" value={unit} onChange={setUnit} options={WEIGHT_UNITS.map((u) => ({ value: u.value, label: u.label }))} />
              </div>
              <Field label="Purity" htmlFor="purity">
                <Select id="purity" value={String(purity)} onChange={(e) => setPurity(Number(e.target.value))}>
                  {PURITIES[metalKey].map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {metal && metalForm === "coin" && (
            <Field label="Coin" htmlFor="coinCode" hint={coin ? `${coin.grossGrams} g each · ${fmtShares(Math.round(coin.fineOz * GRAMS_PER_TROY_OUNCE * 1000) / 1000)} g pure` : undefined}>
              <Select id="coinCode" value={coinCode} onChange={(e) => setCoinCode(e.target.value)} aria-invalid={error?.field === "coinCode"}>
                {coinsFor(metalKey).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {metal && metalForm === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight Per Coin (Grams)" htmlFor="coinGrams">
                <Input id="coinGrams" type="number" inputMode="decimal" min="0" step="any" value={coinGrams} onChange={(e) => setCoinGrams(e.target.value)} aria-invalid={error?.field === "coinGrams"} />
              </Field>
              <Field label="Purity (%)" htmlFor="customPurity" hint="e.g. 91.67 for 22k, 90 for 900 fine.">
                <Input id="customPurity" type="number" inputMode="decimal" min="1" max="100" step="any" value={customPurity} onChange={(e) => setCustomPurity(e.target.value)} aria-invalid={error?.field === "purity"} />
              </Field>
            </div>
          )}

          {type === "sell" && (
            <p className="text-sm text-muted">
              You own <span className="font-medium text-foreground">{ownedLabel}</span>
              {pos && pos.shares > 0 && <> at an average cost of {fmtPrice(avgInUnit, ccy)}{metal ? " / g pure" : ""}</>}.
            </p>
          )}

          {type !== "dividend" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={!metal ? "Number Of Shares" : isCoinForm ? "Number Of Coins" : `Weight (${unitLabel})`} htmlFor="shares" hint={pureGramsLabel ? `= ${pureGramsLabel}` : undefined}>
                <Input id="shares" name="shares" type="number" inputMode={isCoinForm ? "numeric" : "decimal"} min="0" step={isCoinForm ? "1" : "any"} value={form.shares} onChange={set("shares")} aria-invalid={error?.field === "shares"} required />
              </Field>
              <Field label={!metal ? `Price Per Share (${ccy})` : isCoinForm ? `Price Per Coin (${ccy})` : `Price Per ${unitWord} (${ccy})`} htmlFor="price">
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
              {isCoinForm ? "Use Melt Value" : "Use Current Price"} ({fmtPrice(currentInUnit, ccy)}{metal ? ` / ${isCoinForm ? "coin" : unitShort}` : ""})
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

          {type === "buy" && (
            <fieldset aria-invalid={error?.field === "funding"}>
              <legend className="text-sm font-medium">How did you pay for this?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: "cash", title: "From my cash in Folio", text: cashLine },
                    { value: "new", title: "With new money I added", text: "Folio records a deposit for the cost, so your cash isn't reduced." },
                  ] as const
                ).map((o) => (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors ${
                      funding === o.value ? "border-brand bg-brand-soft/50" : error?.field === "funding" ? "border-loss/50" : "border-line hover:border-brand/40"
                    }`}
                  >
                    <input type="radio" name="fundingChoice" value={o.value} checked={funding === o.value} onChange={() => setFunding(o.value)} className="mt-1 accent-[var(--brand)]" />
                    <span>
                      <span className="block text-sm font-semibold">{o.title}</span>
                      <span className="block text-xs text-muted">{o.text}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Live preview */}
          <div className="rounded-xl bg-surface px-4 py-3 text-sm">
            {type === "buy" && (
              <>
                <Row label="Total Cost" value={valid ? money(qty * px + fee, ccy) : "—"} />
                {funding && valid && <Row label="Cash After" value={!ratesReady ? "Converting…" : cashText(funding === "new" ? held : after.balances)} />}
                {funding === "cash" && valid && ratesReady && after.shortfall > 0.005 && (
                  <p className="mt-1 text-xs text-warn">Cash used up. {money(after.shortfall, ccy)} counted as money added.</p>
                )}
              </>
            )}
            {type === "sell" && (
              <>
                <Row label="Proceeds (To Cash)" value={valid ? money(qty * px - fee, ccy) : "—"} />
                {pos && pos.shares > 0 && (
                  <Row
                    label="Realized Profit / Loss"
                    value={valid ? money(qty * px - costOfSold - fee, ccy, { sign: true }) : "—"}
                    className={valid ? gainClass(qty * px - costOfSold - fee) : ""}
                  />
                )}
                {sellingTooMuch && <p className="mt-2 text-loss">{metal ? "You can't sell more metal than you own." : messages.oversell}</p>}
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
