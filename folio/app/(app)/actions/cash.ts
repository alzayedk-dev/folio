"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cashBalanceSchema } from "@/lib/validation";
import { messages } from "@/lib/messages";
import type { ActionResult } from "./transactions";
import { after } from "next/server";
import { refreshPublicSnapshot } from "@/lib/publicSnapshot";

function refresh(supabase: Awaited<ReturnType<typeof createClient>>) {
  ["/portfolio", "/performance"].forEach((p) => revalidatePath(p));
  after(() => refreshPublicSnapshot(supabase).catch(() => undefined));
}

/** "This is how much cash I have": records a balance check-point (replaces earlier balances from that date). */
export async function setCashBalance(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };

  const parsed = cashBalanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? messages.generic, field: issue?.path?.[0]?.toString() };
  }
  const v = parsed.data;
  const { error } = await supabase.from("cash_entries").insert({
    kind: "balance",
    amount: v.amount,
    currency: v.currency,
    entry_date: v.entryDate,
    note: v.note || "Balance update",
  });
  if (error) return { ok: false, error: messages.generic };
  refresh(supabase);
  return { ok: true };
}

export async function deleteCashEntry(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
  // RLS guarantees users can only delete their own rows; .select() tells us whether anything was deleted
  const { data, error } = await supabase.from("cash_entries").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "That cash entry isn't on your books anymore." };
  refresh(supabase);
  return { ok: true };
}
