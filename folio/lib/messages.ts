// Friendly, finance-flavoured messages used across Folio.
// Keep every user-facing error, loading and empty state here so the tone stays consistent.

export const messages = {
  loading: "Crunching your numbers…",
  savingTrade: "Booking your trade…",
  savingCash: "Updating your ledger…",
  signingIn: "Opening the trading floor…",
  creatingAccount: "Opening your account…",

  shariahSlow: "Shariah data is still on its way from the exchange.",
  marketSlow: (asOf?: string) =>
    asOf
      ? `The market feed is catching its breath. Showing prices as of ${asOf}.`
      : "The market feed is catching its breath. Try again in a moment.",
  serverBusy: "Trading floor's packed right now, give it a moment and try again.",
  offline: "Looks like you've lost your connection to the exchange. Check your internet and try again.",
  unknownTicker: "That ticker isn't trading on our floor. Check the symbol?",
  oversell: "You can't sell shares you don't own (that would be shorting, and Folio doesn't do that).",
  emptyPortfolio: "Your portfolio is a blank ledger. Add your first trade to get started.",
  aiBusy: "Our analyst is on a coffee break. Try again in a minute.",
  notFound: "This page has been delisted.",
  generic: "Something didn't settle properly. Please try again.",

  auth: {
    badLogin: "Those credentials didn't clear. Check your email and password.",
    emailTaken: "That email already has an account. Try logging in instead.",
    weakPassword: "Your password needs at least 8 characters, a sturdier vault for your portfolio.",
    passwordMismatch: "The two passwords don't match. Let's reconcile them.",
    badEmail: "That email address doesn't look quite right.",
    nameLength: "Display names need 2–30 characters.",
    badCash: "Starting cash must be a number, 0 or more.",
    checkEmail: "Almost there! We've sent a confirmation link to your email. Click it to open your account.",
    resetSent: "If that email has an account, a reset link is on its way. Check your inbox (and spam).",
    passwordUpdated: "Password updated. Your vault is secure again.",
    tooManyTries: "Too many attempts. The market's on a short circuit-breaker; try again in a few minutes.",
    emailNotConfirmed: "Please confirm your email first. Check your inbox for the link.",
  },
} as const;

/** Turns a Supabase auth error into a friendly message. */
export function authErrorMessage(err: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!err) return messages.generic;
  const text = `${err.code ?? ""} ${err.message ?? ""}`.toLowerCase();
  if (text.includes("invalid login") || text.includes("invalid_credentials")) return messages.auth.badLogin;
  if (text.includes("already registered") || text.includes("user_already_exists")) return messages.auth.emailTaken;
  if (text.includes("password") && (text.includes("weak") || text.includes("at least"))) return messages.auth.weakPassword;
  if (text.includes("not confirmed")) return messages.auth.emailNotConfirmed;
  if (text.includes("rate limit") || err.status === 429) return messages.auth.tooManyTries;
  if (text.includes("invalid") && text.includes("email")) return messages.auth.badEmail;
  if (text.includes("fetch") || text.includes("network")) return messages.offline;
  return messages.generic;
}
