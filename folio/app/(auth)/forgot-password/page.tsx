"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, messages } from "@/lib/messages";
import { useHydrated } from "@/components/useHydrated";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const ready = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email.includes("@")) {
      setError(messages.auth.badEmail);
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    // Rate limits are worth reporting; other errors are hidden so we don't reveal which emails exist.
    if (error && error.status === 429) {
      setError(authErrorMessage(error));
      return;
    }
    setSent(true);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Reset Your Password</h1>
      <p className="mt-1 text-sm text-muted">We&apos;ll email you a link to choose a new one.</p>
      <form onSubmit={onSubmit} method="post" className="mt-6 space-y-4" noValidate>
        {sent && <Alert tone="success">{messages.auth.resetSent}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Button type="submit" className="w-full" disabled={!ready || busy || sent}>
          {busy ? "Sending…" : "Send Reset Link"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back To Log In
        </Link>
      </p>
    </>
  );
}
