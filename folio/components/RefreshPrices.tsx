"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/** Shows when prices were last updated, refreshes every 60 s while the tab is visible, and offers a manual refresh. */
export function RefreshPrices({ asOf, intervalMs = 60_000 }: { asOf: string | null; intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  useEffect(() => setLoadedAt(Date.now()), [asOf]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  const label = asOf
    ? new Date(asOf).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : new Date(loadedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span aria-live="polite">{pending ? "Updating prices…" : `Prices as of ${label}`}</span>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="rounded-md px-2 py-1 font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
      >
        Refresh
      </button>
    </div>
  );
}
