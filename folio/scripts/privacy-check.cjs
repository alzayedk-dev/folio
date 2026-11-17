/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Two-user privacy test through the real Supabase API.
// Usage (from the folio folder): node scripts/privacy-check.cjs
// Needs TEST_USER_A_* / TEST_USER_B_* and the Supabase keys in .env.local.
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, pub = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const login = async (t) => {
  const c = createClient(url, pub, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: env[`TEST_USER_${t}_EMAIL`], password: env[`TEST_USER_${t}_PASSWORD`] });
  if (error) throw error;
  return [c, data.user.id];
};
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

(async () => {
  await admin.from("symbols").upsert({ ticker: "ZZTEST", name: "Privacy Test Co", currency: "USD", sector: "Technology" });
  const [A, aId] = await login("A");
  const [B] = await login("B");
  const ins = await A.from("transactions").insert({ ticker: "ZZTEST", type: "buy", shares: 10, price: 100, currency: "USD" }).select().single();
  check("A can add own transaction", !ins.error, ins.error?.message);
  const txId = ins.data?.id;
  let r = await B.from("transactions").select("*").eq("id", txId);
  check("B cannot see A's transaction", r.data?.length === 0);
  r = await B.from("transactions").update({ price: 1 }).eq("id", txId).select();
  check("B cannot edit A's transaction", (r.data?.length ?? 0) === 0);
  r = await B.from("transactions").delete().eq("id", txId).select();
  check("B cannot delete A's transaction", (r.data?.length ?? 0) === 0);
  r = await B.from("transactions").insert({ user_id: aId, ticker: "ZZTEST", type: "buy", shares: 1, price: 1, currency: "USD" });
  check("B cannot add a transaction into A's account", !!r.error);
  r = await B.from("profiles").select("id");
  check("B sees only own profile", r.data?.length === 1 && r.data[0].id !== aId);
  r = await B.from("profiles").update({ display_name: "Hacked" }).eq("id", aId).select();
  check("B cannot rename A", (r.data?.length ?? 0) === 0);
  r = await B.from("cash_entries").select("user_id");
  check("B sees no cash rows of A", (r.data ?? []).every((x) => x.user_id !== aId));
  r = await A.from("transactions").select("price").eq("id", txId).single();
  check("A's transaction unchanged", Number(r.data?.price) === 100);
  r = await B.from("symbols").insert({ ticker: "HACK", name: "x" });
  check("Users cannot write shared market data", !!r.error);
  // Storage: B must not write into or delete from A's avatar folder
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  r = await B.storage.from("avatars").upload(`${aId}/intruder.png`, png, { contentType: "image/png" });
  check("B cannot upload into A's avatar folder", !!r.error, r.error?.message);
  const { data: aFiles } = await admin.storage.from("avatars").list(aId);
  if (aFiles?.length) {
    const del = await B.storage.from("avatars").remove([`${aId}/${aFiles[0].name}`]);
    const still = await admin.storage.from("avatars").list(aId);
    check("B cannot delete A's avatar", (still.data?.length ?? 0) === aFiles.length, JSON.stringify(del.error ?? del.data));
  }
  r = await B.from("profiles").update({ avatar_url: "https://evil.example/x.png" }).eq("id", aId).select();
  check("B cannot change A's avatar URL", (r.data?.length ?? 0) === 0);

  const anon = createClient(url, pub, { auth: { persistSession: false } });
  r = await anon.from("transactions").select("*");
  check("Logged-out visitor sees no transactions", (r.data?.length ?? 0) === 0);
  r = await anon.from("profiles").select("*");
  check("Logged-out visitor sees no profiles", (r.data?.length ?? 0) === 0);

  await admin.from("transactions").delete().eq("id", txId);
  await admin.from("symbols").delete().eq("ticker", "ZZTEST");

  for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail ? "  (" + x.detail + ")" : ""}`);
  const failed = results.filter((x) => !x.pass).length;
  console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} privacy checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
