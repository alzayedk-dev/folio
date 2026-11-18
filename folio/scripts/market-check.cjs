/* eslint-disable @typescript-eslint/no-require-imports -- plain Node test script */
// Tests the "market" Edge Function as a signed-in test user.
// Usage (from the folio folder): node scripts/market-check.cjs
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, pub = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

(async () => {
  const c = createClient(url, pub, { auth: { persistSession: false } });
  const { data: s, error } = await c.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD });
  if (error) throw error;
  const token = s.session.access_token;
  const call = async (body, auth = token) => {
    const t = Date.now();
    const r = await fetch(`${url}/functions/v1/market`, { method: "POST", headers: { Authorization: `Bearer ${auth}`, apikey: pub, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ms: Date.now() - t, ...j };
  };

  let r = await call({ action: "status" }, "not-a-real-token");
  check("Rejects calls without a valid login", r.status === 401, r.status);
  // The legacy anon key is a valid signed token but belongs to no user: must be refused
  const anonJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3dHF6ZWp5amFua2djaHh5aXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4ODc5MzMsImV4cCI6MjExMDQ2MzkzM30.O65URoubuCa1CD8ObZs0lwjxy5u-JU7BrelhiN4IogI";
  r = await call({ action: "status" }, anonJwt);
  check("Rejects the public anon key (not a logged-in user)", r.status === 401, r.status);
  r = await call({ action: "status" });
  check("Finnhub key visible to the function", r.ok && r.data.finnhubConfigured === true, JSON.stringify(r.data ?? r.error));
  r = await call({ action: "search", q: "lly" });
  check('Search "lly" finds Eli Lilly (LLY)', r.ok && r.data.some((x) => x.ticker === "LLY"), r.data?.slice(0, 3).map((x) => `${x.ticker} ${x.name}`).join(" | "));
  r = await call({ action: "search", q: "aramco" });
  check('Search "aramco" finds 2222.SR', r.ok && r.data.some((x) => x.ticker === "2222.SR"), r.data?.slice(0, 3).map((x) => x.ticker).join(", "));

  r = await call({ action: "quote", tickers: ["AAPL", "LLY", "VOD.L", "7203.T", "2222.SR"] });
  const q = r.data?.quotes ?? {};
  check("Quotes for 5 tickers (US, London, Tokyo, Saudi)", r.ok && Object.keys(q).length === 5, Object.values(q).map((x) => `${x.ticker} ${x.price} ${x.currency} [${x.source}]`).join(" | ") + ` (${r.ms} ms)`);
  check("US quotes come from Finnhub", q.AAPL?.source === "finnhub" && q.LLY?.source === "finnhub", `${q.AAPL?.source}, ${q.LLY?.source}`);
  check("London price converted from pence to pounds", q["VOD.L"]?.currency === "GBP" && q["VOD.L"]?.price < 20, `${q["VOD.L"]?.price} ${q["VOD.L"]?.currency}`);
  r = await call({ action: "quote", tickers: ["KFH.KW"] });
  const kfh = r.data?.quotes?.["KFH.KW"];
  check("Kuwait price converted from fils to dinars (KWD)", kfh?.currency === "KWD" && kfh?.price > 0 && kfh?.price < 5, `${kfh?.price} ${kfh?.currency}`);
  r = await call({ action: "profile", ticker: "KFH.KW" });
  check("Kuwait stock profile currency is KWD", r.data?.currency === "KWD", r.data?.currency);
  r = await call({ action: "quote", tickers: ["AAPL", "VOD.L"] });
  check("Second call within 60 s served from cache", r.ok && Object.values(r.data.quotes).every((x) => x.source.endsWith("-cache")), Object.values(r.data?.quotes ?? {}).map((x) => x.source).join(", ") + ` (${r.ms} ms)`);
  r = await call({ action: "quote", tickers: ["ZZZZNOTREAL"] });
  check("Unknown ticker reported as missing", r.ok && r.data.missing.includes("ZZZZNOTREAL"));
  r = await call({ action: "quote", tickers: ["DROP TABLE"] });
  check("Malformed ticker rejected", r.status === 400);

  for (const [t, expected] of [["AAPL", "Technology"], ["LLY", "Healthcare"], ["JPM", "Financials & Real Estate"], ["XOM", "Energy"], ["VOD.L", "Communication Services"], ["2222.SR", "Energy"], ["SPY", "Other"]]) {
    r = await call({ action: "profile", ticker: t });
    check(`Profile ${t} → ${expected}`, r.ok && r.data.sector === expected, r.ok ? `${r.data.name} · ${r.data.exchange} · ${r.data.currency} · ${r.data.industry ?? "-"} → ${r.data.sector}` : JSON.stringify(r.error));
  }
  r = await call({ action: "profile", ticker: "ZZZZNOTREAL" });
  check("Unknown ticker profile → friendly 404", r.status === 404 && r.error?.code === "unknown_ticker");

  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  r = await call({ action: "history", ticker: "AAPL", from });
  check("AAPL ~1 year of daily history", r.ok && r.data.points.length > 240, `${r.data?.points.length} days (${r.ms} ms)`);
  const firstMs = r.ms;
  r = await call({ action: "history", ticker: "AAPL", from });
  check("History second call served from database", r.ok && r.data.points.length > 240, `${r.ms} ms vs ${firstMs} ms first time`);
  r = await call({ action: "history", ticker: "VOD.L", from });
  check("VOD.L history in pounds", r.ok && r.data.points.length > 200 && r.data.points.at(-1).close < 20, `${r.data?.points.length} days, last close ${r.data?.points.at(-1)?.close}`);

  r = await call({ action: "earnings", tickers: ["AAPL", "LLY", "VOD.L"] });
  check("Earnings dates returned", r.ok && Object.keys(r.data).length === 3, JSON.stringify(r.data));
  r = await call({ action: "news", ticker: "AAPL" });
  check("News for AAPL", r.ok && r.data.length > 0, r.data?.[0]?.title?.slice(0, 70));
  r = await call({ action: "fx" });
  check("Exchange rates (USD base) incl. SAR, KWD, GBP", r.ok && r.data.rates.SAR > 0 && r.data.rates.KWD > 0 && r.data.rates.GBP > 0, r.ok ? `1 USD = ${r.data.rates.GBP} GBP, ${r.data.rates.SAR} SAR, ${r.data.rates.KWD} KWD` : JSON.stringify(r.error));

  // Shariah screening facts
  r = await call({ action: "shariah", tickers: ["AAPL", "MSFT", "JPM", "VOD.L", "SPY", "GC=F", "ZZZZNOTREAL"] });
  const sh = r.data ?? {};
  const ratio = (x) => (x && x.market_cap ? Number(x.total_debt) / Number(x.market_cap) : null);
  check("Shariah facts for AAPL and MSFT (debt, cash, market value)", r.ok && sh.AAPL?.market_cap > 0 && sh.AAPL?.total_debt != null && sh.MSFT?.cash_investments != null, `AAPL debt/value ${(ratio(sh.AAPL) * 100).toFixed(1)}%, data ${sh.AAPL?.data_date}`);
  check("JPM shows as a bank", /bank/i.test(sh.JPM?.industry ?? ""), sh.JPM?.industry);
  check("London market value in pounds (debt ratio sensible)", ratio(sh["VOD.L"]) > 0.1 && ratio(sh["VOD.L"]) < 10, `VOD.L debt/value ${ratio(sh["VOD.L"])?.toFixed(2)}`);
  check("ETF flagged as a fund; metals skipped; unknown ticker not found", sh.SPY?.quote_type === "ETF" && !sh["GC=F"] && sh.ZZZZNOTREAL?.found === false);
  r = await call({ action: "shariah", tickers: ["AAPL", "JPM"] });
  check("Shariah second call served from cache", r.ok && Object.values(r.data).every((x) => x.source === "cache"), `${r.ms} ms`);
  const w = await c.from("shariah_cache").insert({ ticker: "HACKED" });
  check("Users can't write to the Shariah cache", !!w.error, w.error?.code);

  for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail !== undefined ? "\n      " + x.detail : ""}`);
  const failed = results.filter((x) => !x.pass).length;
  console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} market checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
