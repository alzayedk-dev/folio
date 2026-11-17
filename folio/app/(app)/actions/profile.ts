"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnAvatarUrl, profileSchema } from "@/lib/validation";
import { messages } from "@/lib/messages";
import type { ActionResult } from "./transactions";
import { refreshAllPublicSnapshots } from "@/lib/publicSnapshot";

async function getUserClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? messages.generic, field: issue?.path?.[0]?.toString() };
  }
  const v = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: v.displayName,
      full_name: v.fullName || null,
      bio: v.bio || null,
      base_currency: v.baseCurrency,
      notify_inapp: v.notifyInapp,
      notify_email: v.notifyEmail,
      notify_push: v.notifyPush,
      show_shariah: v.showShariah,
      reminder_first: v.reminderFirst,
      reminder_second: v.reminderSecond,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "That display name is taken. Try another one.", field: "displayName" };
    return { ok: false, error: messages.generic };
  }
  // Display name and bio are copied into published snapshots: refresh them after the response is sent
  after(() => refreshAllPublicSnapshots(supabase, user.id).catch(() => undefined));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Saves (or clears) the avatar URL after the browser has uploaded the file to the user's own folder. */
export async function setAvatar(url: string): Promise<ActionResult> {
  const { supabase, user } = await getUserClient();
  if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
  if (!isOwnAvatarUrl(url, process.env.NEXT_PUBLIC_SUPABASE_URL!, user.id)) return { ok: false, error: "That image couldn't be used. Please upload it again." };

  const { error } = await supabase.from("profiles").update({ avatar_url: url || null }).eq("id", user.id);
  if (error) return { ok: false, error: messages.generic };
  after(() => refreshAllPublicSnapshots(supabase, user.id).catch(() => undefined));
  revalidatePath("/", "layout");
  return { ok: true };
}
