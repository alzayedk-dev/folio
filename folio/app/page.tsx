import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicHeader } from "@/components/PublicHeader";
import { SiteFooter } from "@/components/SiteFooter";

const DELIVERABLES = [
  "Every stock, ETF, gold and silver holding valued live",
  "Profit and loss in $ or %, per position and in total",
  "Sector concentration warnings before risk builds up",
  "Performance since day one vs the S&P 500, Nasdaq and Dow",
];

const FEATURES = [
  { title: "Live Holdings", text: "Prices fill in automatically for US and international stocks, plus gold and silver by the ounce or gram." },
  { title: "Sector Check-Up", text: "See your sector mix with clear 25% / 40% guideline markers and gentle warnings when one stock or sector gets heavy." },
  { title: "Performance Since Day One", text: "A time-weighted return chart that ignores deposits, compared with the S&P 500, Nasdaq 100 or Dow." },
  { title: "Earnings Reminders", text: "Know 10 days and 1 day ahead when the companies you own report results." },
  { title: "AI Analyst", text: "Ask about stocks, sectors and markets. It knows your mix in % terms, and it explains rather than advises." },
  { title: "Public Portfolios", text: "Publish your allocation in % only, follow investors you like and get an alert when they trade." },
];

const STEPS = [
  { n: "1", title: "Open Your Folio", text: "Sign up in under a minute and enter the cash in your brokerage account." },
  { n: "2", title: "Add Your Trades", text: "Type a ticker like LLY or VOD.L. Name, sector and live price fill in for you." },
  { n: "3", title: "Watch It Work", text: "Totals, P/L, sector warnings, performance and reminders update automatically." },
];

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-brand" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z" clipRule="evenodd" />
    </svg>
  );
}

/** Static, clearly-labelled sample of the dashboard (illustration only, not real data). */
function DashboardPreview() {
  const sectors = [
    { name: "Technology", w: 38, warn: "yellow" },
    { name: "Healthcare", w: 24, warn: "ok" },
    { name: "Precious Metals", w: 15, warn: "none" },
    { name: "Financials & Real Estate", w: 13, warn: "ok" },
  ];
  return (
    <div className="relative" aria-label="Sample dashboard preview" role="img">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-brand-soft" aria-hidden="true" />
      <div className="rounded-2xl border border-line bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total Value</p>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">Sample Portfolio</span>
        </div>
        <p className="mt-1 text-3xl font-semibold tabular">$84,250.00</p>
        <p className="text-sm text-gain tabular">+$612.40 (+0.73%) today</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Stocks", "71%"],
            ["Metals", "15%"],
            ["Cash", "14%"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-surface py-2">
              <p className="text-[11px] text-muted">{l}</p>
              <p className="text-sm font-semibold tabular">{v}</p>
            </div>
          ))}
        </div>

        <svg viewBox="0 0 300 70" className="mt-4 h-20 w-full" aria-hidden="true">
          <polyline fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5 4" points="0,52 40,50 80,47 120,46 160,41 200,40 240,36 300,33" />
          <polyline fill="none" stroke="#047857" strokeWidth="2.5" points="0,55 40,49 80,51 120,40 160,36 200,30 240,22 300,14" />
        </svg>
        <p className="-mt-1 flex justify-between text-[11px] text-muted">
          <span>
            <span className="font-semibold text-brand">━</span> Your portfolio +18.4%
          </span>
          <span>┅ S&amp;P 500 +10.9%</span>
        </p>

        <div className="mt-4 space-y-2.5">
          {sectors.map((s) => (
            <div key={s.name}>
              <div className="flex justify-between text-xs">
                <span>{s.name}</span>
                <span className={`tabular ${s.warn === "yellow" ? "font-medium text-warn" : "text-muted"}`}>
                  {s.w}% {s.warn === "yellow" ? "· High" : ""}
                </span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-surface">
                <div className={`h-2 rounded-full ${s.warn === "none" ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${s.w}%` }} />
                <span className="absolute -top-0.5 h-3 w-px bg-foreground/30" style={{ left: "25%" }} />
                <span className="absolute -top-0.5 h-3 w-px bg-foreground/30" style={{ left: "40%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg sm:block">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle" aria-hidden="true" />
        NVDA reports earnings in 2 days
      </div>
    </div>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/portfolio");

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-strong">
              Free portfolio tracker for self-directed investors
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              See Your Whole Portfolio, <span className="text-brand">Clearly.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Folio brings your stocks, gold, silver and cash from every broker into one calm dashboard, with live prices, honest performance and early warnings when your money gets too concentrated.
            </p>
            <ul className="mt-6 space-y-2.5">
              {DELIVERABLES.map((d) => (
                <li key={d} className="flex gap-2.5 text-sm text-foreground">
                  <Check />
                  {d}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg bg-brand px-6 py-3 font-medium text-white shadow-sm hover:bg-brand-strong">
                Open Your Free Folio
              </Link>
              <Link href="/login" className="rounded-lg border border-brand px-6 py-3 font-medium text-brand hover:bg-brand-soft">
                Log In
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted">No bank or broker connection needed. You stay in control of your data.</p>
          </div>
          <DashboardPreview />
        </section>

        {/* Features */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Everything You Need To Stay On Top</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-muted">One place for the numbers that matter, without spreadsheets or switching between broker apps.</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                  <h3 className="font-semibold text-brand">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">How It Works</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{s.n}</span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Privacy */}
        <section className="border-t border-line bg-brand-soft/60">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3">
            {[
              ["Private By Default", "Your data is locked to your account by the database itself. No one else can see it."],
              ["Share Only %", "Publishing shows weights and returns in percentages, never amounts, share counts or cash."],
              ["Monitors, Never Trades", "Folio doesn't connect to your broker, place trades or give buy/sell advice."],
            ].map(([t, d]) => (
              <div key={t}>
                <h3 className="font-semibold text-brand-strong">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final call to action */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ready To See The Full Picture?</h2>
          <p className="mt-2 text-muted">It takes about a minute to set up.</p>
          <Link href="/signup" className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-strong">
            Open Your Free Folio
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
