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
  })
  .refine((v) => v.password === v.confirmPassword, { message: messages.auth.passwordMismatch, path: ["confirmPassword"] });

export type SignUpInput = z.infer<typeof signUpSchema>;

// ---------- transactions ----------
export const txnMessages = {
  ticker: "Pick a stock from the list first.",
  shares: "Enter how many shares (more than 0).",
  price: "Enter the price per share (0 or more).",
  amount: "Enter the dividend amount you received (more than 0).",
  fees: "Fees can't be negative.",
  date: "Pick a trade date that isn't in the future.",
  notes: "Notes can be up to 500 characters.",
  coins: "Enter how many coins (a whole number, 1 or more).",
  coinGrams: "Enter the weight of one coin in grams (more than 0).",
  purity: "Enter a purity between 1% and 100%.",
  coin: "Pick a coin from the list.",
} as const;

/** Latest date allowed: today, plus one day of slack for time zones ahead of the server. */
export function latestTradeDate(now = new Date()): string {
  return new Date(now.getTime() + 864e5).toISOString().slice(0, 10);
}

const num = (msg: string) => z.coerce.number({ message: msg }).refine(Number.isFinite, msg);

export const transactionSchema = z
  .object({
    ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.\-=^]{0,19}$/, txnMessages.ticker),
    type: z.enum(["buy", "sell", "dividend"]),
    shares: z.union([z.literal(""), z.null(), num(txnMessages.shares)]).optional(),
    price: z.union([z.literal(""), z.null(), num(txnMessages.price)]).optional(),
    amount: z.union([z.literal(""), z.null(), num(txnMessages.amount)]).optional(),
    fees: z.union([z.literal(""), z.null(), num(txnMessages.fees)]).optional(),
    // Optional: empty means "today"
    tradeDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, txnMessages.date)]).optional().default(""),
    notes: z.string().trim().max(500, txnMessages.notes).optional().default(""),
    // Gold/silver only: how the metal was entered
    // Buys only: paid from existing cash, or with new money (Folio then records a matching deposit)
    funding: z.union([z.literal(""), z.enum(["cash", "new"])]).optional().default(""),
    metalForm: z.union([z.literal(""), z.enum(["bar", "coin", "custom"])]).optional().default(""),
    coinCode: z.union([z.literal(""), z.string().regex(/^[a-z_]{2,30}$/)]).optional().default(""),
    coinCount: z.union([z.literal(""), z.null(), num(txnMessages.coins)]).optional(),
    coinGrams: z.union([z.literal(""), z.null(), num(txnMessages.coinGrams)]).optional(),
    purity: z.union([z.literal(""), z.null(), num(txnMessages.purity)]).optional(),
  })
  .transform((v) => ({
    ...v,
    funding: v.funding === "" ? null : v.funding,
    metalForm: v.metalForm === "" ? null : v.metalForm,
    coinCode: v.coinCode === "" ? null : v.coinCode,
    coinCount: v.coinCount === "" || v.coinCount == null ? null : Number(v.coinCount),
    coinGrams: v.coinGrams === "" || v.coinGrams == null ? null : Number(v.coinGrams),
    purity: v.purity === "" || v.purity == null ? null : Number(v.purity),
    tradeDate: v.tradeDate || new Date().toISOString().slice(0, 10),
    shares: v.shares === "" || v.shares == null ? null : Number(v.shares),
    price: v.price === "" || v.price == null ? null : Number(v.price),
    amount: v.amount === "" || v.amount == null ? null : Number(v.amount),
    fees: v.fees === "" || v.fees == null ? 0 : Number(v.fees),
  }))
  .superRefine((v, ctx) => {
    if (v.tradeDate > latestTradeDate() || v.tradeDate < "1970-01-01") ctx.addIssue({ code: "custom", message: txnMessages.date, path: ["tradeDate"] });
    if (v.fees < 0 || v.fees > 1e9) ctx.addIssue({ code: "custom", message: txnMessages.fees, path: ["fees"] });
    if (v.metalForm === "coin" || v.metalForm === "custom") {
      if (v.coinCount == null || !Number.isInteger(v.coinCount) || v.coinCount < 1 || v.coinCount > 1e6) ctx.addIssue({ code: "custom", message: txnMessages.coins, path: ["shares"] });
    }
    if (v.metalForm === "coin" && !v.coinCode) ctx.addIssue({ code: "custom", message: txnMessages.coin, path: ["coinCode"] });
    if (v.metalForm === "custom" && (v.coinGrams == null || !(v.coinGrams > 0) || v.coinGrams > 10000)) ctx.addIssue({ code: "custom", message: txnMessages.coinGrams, path: ["coinGrams"] });
    if ((v.metalForm === "custom" || v.metalForm === "bar") && (v.purity == null || !(v.purity >= 0.01) || v.purity > 1)) ctx.addIssue({ code: "custom", message: txnMessages.purity, path: ["purity"] });
    if (v.type === "dividend") {
      if (v.amount == null || !(v.amount > 0) || v.amount > 1e12) ctx.addIssue({ code: "custom", message: txnMessages.amount, path: ["amount"] });
    } else {
      if (v.shares == null || !(v.shares > 0) || v.shares > 1e9) ctx.addIssue({ code: "custom", message: txnMessages.shares, path: ["shares"] });
      if (v.price == null || v.price < 0 || v.price > 1e9) ctx.addIssue({ code: "custom", message: txnMessages.price, path: ["price"] });
    }
  });

