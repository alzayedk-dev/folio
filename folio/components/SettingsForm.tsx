"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/currencies";
import { messages, authErrorMessage } from "@/lib/messages";
import { profileMessages } from "@/lib/validation";
import { updateProfile, setAvatar } from "@/app/(app)/actions/profile";
import { Avatar } from "./UserMenu";
import { Switch } from "./Switch";
import { Alert, Button, Card, Field, Input, Select } from "./ui";

export type SettingsProfile = {
  userId: string;
  email: string;
  displayName: string;
  fullName: string;
  bio: string;
  avatarUrl: string | null;
  baseCurrency: string;
  notifyInapp: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;
  isPublic: boolean;
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function SettingsForm({ profile }: { profile: SettingsProfile }) {
  const router = useRouter();
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const [toggles, setToggles] = useState({
    notifyInapp: profile.notifyInapp,
    notifyEmail: profile.notifyEmail,
    notifyPush: profile.notifyPush,
    isPublic: profile.isPublic,
  });
  const [bio, setBio] = useState(profile.bio);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string; field?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatarState] = useState(profile.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const [pw, setPw] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  function setPublic(v: boolean) {
    setToggles((t) => ({ ...t, isPublic: v }));
    if (v && bio.trim().length < 10) {
      setStatus({ tone: "error", text: profileMessages.bioNeeded, field: "bio" });
      bioRef.current?.focus();
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    const res = await updateProfile(new FormData(e.currentTarget));
    setSaving(false);
    if (!res.ok) {
      setStatus({ tone: "error", text: res.error, field: res.field });
      if (res.field === "bio") bioRef.current?.focus();
      return;
    }
    setStatus({ tone: "success", text: "Settings saved. Your ledger is up to date." });
    router.refresh();
  }

  async function onAvatarFile(file: File | undefined) {
    if (!file) return;
    setAvatarMsg(null);
    if (!AVATAR_TYPES.includes(file.type)) return setAvatarMsg("Please choose a JPG, PNG or WebP image.");
    if (file.size > MAX_AVATAR_BYTES) return setAvatarMsg("That image is over 2 MB. Please choose a smaller one.");
    setAvatarBusy(true);
    const supabase = createClient();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${profile.userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (error) {
      setAvatarBusy(false);
      return setAvatarMsg(messages.serverBusy);
    }
    const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const res = await setAvatar(url);
    // remove the previous photo so old files don't pile up
    if (res.ok && avatar) {
      const old = avatar.split("/avatars/")[1];
      if (old?.startsWith(profile.userId + "/")) await supabase.storage.from("avatars").remove([old]);
    }
    setAvatarBusy(false);
    if (!res.ok) return setAvatarMsg(res.error);
    setAvatarState(url);
    router.refresh();
  }

  async function removeAvatar() {
    if (!avatar) return;
    setAvatarBusy(true);
    const res = await setAvatar("");
    const old = avatar.split("/avatars/")[1];
    if (res.ok && old?.startsWith(profile.userId + "/")) await createClient().storage.from("avatars").remove([old]);
    setAvatarBusy(false);
    if (!res.ok) return setAvatarMsg(res.error);
    setAvatarState(null);
    router.refresh();
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = String(form.get("newPassword") ?? "");
    const confirm = String(form.get("confirmNewPassword") ?? "");
    if (next.length < 8) return setPw({ tone: "error", text: messages.auth.weakPassword });
    if (next !== confirm) return setPw({ tone: "error", text: messages.auth.passwordMismatch });
    const { error } = await createClient().auth.updateUser({ password: next });
    if (error) return setPw({ tone: "error", text: authErrorMessage(error) });
    e.currentTarget.reset();
    setPw({ tone: "success", text: messages.auth.passwordUpdated });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={onSubmit} method="post" className="space-y-6 lg:col-span-2" noValidate>
        <Section title="Profile" description="Your display name and bio appear only if you publish your portfolio.">
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={profile.displayName} url={avatar} size={64} />
            <div className="space-y-1">
              <div className="flex flex-wrap gap-2">
                <label className={`inline-flex cursor-pointer items-center rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-soft ${avatarBusy ? "pointer-events-none opacity-60" : ""}`}>
                  {avatarBusy ? "Uploading…" : avatar ? "Change Photo" : "Upload Photo"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onAvatarFile(e.target.files?.[0])} />
                </label>
                {avatar && (
                  <button type="button" onClick={removeAvatar} disabled={avatarBusy} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-red-50 hover:text-loss">
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">JPG, PNG or WebP, up to 2 MB.</p>
              {avatarMsg && <p className="text-xs text-loss">{avatarMsg}</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display Name (Public)" htmlFor="displayName">
              <Input id="displayName" name="displayName" defaultValue={profile.displayName} maxLength={30} required aria-invalid={status?.field === "displayName"} />
            </Field>
            <Field label="Full Name (Private)" htmlFor="fullName">
              <Input id="fullName" name="fullName" defaultValue={profile.fullName} maxLength={100} autoComplete="name" />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Bio / Strategy" htmlFor="bio" hint={`${bio.length}/280 · e.g. "Long-term dividend investor focused on healthcare."`}>
              <textarea
                ref={bioRef}
                id="bio"
                name="bio"
                rows={3}
                maxLength={280}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                aria-invalid={status?.field === "bio"}
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 aria-[invalid=true]:border-loss"
              />
            </Field>
          </div>
        </Section>

        <Section title="Currency" description="All totals, charts and P/L are shown in this currency.">
          <div className="max-w-xs">
            <Field label="Base Currency" htmlFor="baseCurrency">
              <Select id="baseCurrency" name="baseCurrency" defaultValue={profile.baseCurrency}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Alerts" description="Earnings reminders and updates from portfolios you follow.">
          <div className="divide-y divide-line">
            <Switch name="notifyInapp" label="In-App Alerts" description="The bell icon in the header." checked={toggles.notifyInapp} onChange={(v) => setToggles((t) => ({ ...t, notifyInapp: v }))} />
            <Switch name="notifyEmail" label="Email Alerts" description={`Sent to ${profile.email}.`} checked={toggles.notifyEmail} onChange={(v) => setToggles((t) => ({ ...t, notifyEmail: v }))} />
            <Switch name="notifyPush" label="Phone Push Alerts" description="Notifications on this device (set up in a later step)." checked={toggles.notifyPush} onChange={(v) => setToggles((t) => ({ ...t, notifyPush: v }))} />
          </div>
        </Section>

        <Section title="Public Portfolio" description="Share your allocation with other Folio users. Only percentages are shown, never dollar amounts, share counts or cash.">
          <Switch
            name="isPublic"
            label="Publish My Portfolio"
            description={toggles.isPublic ? "Visible on the Public tab. Others can follow you." : "Private. Only you can see it."}
            checked={toggles.isPublic}
            onChange={setPublic}
          />
        </Section>

        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="min-w-40">
            {saving ? messages.savingCash : "Save Settings"}
          </Button>
        </div>
      </form>

      <div className="space-y-6">
        <Section title="Account">
          <p className="text-sm text-muted">Signed in as</p>
          <p className="font-medium break-all">{profile.email}</p>
        </Section>
        <Section title="Change Password">
          <form onSubmit={changePassword} method="post" className="space-y-3" noValidate>
            <Field label="New Password" htmlFor="newPassword" hint="At least 8 characters.">
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label="Confirm New Password" htmlFor="confirmNewPassword">
              <Input id="confirmNewPassword" name="confirmNewPassword" type="password" autoComplete="new-password" required />
            </Field>
            {pw && <Alert tone={pw.tone}>{pw.text}</Alert>}
            <Button type="submit" variant="outline" className="w-full">
              Update Password
            </Button>
          </form>
        </Section>
      </div>
    </div>
  );
}
