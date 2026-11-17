"use client";

import { useState } from "react";
import { Button } from "./ui";
import { TransactionModal, type PositionSummary } from "./TransactionModal";

export function AddTransactionButton({ positions, label = "Add Transaction" }: { positions: PositionSummary; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {label}
      </Button>
      <TransactionModal open={open} onClose={() => setOpen(false)} positions={positions} />
    </>
  );
}
