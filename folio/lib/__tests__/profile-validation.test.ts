import { describe, expect, it } from "vitest";
import { isOwnAvatarUrl, profileMessages, profileSchema } from "../validation";

const base = { displayName: "TechBull88", fullName: "", bio: "", baseCurrency: "USD" };

describe("profileSchema", () => {
  it("reads checkboxes as true/false", () => {
    const r = profileSchema.parse({ ...base, notifyInapp: "on" });
    expect(r).toMatchObject({ notifyInapp: true, notifyEmail: false, notifyPush: false, isPublic: false });
  });
  it("requires a bio of at least 10 characters to publish", () => {
    const r = profileSchema.safeParse({ ...base, isPublic: "on", bio: "short" });
    expect(r.error?.issues[0].message).toBe(profileMessages.bioNeeded);
    expect(profileSchema.safeParse({ ...base, isPublic: "on", bio: "Long-term dividend investor" }).success).toBe(true);
  });
  it("rejects long bios, bad names and unknown currencies", () => {
    expect(profileSchema.safeParse({ ...base, bio: "x".repeat(281) }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, displayName: "A" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, baseCurrency: "BTC" }).success).toBe(false);
  });
});

describe("isOwnAvatarUrl", () => {
  const sb = "https://abc.supabase.co";
  const me = "11111111-1111-1111-1111-111111111111";
  it("accepts files in the user's own folder, or empty to remove", () => {
    expect(isOwnAvatarUrl(`${sb}/storage/v1/object/public/avatars/${me}/avatar-1.png`, sb, me)).toBe(true);
    expect(isOwnAvatarUrl("", sb, me)).toBe(true);
  });
  it("rejects other users' folders, other sites and path tricks", () => {
    expect(isOwnAvatarUrl(`${sb}/storage/v1/object/public/avatars/22222222-2222-2222-2222-222222222222/a.png`, sb, me)).toBe(false);
    expect(isOwnAvatarUrl("https://evil.example/a.png", sb, me)).toBe(false);
    expect(isOwnAvatarUrl(`${sb}/storage/v1/object/public/avatars/${me}/../x.png`, sb, me)).toBe(false);
    expect(isOwnAvatarUrl(`javascript:alert(1)`, sb, me)).toBe(false);
  });
});
