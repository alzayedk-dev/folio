import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { market, MarketError } from "@/lib/market";
import { loadLedgerData } from "@/lib/loadPortfolio";
import { replayLedger } from "@/lib/portfolio";
import { toPositionSummary } from "@/lib/positionSummary";
import { cleanTicker } from "@/supabase/functions/market/currency";
import { isMetal } from "@/lib/metals";
import { gainClass, money, pct, price as fmtPrice, shares as fmtShares } from "@/lib/format";
import { messages } from "@/lib/messages";
import { PriceChart } from "@/components/PriceChart";
import { AddTransactionButton } from "@/components/AddTransactionButton";
import { Skeleton } from "@/components/Skeleton";
import { Alert, Card } from "@/components/ui";
import { ShariahBadge } from "@/components/ShariahBadge";
import { screen } from "@/lib/shariah";

type Params = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Params) {
  const { ticker } = await params;
  return { title: `${decodeURIComponent(ticker).toUpperCase()} · Folio` };
}

export default async function StockPage({ params }: Params) {
  const { ticker: raw } = await params;
  const ticker = cleanTicker(decodeURIComponent(raw));
  if (!ticker) notFound();
  return (
    <>
      <Link href="/portfolio" className="mb-4 inline-flex min-h-6 items-center gap-1 py-1 text-sm font-medium text-brand hover:underline">
        ← Back To Portfolio
      </Link>
      <Suspense
        fallback={
          <div role="status" aria-label={messages.loading} className="space-y-4">
            <p className="text-sm text-muted">{messages.loading}</p>
            <Skeleton className="h-24" />
            <Skeleton className="h-72" />
          </div>
        }
      >
        <StockContent ticker={ticker} />
      </Suspense>
    </>
  );
}

function daysUntil(date: string) {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((new Date(date + "T00:00:00Z").getTime() - today) / 864e5);
}

