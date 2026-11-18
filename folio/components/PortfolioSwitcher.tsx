"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_PORTFOLIOS, type Portfolio } from "@/lib/portfolios";
import { selectPortfolio } from "@/app/(app)/actions/portfolios";
import { PaperBadge } from "./PaperBadge";
import { NewPortfolioModal } from "./NewPortfolioModal";
import { ManagePortfolioModal } from "./ManagePortfolioModal";

/** Bar under the tabs: which portfolio you're looking at, a menu to switch, + New Portfolio, and Manage. */
export function PortfolioSwitcher({ portfolios, currentId, baseCurrency }: { portfolios: Portfolio[]; currentId: string; baseCurrency: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const current = portfolios.find((p) => p.id === currentId) ?? portfolios[0];
  const full = portfolios.length >= MAX_PORTFOLIOS;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  function pick(id: string) {
    setMenu(false);
    if (id === current?.id) return;
    setError(null);
    start(async () => {
      const res = await selectPortfolio(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  if (!current) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menu}
          aria-label={`Current portfolio: ${current.name}${current.kind === "paper" ? " (Paper)" : ""}. Switch portfolio`}
          onClick={() => setMenu((m) => !m)}
          disabled={pending}
          className="inline-flex min-h-10 max-w-[16rem] items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:border-brand/50 disabled:opacity-60 sm:max-w-sm"
        >
          <span className="text-xs font-medium text-muted">Portfolio</span>
          <span className="truncate">{current.name}</span>
          {current.kind === "paper" && <PaperBadge />}
          <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="currentColor" aria-hidden="true">
            <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {menu && (
          <ul role="listbox" aria-label="Your portfolios" className="absolute left-0 z-40 mt-1.5 max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-xl">
            {portfolios.map((p) => (
              <li key={p.id} role="option" aria-selected={p.id === current.id}>
                <button
                  type="button"
                  onClick={() => pick(p.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-brand-soft ${p.id === current.id ? "font-semibold text-brand" : ""}`}
                >
                  <span className="w-4 text-brand" aria-hidden="true">{p.id === current.id ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.kind === "paper" && <PaperBadge />}
                  {p.is_public && <span className="text-[10px] font-medium uppercase text-muted">Public</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setCreating(true)}
        disabled={full}
        title={full ? `You can have up to ${MAX_PORTFOLIOS} portfolios.` : undefined}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true" className="text-base leading-none">+</span> New Portfolio
      </button>
      <button type="button" onClick={() => setManaging(true)} className="inline-flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-brand-soft hover:text-brand">
        Manage
      </button>
      {error && <p className="w-full text-xs text-loss">{error}</p>}

      <NewPortfolioModal open={creating} onClose={() => setCreating(false)} baseCurrency={baseCurrency} />
      {managing && <ManagePortfolioModal key={current.id} open onClose={() => setManaging(false)} portfolio={current} isOnly={portfolios.length <= 1} />}
    </div>
  );
}
