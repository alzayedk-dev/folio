"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Alert, Button, Field, Input, Select } from "./ui";
import { CURRENCIES } from "@/lib/currencies";
import type { PortfolioKind } from "@/lib/portfolios";
import { createPortfolio } from "@/app/(app)/actions/portfolios";

const KINDS: { value: PortfolioKind; title: string; text: string }[] = [
  { value: "real", title: "Real", text: "Money you've actually invested, in any account." },
  { value: "paper", title: "Paper", text: "Practice with pretend money to test ideas, risk-free." },
];

export function NewPortfolioModal({ open, onClose, baseCurrency }: { open: boolean; onClose: () => void; baseCurrency: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<PortfolioKind>("real");
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  // onSubmit (not form action) so React keeps what the user typed when there is an error
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await createPortfolio(formData);
      if (!res.ok) return setError({ text: res.error, field: res.field });
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="New Portfolio">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Name" htmlFor="pf-name" hint="Anything you like, up to 40 characters.">
          <Input id="pf-name" name="name" maxLength={40} required autoFocus placeholder="e.g. Dividend Ideas" aria-invalid={error?.field === "name"} />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium">Type</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${kind === k.value ? "border-brand bg-brand-soft/50" : "border-line hover:border-brand/40"}`}
              >
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="mt-1 accent-[var(--brand)]" />
                <span>
                  <span className="block text-sm font-semibold">{k.title}</span>
                  <span className="block text-xs text-muted">{k.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label={kind === "paper" ? "Starting Cash" : "Starting Cash (Optional)"} htmlFor="pf-cash" hint={kind === "paper" ? "Your pretend money, e.g. 10,000." : "Cash already in this account. You can add it later."}>
            <Input id="pf-cash" name="startingCash" type="number" inputMode="decimal" min={0} step="any" placeholder={kind === "paper" ? "10000" : "0"} aria-invalid={error?.field === "startingCash"} />
          </Field>
          <Field label="Currency" htmlFor="pf-ccy">
            <Select id="pf-ccy" name="currency" defaultValue={baseCurrency}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error && <Alert>{error.text}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Opening The Books…" : "Create Portfolio"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