export type TransactionInput = z.infer<typeof transactionSchema>;

// ---------- cash ----------
export const cashMessages = {
  amount: "Enter your cash balance (0 or more).",
  added: "Enter the amount you added (more than 0).",
  currency: "Pick a currency from the list.",
  date: "Pick a date that isn't in the future.",
} as const;

export const cashBalanceSchema = z
  .object({
    amount: z.coerce.number({ message: cashMessages.amount }).refine((n) => Number.isFinite(n) && n >= 0 && n <= 1e12, cashMessages.amount),
    currency: z.enum(currencyCodes, { message: cashMessages.currency }),
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, cashMessages.date),
    note: z.string().trim().max(200).optional().default(""),
  })
  .refine((v) => v.entryDate <= latestTradeDate() && v.entryDate >= "1970-01-01", { message: cashMessages.date, path: ["entryDate"] });

// ---------- profile / settings ----------
export const profileMessages = {
  bioNeeded: "Add a short bio or strategy before publishing, so followers know your approach.",
  bioLength: "Your bio can be up to 280 characters.",
  fullName: "Full name can be up to 100 characters.",
  currency: "Pick a base currency from the list.",
  reminders: "The second reminder needs to come after the first one (fewer days before).",
} as const;

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const profileSchema = z
  .object({
    displayName: z.string().trim().min(2, messages.auth.nameLength).max(30, messages.auth.nameLength),
    fullName: z.string().trim().max(100, profileMessages.fullName).optional().default(""),
    bio: z.string().trim().max(280, profileMessages.bioLength).optional().default(""),
    baseCurrency: z.enum(currencyCodes, { message: profileMessages.currency }),
    notifyInapp: checkbox,
    notifyEmail: checkbox,
    notifyPush: checkbox,
    showShariah: checkbox,
    reminderFirst: z.coerce.number().int().min(1).max(30).optional().default(7),
    reminderSecond: z
      .union([z.literal("off"), z.coerce.number().int().min(0).max(30)])
      .optional()
      .default(1)
      .transform((v) => (v === "off" ? null : v)),
  })
  .refine((v) => v.reminderSecond == null || v.reminderSecond < v.reminderFirst, { message: profileMessages.reminders, path: ["reminderSecond"] });

export type ProfileInput = z.infer<typeof profileSchema>;

/** Avatar URLs must point at the user's own folder in our public avatars bucket (or be empty to remove). */
export function isOwnAvatarUrl(url: string, supabaseUrl: string, userId: string): boolean {
  if (url === "") return true;
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/avatars/${userId}/`;
  return url.startsWith(prefix) && !url.slice(prefix.length).includes("..") && /^[\w.\-/]+$/.test(url.slice(prefix.length));
}

/** Only allow redirects to our own pages (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/portfolio"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