async function StockContent({ ticker }: { ticker: string }) {
  const supabase = await createClient();
  const metal = isMetal(ticker);
  const from = new Date(Date.now() - 5 * 365 * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [profileRes, quoteRes, historyRes, newsRes, earningsRes, ledgerRes] = await Promise.allSettled([
    market.profile(supabase, ticker),
    market.quotes(supabase, [ticker]),
    market.history(supabase, ticker, from),
    metal ? Promise.resolve([]) : market.news(supabase, ticker),
    metal ? Promise.resolve({} as Record<string, string | null>) : market.earnings(supabase, [ticker]),
    loadLedgerData(supabase),
  ]);

  if (profileRes.status === "rejected") {
    if (profileRes.reason instanceof MarketError && profileRes.reason.code === "unknown_ticker") notFound();
    return <Alert>{profileRes.reason instanceof MarketError ? profileRes.reason.friendly : messages.serverBusy}</Alert>;
  }
  const p = profileRes.value;
  const q = quoteRes.status === "fulfilled" ? quoteRes.value.quotes[ticker] : undefined;
  const history = historyRes.status === "fulfilled" ? historyRes.value.points : [];
  const news = newsRes.status === "fulfilled" ? newsRes.value : [];
  const earnings = earningsRes.status === "fulfilled" ? earningsRes.value[ticker] ?? null : null;

  // The user's own position in this stock
  let position: { shares: number; avgCost: number; realized: number } | null = null;
  let positions = {};
  let showShariah = true;
  if (ledgerRes.status === "fulfilled") {
    const { txns, cash, baseCurrency } = ledgerRes.value;
    showShariah = ledgerRes.value.showShariah;
    const ledger = replayLedger(txns, cash, { base: baseCurrency });
    positions = toPositionSummary(ledger);
    const pos = ledger.positions[ticker];
    if (pos) position = { shares: pos.shares, avgCost: pos.avgCost, realized: pos.realizedPL };
  }
  const unit = metal ? " / oz" : "";
  const value = position && q ? position.shares * q.price : null;
  const pl = position && q ? (q.price - position.avgCost) * position.shares : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {p.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logo} alt="" width={48} height={48} className="h-12 w-12 rounded-xl border border-line bg-white object-contain p-1" />
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{metal ? p.name : `${p.ticker} · ${p.name}`}</h1>
            <p className="mt-1 text-sm text-muted">{[p.exchange, p.sector, p.currency].filter(Boolean).join(" · ")}</p>
            {showShariah && (
              <div className="mt-2">
                <Suspense fallback={<span className="inline-block h-6 w-28 animate-pulse rounded-full bg-surface" role="status" aria-label="Loading Shariah screening" />}>
                  <StockShariah ticker={ticker} />
                </Suspense>
              </div>
            )}
          </div>
        </div>
        <AddTransactionButton positions={positions} presetTicker={ticker} />
      </div>

      {/* Price + position */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Current Price</p>
          <p className="mt-1.5 text-2xl font-semibold tabular">{q ? `${fmtPrice(q.price, p.currency)}${unit}` : "—"}</p>
          {q && (
            <p className={`text-sm tabular ${gainClass(q.change)}`}>
              {q.change != null ? money(q.change, p.currency, { sign: true }) : ""} ({pct(q.changePct, { sign: true, digits: 2 })}) today
              {q.stale && <span className="ml-1 text-warn">· delayed</span>}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Your Position</p>
          {position && position.shares > 0 ? (
            <>
              <p className="mt-1.5 text-2xl font-semibold tabular">{value != null ? money(value, p.currency) : "—"}</p>
              <p className="text-sm text-muted tabular">
                {fmtShares(Math.round(position.shares * 1e4) / 1e4)} {metal ? "oz" : "shares"} · Buy Price {fmtPrice(position.avgCost, p.currency)}
                {unit}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-muted">You don&apos;t hold {metal ? "any" : "this stock"} right now.</p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Profit / Loss</p>
          {pl != null && position && position.shares > 0 ? (
            <>
              <p className={`mt-1.5 text-2xl font-semibold tabular ${gainClass(pl)}`}>{money(pl, p.currency, { sign: true })}</p>
              <p className={`text-sm tabular ${gainClass(pl)}`}>{pct((pl / (position.avgCost * position.shares)) * 100, { sign: true })} unrealized</p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-muted">{position?.realized ? `Realized ${money(position.realized, p.currency, { sign: true })}` : "—"}</p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Next Earnings</p>
          {metal ? (
            <p className="mt-1.5 text-sm text-muted">Metals don&apos;t report earnings.</p>
          ) : earnings ? (
            <>
              <p className="mt-1.5 text-2xl font-semibold">
                {new Date(earnings + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
              </p>
              <p className="text-sm text-muted">in {daysUntil(earnings)} days</p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-muted">No date announced yet.</p>
          )}
        </Card>
      </div>

      <PriceChart points={history} currency={p.currency} today={today} unitLabel={metal ? "oz" : undefined} />

      {/* News */}
      {!metal && (
        <section aria-labelledby="news-heading" className="rounded-2xl border border-line bg-white shadow-sm">
          <h2 id="news-heading" className="border-b border-line px-4 py-3 font-semibold sm:px-5">Latest News</h2>
          {news.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">No recent news for this stock. The newswire is quiet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {news.slice(0, 6).map((n) => (
                <li key={n.url} className="px-4 py-3 sm:px-5">
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="block py-0.5 font-medium text-foreground hover:text-brand hover:underline">
                    {n.title}
                  </a>
                  <p className="mt-0.5 text-xs text-muted">
                    {[n.source, n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Streams in after the rest of the page so a slow lookup never holds up prices or the chart. */
async function StockShariah({ ticker }: { ticker: string }) {
  const supabase = await createClient();
  try {
    const facts = isMetal(ticker) ? {} : await market.shariah(supabase, [ticker]);
    return <ShariahBadge result={screen(ticker, facts[ticker] ?? null)} size="md" />;
  } catch {
    return <span className="text-xs text-muted">{messages.shariahSlow}</span>;
  }
}
