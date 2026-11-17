"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyPortfolios } from "@/lib/currentPortfolio";
import { loadPerformance } from "@/lib/loadPerformance";
import { portfolioMessages } from "@/lib/portfolios";
import { messages } from "@/lib/messages";

export type CompareResult = { ok: true; points: { date: string; index: number }[] } | { ok: false; error: string };

/** Growth index of one of the user's other portfolios, for the Compare With lines on the Performance chart. */
export async function compareSeries(portfolioId: string): Promise<CompareResult> {
  const { list } = await getMyPortfolios();
  if (!list.some((p) => p.id === portfolioId)) return { ok: false, error: portfolioMessages.gone };
  try {
    const supabase = await createClient();
    const { points } = await loadPerformance(supabase, portfolioId);
    return { ok: true, points: points.map((p) => ({ date: p.date, index: p.index })) };
  } catch {
    return { ok: false, error: messages.marketSlow() };
  }
}
