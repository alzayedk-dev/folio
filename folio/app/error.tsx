"use client";

import Link from "next/link";
import { useEffect } from "react";
import { messages } from "@/lib/messages";

/** Friendly fallback for public pages if something fails to load. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center">
      <p className="text-xl font-medium">{messages.generic}</p>
      <p className="mt-2 text-sm text-muted">{messages.serverBusy}</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-strong">
          Try Again
        </button>
        <Link href="/" className="rounded-lg border border-brand px-5 py-2.5 text-sm font-medium text-brand hover:bg-brand-soft">
          Back To Folio
        </Link>
      </div>
    </main>
  );
}
