// Folio daily job: earnings reminders for everyone's current holdings.
// Timing is per user (profiles.reminder_first / reminder_second); defaults 7 days and 1 day before.
// Triggered once a day by pg_cron with a private secret (x-cron-secret), checked against app_config.
// Uses the service role (provided automatically to Edge Functions) because it works across all users.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import YahooFinance from "npm:yahoo-finance2@4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY") ?? Deno.env.get("Finnhub_API_KEY") ?? "";
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const METALS = new Set(["GC=F", "SI=F"]);
const MAX_DAYS = 31; // longest reminder anyone can pick is 30 days

const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const isUs = (t: string) => !t.includes(".") && !t.includes("=") && !t.startsWith("^");
const niceDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function earningsDates(tickers: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const today = day(0);
  // One Finnhub call covers every US company reporting in the next month
  if (FINNHUB_KEY && tickers.some(isUs)) {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${day(MAX_DAYS)}`, { headers: { "X-Finnhub-Token": FINNHUB_KEY }, signal: AbortSignal.timeout(10000) });
      const j = await res.json();
      for (const e of j?.earningsCalendar ?? []) {
        const t = String(e.symbol).replace(".", "-");
        if (tickers.includes(t) && e.date >= today && (!out.has(t) || e.date < out.get(t)!)) out.set(t, e.date);
      }
    } catch {
      /* fall back to Yahoo below */
    }
  }
  // International (and any US ticker Finnhub missed): Yahoo, one by one
  for (const t of tickers.filter((x) => !out.has(x)).slice(0, 60)) {
    try {
      const s: any = await yf.quoteSummary(t, { modules: ["calendarEvents"] });
      const next = (s?.calendarEvents?.earnings?.earningsDate ?? [])
        .map((d: Date) => new Date(d).toISOString().slice(0, 10))
        .filter((d: string) => d >= today)
        .sort()[0];
      if (next && daysBetween(today, next) <= MAX_DAYS) out.set(t, next);
    } catch {
      /* unknown: skip */
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const { data: cfg } = await admin.from("app_config").select("value").eq("key", "cron_secret").single();
  if (!cfg?.value || req.headers.get("x-cron-secret") !== cfg.value) return new Response("Unauthorized", { status: 401 });

  // Current holdings per user: net shares from buys and sells
  const { data: rows } = await admin.from("transactions").select("user_id, ticker, type, shares").in("type", ["buy", "sell"]);
  const net = new Map<string, number>(); // "user|ticker" -> shares
  for (const r of rows ?? []) {
    if (METALS.has(r.ticker)) continue;
    const k = `${r.user_id}|${r.ticker}`;
    net.set(k, (net.get(k) ?? 0) + (r.type === "buy" ? Number(r.shares) : -Number(r.shares)));
  }
  const holdings = [...net.entries()].filter(([, s]) => s > 1e-9).map(([k]) => k.split("|") as [string, string]);
  const tickers = [...new Set(holdings.map(([, t]) => t))];

  const { data: profiles } = await admin.from("profiles").select("id, notify_inapp, notify_email, reminder_first, reminder_second");
  const prefs = new Map(
    (profiles ?? []).map((p) => [p.id, { wants: p.notify_inapp || p.notify_email, first: p.reminder_first ?? 7, second: p.reminder_second as number | null }]),
  );

  const dates = await earningsDates(tickers);
  const today = day(0);
  const notes: Record<string, unknown>[] = [];
  for (const [userId, ticker] of holdings) {
    const d = dates.get(ticker);
    const pref = prefs.get(userId);
    if (!d || !pref?.wants) continue;
    const left = daysBetween(today, d);
    // Same rule as lib/reminders.ts reminderStage()
    const flag = left < 0 ? null : pref.second != null && left <= pref.second ? "second" : left <= pref.first ? "first" : null;
    if (!flag) continue;
    notes.push({
      user_id: userId,
      kind: "earnings",
      title: left === 0 ? `${ticker} reports earnings today (${niceDate(d)})` : left === 1 ? `${ticker} reports earnings tomorrow (${niceDate(d)})` : `${ticker} reports earnings in ${left} days (${niceDate(d)})`,
      body: "Earnings reminder for a stock you hold.",
      link: `/stock/${encodeURIComponent(ticker)}`,
      dedupe_key: `earnings:${userId}:${ticker}:${d}:${flag}`,
    });
  }
  let created = 0;
  if (notes.length) {
    const { data } = await admin.from("notifications").upsert(notes, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    created = data?.length ?? 0;
  }
  return new Response(JSON.stringify({ ok: true, holdings: holdings.length, tickers: tickers.length, withDates: dates.size, created }), { headers: { "Content-Type": "application/json" } });
});
