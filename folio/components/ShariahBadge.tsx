"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { SHARIAH_NOTE, type RuleResult, type ShariahResult, type ShariahStatus } from "@/lib/shariah";

const STYLE: Record<ShariahStatus, { dot: string; text: string; bg: string }> = {
  compliant: { dot: "bg-gain", text: "text-gain", bg: "bg-emerald-50" },
  doubtful: { dot: "bg-amber-500", text: "text-warn", bg: "bg-amber-50" },
  not_compliant: { dot: "bg-loss", text: "text-loss", bg: "bg-red-50" },
  not_screened: { dot: "bg-slate-400", text: "text-muted", bg: "bg-surface" },
};

const RESULT: Record<RuleResult, { icon: string; text: string; label: string }> = {
  pass: { icon: "✓", text: "text-gain", label: "Pass" },
  fail: { icon: "✕", text: "text-loss", label: "Fail" },
  doubtful: { icon: "?", text: "text-warn", label: "Doubtful" },
  unknown: { icon: "–", text: "text-muted", label: "Not checked" },
};

const PANEL_W = 320;

/**
 * Shariah status badge (colour dot + words, never colour alone). Click or tap it for the rule-by-rule details;
 * Escape or a click outside closes them.
 */
export function ShariahBadge({ result, size = "sm" }: { result: ShariahResult; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const s = STYLE[result.status];

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      const width = Math.min(PANEL_W, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 6, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Shariah screening: ${result.label}. Show details`}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-full font-medium hover:ring-1 hover:ring-current focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${s.bg} ${s.text} ${
          size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
        {result.label}
      </button>
      {open && pos && (
        <div
          id={id}
          role="dialog"
          aria-label={`Shariah screening details for ${result.ticker}`}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: Math.min(PANEL_W, typeof window === "undefined" ? PANEL_W : window.innerWidth - 16) }}
          className="z-50 rounded-xl border border-line bg-white p-4 text-left text-xs font-normal normal-case leading-snug tracking-normal text-foreground shadow-xl"
        >
          <p className="text-sm font-semibold">
            Shariah Screening · <span className={s.text}>{result.label}</span>
          </p>
          <p className="mt-1 text-muted">{result.summary}</p>
          {result.rules.length > 0 && (
            <ul className="mt-3 space-y-2">
              {result.rules.map((r) => {
                const x = RESULT[r.result];
                return (
                  <li key={r.key} className="flex gap-2">
                    <span className={`mt-0.5 w-3 shrink-0 text-center font-bold ${x.text}`} aria-hidden="true">
                      {x.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{r.name}</span>
                      <span className="block text-muted">
                        {r.value} · Limit: {r.limit} · <span className={x.text}>{x.label}</span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {result.dataDate && <p className="mt-3 text-muted">Financial data as of {new Date(result.dataDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}.</p>}
          <p className="mt-3 border-t border-line pt-2 text-muted">{SHARIAH_NOTE}</p>
        </div>
      )}
    </span>
  );
}
