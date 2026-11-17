"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { market } from "@/lib/market";
import { screen, type ShariahResult } from "@/lib/shariah";

export type ShariahState = { status: "off" | "loading" | "ready" | "error"; results: Record<string, ShariahResult> };

/**
 * Loads Shariah screening for a list of tickers after the page has shown, so it never slows the holdings table.
 * Facts come from the market Edge Function (cached 7 days); the rules run here (lib/shariah.ts).
 */
export function useShariah(tickers: string[], enabled: boolean): ShariahState {
  const key = [...tickers].sort().join(",");
  const [state, setState] = useState<ShariahState>({ status: enabled && key ? "loading" : "off", results: {} });

  useEffect(() => {
    if (!enabled || !key) {
      setState({ status: "off", results: {} });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading" }));
    const list = key.split(",");
    market
      .shariah(createClient(), list)
      .then((facts) => {
        if (cancelled) return;
        const results: Record<string, ShariahResult> = {};
        for (const t of list) results[t] = screen(t, facts[t] ?? null);
        setState({ status: "ready", results });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", results: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return state;
}
