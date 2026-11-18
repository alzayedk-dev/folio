"use client";

import { useEffect, useState } from "react";

export const INVESTED_NOTE_THRESHOLD = 80;

/** Share of the portfolio that's invested (stocks + metals), in %. */
export function investedPct(invested: number, total: number): number {
  return total > 0 ? (invested / total) * 100 : 0;
}

/**
 * Gentle reminder when more than 80% of the portfolio is invested: some cash can be a safety net.
 * Can be dismissed; it comes back the next day if it still applies.
 */
export function CashSafetyNote({ invested, total }: { invested: number; total: number }) {
  const pct = investedPct(invested, total);
  const key = `folio.cashNote.${new Date().toISOString().slice(0, 10)}`;
  const [hidden, setHidden] = useState(true); // decided after reading the saved choice, so it never flashes

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(key) === "1";
    } catch {
      /* private mode etc.: just show it */
    }
    setHidden(dismissed);
  }, [key]);

  if (pct <= INVESTED_NOTE_THRESHOLD || hidden) return null;
  const cashPct = Math.max(0, 100 - pct);

  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm">
      <span aria-hidden="true" className="mt-0.5 text-base leading-none">💡</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          You&apos;re {pct.toFixed(0)}% invested, with {cashPct.toFixed(0)}% in cash.
        </p>
        <p className="mt-0.5 text-muted">
          You might want to reconsider your cash position. Many investors keep some cash as a safety net for emergencies or for buying opportunities. A thought, not advice.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(key, "1");
          } catch {
            /* ignore */
          }
        }}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-amber-100 hover:text-foreground"
      >
        Got It
      </button>
    </div>
  );
}
