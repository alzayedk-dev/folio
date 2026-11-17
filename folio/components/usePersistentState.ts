"use client";

import { useEffect, useState } from "react";

/**
 * useState that remembers a small per-viewer preference (e.g. the $/% toggle) in localStorage.
 * Falls back silently when storage is unavailable (private mode, blocked storage).
 */
export function usePersistentState<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key) as T | null;
      if (saved && allowed.includes(saved)) setValue(saved);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (v: T) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      /* storage unavailable */
    }
  };

  return [value, update] as const;
}
