"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENCIES } from "@/lib/currencies";
import { money, todayLocal } from "@/lib/format";
import { messages } from "@/lib/messages";
import { setCashBalance, deleteCashEntry } from "@/app/(app)/actions/cash";
import { Modal } from "./Modal";
import { Alert, Button, Field, Input, Select } from "./ui";

export type CashEntryView = { id: string; kind: "starting" | "balance" | "deposit" | "withdrawal"; amount: number; currency: string; entryDate: string };

const KIND_LABEL: Record<CashEntryView["kind"], string> = {
  starting: "Starting Cash",
  balance: "Balance Update",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
};

export function CashCard({
  balances,
  total,
  base,
  entries,
}: {
  balances: { currency: string; amount: number; value: number }[];
  total: number;
  base: string;
  entries: CashEntryView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Pre-fill with the current balance in its own currency; with several currencies, use the converted total in the base currency
  const single = balances.length === 1 ? balances[0] : null;
  const defaultCurrency = single ? single.currency : base;
  const defaultAmount = single ? single.amount : total;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await setCashBalance(new FormData(e.currentTarget));
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!window.confirm("Remove this cash entry? Your cash and performance will be recalculated.")) return;
    setDeleting(id);
    const res = await deleteCashEntry(id);
    setDeleting(null);
    if (!res.ok) return window.alert(res.error);
    router.refresh();
  }

  return (
    <section aria-labelledby="cash-heading" className="rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <h2 id="cash-heading" className="font-semibold">Cash</h2>
        <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => { setError(null); setOpen(true); }}>
          Update Cash
        </Button>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-2xl font-semibold tabular">{money(total, base)}</p>
        {balances.length > 1 || (balances[0] && balances[0].currency !== base) ? (
          <ul className="mt-2 space-y-1 text-sm text-muted tabular">
            {balances.map((b) => (
              <li key={b.currency} className="flex justify-between">
                <span>{money(b.amount, b.currency)}</span>
                {b.currency !== base && <span>≈ {money(b.value, base)}</span>}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-xs text-muted">Sales and dividends add cash automatically. Moved money to your bank? Update your balance.</p>
      </div>

      {entries.length > 0 && (
        <details className="border-t border-line px-4 py-3 text-sm sm:px-5">
          <summary className="cursor-pointer text-xs font-medium text-brand">Cash History ({entries.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="block">{KIND_LABEL[e.kind]}</span>
                  <span className="block text-xs text-muted">{e.entryDate}</span>
                </span>
                <span className="flex items-center gap-2 tabular">
                  {money(e.amount, e.currency)}
                  <button
                    type="button"
                    onClick={() => onDelete(e.id)}
                    disabled={deleting === e.id}
                    aria-label={`Remove ${KIND_LABEL[e.kind]} of ${money(e.amount, e.currency)} on ${e.entryDate}`}
                    className="rounded p-1 text-muted hover:bg-red-50 hover:text-loss disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Update Cash Balance">
        <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
          <p className="text-sm text-muted">Enter the total cash in your brokerage account. It replaces your previous balance from this date on.</p>
          {error && <Alert>{error}</Alert>}
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field label="Cash Balance" htmlFor="cash-amount">
              <Input id="cash-amount" name="amount" type="number" inputMode="decimal" min="0" step="any" defaultValue={defaultAmount > 0 ? String(Math.round(defaultAmount * 100) / 100) : ""} required />
            </Field>
            <Field label="Currency" htmlFor="cash-currency">
              <Select id="cash-currency" name="currency" defaultValue={defaultCurrency}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="As Of" htmlFor="cash-date">
            <Input id="cash-date" name="entryDate" type="date" max={todayLocal()} defaultValue={todayLocal()} required />
          </Field>
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={saving}>{saving ? messages.savingCash : "Save Balance"}</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
