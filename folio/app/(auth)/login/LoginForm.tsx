"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, messages } from "@/lib/messages";
import { useHydrated } from "@/components/useHydrated";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ next, justReset }: { next: string; justReset: boolean }) {
  const router = useRouter();
  const ready = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError(messages.auth.badLogin);
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(authErrorMessage(error));
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome Back</h1>
      <p className="mt-1 text-sm text-muted">Log in to check on your portfolio.</p>

      <form onSubmit={onSubmit} method="post" className="mt-6 space-y-4" noValidate>
        {justReset && <Alert tone="success">{messages.auth.passwordUpdated} Log in with your new password.</Alert>}
        {error && <Alert>{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-brand hover:underline">
            Forgot Password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={!ready || busy}>
          {busy ? messages.signingIn : "Log In"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New to Folio?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Create An Account
        </Link>
      </p>
    </>
  );
}
