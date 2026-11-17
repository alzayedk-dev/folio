"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, messages } from "@/lib/messages";
import { useHydrated } from "@/components/useHydrated";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const ready = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 8) return setError(messages.auth.weakPassword);
    if (password !== confirm) return setError(messages.auth.passwordMismatch);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      setError(authErrorMessage(error));
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={onSubmit} method="post" className="mt-6 space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" className="w-full" disabled={!ready || busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </>
  );
}
