/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script */
// Creates (or refreshes) the Folio demo account with a realistic portfolio.
// Buy prices are real historical closing prices from the market data, so returns are realistic.
// Usage (from the folio folder): node scripts/seed-demo.cjs
// Writes DEMO_USER_EMAIL / DEMO_USER_PASSWORD into .env.local (never committed).
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = env.DEMO_USER_EMAIL || "demo.investor@folio-demo.app";

// ticker, shares, buy date (closing price on/after that date is used)
const BUYS = [
  ["AAPL", 25, "2025-01-15"],
  ["MSFT", 12, "2025-02-10"],
  ["NVDA", 40, "2025-04-07"],
  ["LLY", 6, "2025-03-12"],
  ["JPM", 15, "2025-05-06"],
  ["XOM", 30, "2025-06-02"],
  ["KO", 50, "2025-01-27"],
  ["VOD.L", 3000, "2025-07-01"],
  ["7203.T", 200, "2025-08-04"],
  ["GC=F", 3, "2025-03-03"],
  ["SI=F", 100, "2025-05-20"],
  ["SPY", 10, "2025-09-15"],
];
const SELLS = [["NVDA", 10, "2026-07-14"]];
const DIVIDENDS = [["KO", 25.5, "2025-12-15"], ["XOM", 29.7, "2026-03-10"]];

(async () => {
  // 1) user (create or reset password)
  const password = crypto.randomBytes(9).toString("base64url");
  let userId;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => u.email === EMAIL);
  if (existing) {
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password });
    await admin.from("transactions").delete().eq("user_id", userId);
    await admin.from("cash_entries").delete().eq("user_id", userId);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { display_name: "DemoInvestor", full_name: "Demo Investor", starting_cash: "8500", starting_currency: "USD" },
    });
    if (error) throw error;
    userId = data.user.id;
  }
  await admin.from("profiles").update({
    display_name: "DemoInvestor",
    full_name: "Demo Investor",
    bio: "Diversified long-term investor: US tech and healthcare, global names, plus gold and silver as a hedge.",
    is_public: true,
  }).eq("id", userId);

  // 2) sign in as the demo user so the market function runs with a real session
  const c = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: loginErr } = await c.auth.signInWithPassword({ email: EMAIL, password });
  if (loginErr) throw loginErr;
  const call = async (body) => (await c.functions.invoke("market", { body })).data?.data;
  const closeOn = async (ticker, date) => {
    const h = await call({ action: "history", ticker, from: "2025-01-01" });
    const p = (h?.points ?? []).find((x) => x.date >= date);
    if (!p) throw new Error(`no price for ${ticker} on ${date}`);
    return { price: Math.round(p.close * 100) / 100, date: p.date };
  };

  const rows = [];
  for (const [t, shares, date] of BUYS) {
    const prof = await call({ action: "profile", ticker: t });
    const { price, date: d } = await closeOn(t, date);
    rows.push({ ticker: t, type: "buy", shares, price, fees: t.includes("=") ? 0 : 4.95, currency: prof.currency, trade_date: d, notes: null });
  }
  for (const [t, shares, date] of SELLS) {
    const { price, date: d } = await closeOn(t, date);
    rows.push({ ticker: t, type: "sell", shares, price, fees: 4.95, currency: "USD", trade_date: d, notes: "Took some profit" });
  }
  for (const [t, amount, date] of DIVIDENDS) rows.push({ ticker: t, type: "dividend", amount, fees: 0, currency: "USD", trade_date: date, notes: null });

  const { error: insErr } = await c.from("transactions").insert(rows);
  if (insErr) throw insErr;
  // starting cash today (balance check-point)
  const { count } = await c.from("cash_entries").select("id", { count: "exact", head: true });
  if (!count) await c.from("cash_entries").insert({ kind: "starting", amount: 8500, currency: "USD", note: "Starting cash" });

  // 3) save the login in .env.local (replace any previous demo lines)
  let envText = fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => !l.startsWith("DEMO_USER_")).join("\n").trimEnd();
  envText += `\n\n# --- Demo account for presentations (created by scripts/seed-demo.cjs) ---\nDEMO_USER_EMAIL=${EMAIL}\nDEMO_USER_PASSWORD=${password}\n`;
  fs.writeFileSync(".env.local", envText);
  console.log(`Demo account ready: ${rows.length} transactions; login saved to .env.local (DEMO_USER_EMAIL / DEMO_USER_PASSWORD).`);
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
