"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, messages } from "@/lib/messages";
import { signUpSchema } from "@/lib/validation";
import { CURRENCIES } from "@/lib/currencies";
import { useHydrated } from "@/components/useHydrated";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

export default function SignUpPage() {
  const router = useRouter();
  const ready = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const parsed = signUpSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? messages.generic);
      return;
    }
    const v = parsed.data;
    setBusy(true);
    const { data, error } = await createClient().auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/portfolio`,
        data: {
          display_name: v.displayName,
          full_name: v.fullName,
          starting_cash: String(v.startingCash),
          starting_currency: v.startingCurrency,
        },
      },
    });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    if (data.session) {
      router.replace("/portfolio");
      router.refresh();
    } else {
      setInfo(messages.auth.checkEmail);
    }
  }

  if (info) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Check Your Inbox</h1>
        <div className="mt-4">
          <Alert tone="success">{info}</Alert>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Already confirmed?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Log In
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Open Your Folio</h1>
      <p className="mt-1 text-sm text-muted">Track every stock, sector and dollar in one place.</p>

      <form onSubmit={onSubmit} method="post" className="mt-6 space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Display Name" htmlFor="displayName" hint="Shown publicly if you ever publish your portfolio.">
          <Input id="displayName" name="displayName" placeholder="e.g. TechBull88" maxLength={30} required />
        </Field>
        <Field label="Full Name (Private)" htmlFor="fullName">
          <Input id="fullName" name="fullName" autoComplete="name" maxLength={100} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm Password" htmlFor="confirmPassword">
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Starting Cash" htmlFor="startingCash" hint="Cash in your brokerage account today. Can be 0.">
            <Input id="startingCash" name="startingCash" type="number" inputMode="decimal" min={0} step="0.01" defaultValue="0" required />
          </Field>
          <Field label="Currency" htmlFor="startingCurrency">
            <Select id="startingCurrency" name="startingCurrency" defaultValue="USD">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" className="w-full" disabled={!ready || busy}>
          {busy ? messages.creatingAccount : "Create Account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
