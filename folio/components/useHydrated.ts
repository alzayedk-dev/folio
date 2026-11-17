"use client";

import { useEffect, useState } from "react";

/**
 * True once React has taken over the page in the browser.
 * Forms keep their submit button disabled until then, so a fast click can never
 * fall back to a plain HTML submit (which would put typed values in the URL).
 */
export function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
