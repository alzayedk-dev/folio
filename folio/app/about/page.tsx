import Link from "next/link";
import { PublicPage } from "@/components/PublicPage";

export const metadata = { title: "About · Folio", description: "What Folio is, who it helps and how it works." };

const SECTIONS = [
  {
    title: "What Folio Is For",
    body: "Folio is a free portfolio tracker for people who invest on their own. If your stocks, gold, silver and cash are spread across different broker apps and spreadsheets, Folio brings them into one clear dashboard so you always know what you own, what it is worth and how it is doing.",
  },
  {
    title: "Who It Helps",
    body: "Self-directed investors, from beginners checking their first few shares to experienced investors managing positions on several exchanges. It works with US and international stocks, ETFs, and gold and silver measured in troy ounces or grams.",
  },
  {
    title: "What You Get",
    list: [
      "Live prices and total value in the currency you choose",
      "Profit and loss per holding and in total, in $ or %",
      "Sector weights with 25% / 40% guideline warnings, and 10% / 20% warnings per stock",
      "Performance since your first trade, compared with the S&P 500, Nasdaq 100 or Dow",
      "Earnings reminders 10 days and 1 day before your companies report",
      "An AI analyst for questions about stocks, sectors and markets",
      "Optional public portfolios in % only, with follow alerts",
    ],
  },
  {
    title: "What Folio Doesn't Do",
    body: "Folio monitors your investments. It never connects to your broker, never places trades and never tells you to buy or sell. The warnings are common rules of thumb, not financial advice.",
  },
  {
    title: "Your Data",
    body: "Your transactions and balances are visible only to you, enforced by the database itself. If you choose to publish your portfolio, others see percentages only, never amounts, share counts or cash. Market data comes from Finnhub and Yahoo Finance; exchange rates from open exchange-rate sources.",
  },
];

export default function AboutPage() {
  return (
    <PublicPage title="About Folio" subtitle="One calm place for everything you invest in.">
      <div className="space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-xl font-semibold text-brand">{s.title}</h2>
            {s.body && <p className="mt-2 leading-relaxed text-muted">{s.body}</p>}
            {s.list && (
              <ul className="mt-3 space-y-2">
                {s.list.map((item) => (
                  <li key={item} className="flex gap-2.5 text-muted">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <div className="flex flex-wrap gap-3 border-t border-line pt-8">
          <Link href="/signup" className="rounded-lg bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-strong">
            Open Your Free Folio
          </Link>
          <Link href="/contact" className="rounded-lg border border-brand px-5 py-2.5 font-medium text-brand hover:bg-brand-soft">
            Contact Us
          </Link>
        </div>
      </div>
    </PublicPage>
  );
}
