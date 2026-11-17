import { z } from "zod";
import { messages } from "./messages";
import { CURRENCIES } from "./currencies";

const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];

export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(2, messages.auth.nameLength).max(30, messages.auth.nameLength),
    fullName: z.string().trim().max(100).optional().default(""),
    email: z.string().trim().email(messages.auth.badEmail),
    password: z.string().min(8, messages.auth.weakPassword),
    confirmPassword: z.string(),
    startingCash: z.coerce.number({ message: messages.auth.badCash }).min(0, messages.auth.badCash).max(1e12, messages.auth.badCash),
    startingCurrency: z.enum(currencyCodes),
  })
  .refine((v) => v.password === v.confirmPassword, { message: messages.auth.passwordMismatch, path: ["confirmPassword"] });

export type SignUpInput = z.infer<typeof signUpSchema>;

/** Only allow redirects to our own pages (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/portfolio"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
