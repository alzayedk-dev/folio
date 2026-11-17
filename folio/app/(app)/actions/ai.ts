"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadValuation } from "@/lib/loadValuation";
import { buildAiContext } from "@/lib/aiContext";
import { messages } from "@/lib/messages";

export type AskResult = { ok: true; reply: string } | { ok: false; error: string };

const PER_MINUTE = 6;
const PER_DAY = 60;

/** Sends a question to the AI analyst (Edge Function), with the user's % portfolio summary, and saves both sides. */
export async function askAI(question: string): Promise<AskResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };

  const q = (question ?? "").trim();
  if (q.length < 2) return { ok: false, error: "Ask a question about a stock, sector, the markets or your portfolio." };
  if (q.length > 1000) return { ok: false, error: "Please keep questions under 1,000 characters." };

  // Fair-use limits protect the free AI quota
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [{ count: lastMinute }, { count: lastDay }] = await Promise.all([
    supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since(60e3)),
    supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since(864e5)),
  ]);
  if ((lastMinute ?? 0) >= PER_MINUTE) return { ok: false, error: "Easy on the ticker tape! Please wait a minute before asking again." };
  if ((lastDay ?? 0) >= PER_DAY) return { ok: false, error: "You've reached today's limit for the AI analyst. It resets in 24 hours." };

  const [{ data: history }, valuation] = await Promise.all([
    supabase.from("ai_messages").select("role, content").order("created_at", { ascending: false }).limit(10),
    loadValuation(supabase).then((r) => r.valuation).catch(() => null),
  ]);
  const context = valuation ? buildAiContext(valuation) : "Portfolio data is temporarily unavailable.";
  const convo = [...(history ?? []).reverse(), { role: "user", content: q }];

  await supabase.from("ai_messages").insert({ role: "user", content: q });

  const { data, error } = await supabase.functions.invoke("ai", { body: { action: "chat", messages: convo, context } });
  let reply: string | null = data?.ok ? data.data.reply : null;
  if (error || !reply) {
    let code = "ai_unavailable";
    try {
      const ctx = (error as { context?: Response } | null)?.context;
      code = (ctx ? (await ctx.json())?.error?.code : data?.error?.code) ?? code;
    } catch {
      /* default */
    }
    return { ok: false, error: code === "ai_unconfigured" ? "The AI analyst isn't set up yet." : messages.aiBusy };
  }
  reply = reply.slice(0, 7900);
  await supabase.from("ai_messages").insert({ role: "assistant", content: reply });
  revalidatePath("/ai");
  return { ok: true, reply };
}

export async function clearChat(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await supabase.from("ai_messages").delete().eq("user_id", user.id);
  revalidatePath("/ai");
  return { ok: true };
}
