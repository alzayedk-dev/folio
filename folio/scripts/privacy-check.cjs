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

  // Multiple portfolios: each user's portfolios are private unless published
  const [, bId] = await login("B");
  const { data: aPfs } = await admin.from("portfolios").select("id, is_public").eq("user_id", aId).order("position").order("created_at");
  const aMain = aPfs?.[0];
  check("Every user has at least one portfolio", !!aMain);
  const lab = await A.from("portfolios").insert({ name: "ZZ Private Lab", kind: "paper", position: 99 }).select().single();
  check("A can create a Paper portfolio", !lab.error, lab.error?.message);
  const labId = lab.data?.id;
  r = await B.from("portfolios").select("id").eq("id", labId);
  check("B cannot see A's private portfolio", (r.data?.length ?? 0) === 0);
  r = await B.from("portfolios").update({ name: "Hacked" }).eq("id", labId).select();
  check("B cannot rename A's portfolio", (r.data?.length ?? 0) === 0);
  r = await B.from("transactions").insert({ portfolio_id: labId, ticker: "ZZTEST", type: "buy", shares: 1, price: 1, currency: "USD" });
  check("B cannot add a trade into A's portfolio", !!r.error);
  r = await B.from("cash_entries").insert({ portfolio_id: labId, kind: "deposit", amount: 1, currency: "USD" });
  check("B cannot add cash into A's portfolio", !!r.error);
  const labTx = await A.from("transactions").insert({ portfolio_id: labId, ticker: "ZZTEST", type: "buy", shares: 2, price: 50, currency: "USD" }).select().single();
  check("A can trade in the Paper portfolio", !labTx.error, labTx.error?.message);
  r = await A.from("transactions").select("id").eq("portfolio_id", aMain?.id).eq("id", labTx.data?.id ?? "00000000-0000-0000-0000-000000000000");
  check("Paper trades stay out of the main portfolio", (r.data?.length ?? 0) === 0);
  // Cap of 10 per user
  const { count: have } = await admin.from("portfolios").select("id", { count: "exact", head: true }).eq("user_id", aId);
  const extra = [];
  for (let i = have; i < 10; i++) {
    const x = await A.from("portfolios").insert({ name: "ZZ Fill " + i, kind: "paper", position: 100 + i }).select("id").single();
    if (x.data) extra.push(x.data.id);
  }
  r = await A.from("portfolios").insert({ name: "ZZ Eleventh", kind: "paper" });
  check("An 11th portfolio is refused", !!r.error && /portfolio_limit/.test(r.error.message), r.error?.message);
  if (extra.length) await admin.from("portfolios").delete().in("id", extra);
  r = await A.from("portfolios").insert({ name: "zz private lab ", kind: "real" });
  check("Duplicate portfolio names are refused (any case)", !!r.error);
  // Deleting a portfolio removes its trades
  await A.from("portfolios").delete().eq("id", labId);
  const { data: gone } = await admin.from("transactions").select("id").eq("id", labTx.data?.id ?? "00000000-0000-0000-0000-000000000000");
  check("Deleting a portfolio removes its trades", (gone?.length ?? 0) === 0);

  // Public snapshots: % only, visible only while that portfolio is public
  if (aMain?.is_public) {
    r = await B.from("public_snapshots").select("*").eq("portfolio_id", aMain.id);
    check("B can read A's published snapshot", r.data?.length === 1);
    const json = JSON.stringify(r.data?.[0] ?? {}).toLowerCase();
    const banned = ["shares", "price", "cash", "avgcost", "costbasis", "\"value\"", "amount"].filter((k) => json.includes(k));
    check("Snapshot contains no amounts, shares, prices or cash", banned.length === 0, banned.join(","));
    r = await B.from("profiles").select("full_name").eq("id", aId);
    check("Publishing doesn't expose A's private profile", (r.data?.length ?? 0) === 0);
    r = await B.from("portfolios").select("id, name, kind").eq("id", aMain.id);
    check("B can see a published portfolio's name and type", r.data?.length === 1);
    r = await B.from("public_snapshots").update({ display_name: "Hacked" }).eq("portfolio_id", aMain.id).select();
    check("B cannot edit A's snapshot", (r.data?.length ?? 0) === 0);
    // Flip the portfolio to private directly in the database: the snapshot must disappear for B immediately
    await admin.from("portfolios").update({ is_public: false }).eq("id", aMain.id);
    r = await B.from("public_snapshots").select("portfolio_id").eq("portfolio_id", aMain.id);
    check("Unpublished snapshot is hidden immediately", (r.data?.length ?? 0) === 0);
    await admin.from("portfolios").update({ is_public: true }).eq("id", aMain.id);

    // Follows + alerts, per portfolio
    await admin.from("follows").delete().eq("follower_id", bId).eq("portfolio_id", aMain.id);
    r = await B.from("follows").insert({ portfolio_id: aMain.id });
    check("B can follow A's public portfolio", !r.error, r.error?.message);
    r = await B.from("follows").insert({ follower_id: aId, portfolio_id: aMain.id });
    check("B cannot create a follow on A's behalf", !!r.error);
    r = await A.from("follows").insert({ portfolio_id: aMain.id });
    check("A cannot follow their own portfolio", !!r.error);
    const tx = await A.from("transactions").insert({ portfolio_id: aMain.id, ticker: "ZZTEST", type: "buy", shares: 1, price: 1, currency: "USD" }).select().single();
    r = await B.from("notifications").select("title, body, link").eq("kind", "follow").ilike("title", "%ZZTEST%");
    check("B gets an alert when A buys in that portfolio", r.data?.length === 1, r.data?.[0]?.title);
    check("The alert shows no amounts", !/[0-9]/.test((r.data?.[0]?.title ?? "") + (r.data?.[0]?.body ?? "")), r.data?.[0]?.title);
    check("The alert links to that portfolio", (r.data?.[0]?.link ?? "") === "/public/p/" + aMain.id, r.data?.[0]?.link);
    r = await A.from("notifications").select("id").eq("user_id", bId);
    check("A cannot read B's alerts", (r.data?.length ?? 0) === 0);
    r = await A.from("follows").select("follower_id").eq("portfolio_id", aMain.id);
    check("A cannot list who follows them", (r.data?.length ?? 0) === 0);
    const { data: cnt } = await B.rpc("portfolio_follower_count", { pid: aMain.id });
    check("Follower count works (number only)", typeof cnt === "number" && cnt >= 1, cnt);
    if (tx.data) await admin.from("transactions").delete().eq("id", tx.data.id);
    await admin.from("notifications").delete().eq("user_id", bId).ilike("title", "%ZZTEST%");
    await B.from("follows").delete().eq("portfolio_id", aMain.id);
    await admin.from("portfolios").update({ is_public: false }).eq("id", aMain.id);
    r = await B.from("follows").insert({ portfolio_id: aMain.id });
    check("Private portfolios can't be followed", !!r.error);
    await admin.from("portfolios").update({ is_public: true }).eq("id", aMain.id);
  }
  r = await B.from("transactions").select("id").eq("user_id", aId);
  check("Publishing never exposes A's transactions", (r.data?.length ?? 0) === 0);

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
