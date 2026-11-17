// Multiple portfolios (Real and Paper): shared types, rules and messages. Pure: safe for client and server.
import { z } from "zod";
import { CURRENCIES } from "./currencies";

export const PORTFOLIO_COOKIE = "folio.portfolio";
export const MAX_PORTFOLIOS = 10;

export type PortfolioKind = "real" | "paper";
export type Portfolio = {
  id: string;
  name: string;
  kind: PortfolioKind;
  is_public: boolean;
  position: number;
  created_at: string;
};

export const KIND_LABEL: Record<PortfolioKind, string> = { real: "Real", paper: "Paper" };

export const portfolioMessages = {
  name: "Give your portfolio a name (up to 40 characters).",
  duplicate: "You already have a portfolio with that name.",
  limit: `You've reached ${MAX_PORTFOLIOS} portfolios, the desk is full. Delete one to make room.`,
  paperCash: "Paper portfolios need some pretend cash to start (more than 0).",
  cash: "Enter a starting cash amount (0 or more).",
  currency: "Pick a currency from the list.",
  lastOne: "This is your only portfolio, so it can't be deleted.",
  confirmName: "Type the portfolio's name exactly to confirm.",
  gone: "That portfolio isn't on your books anymore.",
  bioNeeded: "Add a short bio or strategy in Settings before publishing, so followers know your approach.",
} as const;

/** Picks the portfolio to show: the one saved in the cookie if it's still the user's, otherwise the first. */
export function pickPortfolio<T extends { id: string }>(list: T[], wantedId: string | null | undefined): T | null {
  if (!list.length) return null;
  return list.find((p) => p.id === wantedId) ?? list[0];
}

/** Sorts portfolios the way the switcher shows them: by position, then creation time. */
export function sortPortfolios<T extends { position: number; created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];
const name = z.string().trim().min(1, portfolioMessages.name).max(40, portfolioMessages.name);

export const newPortfolioSchema = z
  .object({
    name,
    kind: z.enum(["real", "paper"]),
    startingCash: z.union([z.literal(""), z.coerce.number({ message: portfolioMessages.cash })]).optional().default(""),
    currency: z.enum(currencyCodes, { message: portfolioMessages.currency }),
  })
  .transform((v) => ({ ...v, startingCash: v.startingCash === "" ? 0 : v.startingCash }))
  .superRefine((v, ctx) => {
    if (!Number.isFinite(v.startingCash) || v.startingCash < 0 || v.startingCash > 1e12) ctx.addIssue({ code: "custom", message: portfolioMessages.cash, path: ["startingCash"] });
    else if (v.kind === "paper" && v.startingCash <= 0) ctx.addIssue({ code: "custom", message: portfolioMessages.paperCash, path: ["startingCash"] });
  });

export const renamePortfolioSchema = z.object({ name });

/** Same name ignoring case and spaces at the ends (matches the database's unique index). */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
