"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { market, MarketError, type SearchResult } from "@/lib/market";
import { messages } from "@/lib/messages";
import { Input } from "./ui";

/** Type a ticker or company name; suggestions appear after a short pause. */
export function TickerSearch({ onPick, autoFocus }: { onPick: (r: SearchResult) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const reqId = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const id = ++reqId.current;
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const r = await market.search(createClient(), query);
        if (id !== reqId.current) return; // a newer search started
        setResults(r);
        setActive(0);
        setStatus("done");
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof MarketError ? e.friendly : messages.serverBusy);
        setStatus("error");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick(results[active]);
    }
  }

  const open = q.trim().length > 0;

  return (
    <div className="relative">
      <Input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search for a stock by ticker or company name"
        placeholder="Type a ticker or company, e.g. LLY or Eli Lilly"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
      />
      {/* Results sit in the page flow (not floating), so the pop-up grows to show them instead of cutting them off */}
      {open && (
        <div className="mt-2 w-full overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          {status === "loading" && <p className="px-4 py-3 text-sm text-muted">Scanning the exchanges…</p>}
          {status === "error" && <p className="px-4 py-3 text-sm text-loss">{error}</p>}
          {status === "done" && results.length === 0 && <p className="px-4 py-3 text-sm text-muted">{messages.unknownTicker}</p>}
          {status === "done" && results.length > 0 && (
            <ul id={listId} role="listbox" className="py-1">
              {results.map((r, i) => (
                <li
                  key={r.ticker}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(r);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 ${i === active ? "bg-brand-soft" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{r.ticker}</span>
                    <span className="block truncate text-xs text-muted">{r.name}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted">
                    {r.exchange}
                    {r.type === "ETF" && <span className="ml-1 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium">ETF</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
