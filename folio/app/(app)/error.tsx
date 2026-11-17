"use client";

import { useEffect } from "react";
import { messages } from "@/lib/messages";
import { Button } from "@/components/ui";

/** Friendly fallback if a tab fails to load. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-line bg-white px-6 py-14 text-center">
      <p className="text-lg font-medium">{messages.generic}</p>
      <p className="mt-2 text-sm text-muted">{messages.serverBusy}</p>
      <Button className="mt-6" onClick={reset}>
        Try Again
      </Button>
    </div>
  );
}
