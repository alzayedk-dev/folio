import { money, pct } from "@/lib/format";

/** Final card on the Portfolio page: stocks + precious metals + cash = total portfolio value. */
export function PortfolioTotal({ stocks, metals, cash, base }: { stocks: number; metals: number; cash: number; base: string }) {
  const total = stocks + metals + cash;
  const share = (x: number) => (total > 0 ? pct((x / total) * 100) : "—");
  const parts = [
    { label: "Stocks", value: stocks },
    { label: "Precious Metals", value: metals },
    { label: "Cash", value: cash },
  ];
  return (
    <section aria-labelledby="portfolio-total" className="rounded-2xl border border-brand/30 bg-white shadow-sm">
      <h2 id="portfolio-total" className="border-b border-line px-4 py-3 font-semibold sm:px-5">
        Total Portfolio Value
      </h2>
      <dl className="divide-y divide-line tabular">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
            <dt className="text-muted">{p.label}</dt>
            <dd className="flex items-baseline gap-3">
              <span className="text-xs text-muted">{share(p.value)}</span>
              <span className="w-32 text-right font-medium">{money(p.value, base)}</span>
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 rounded-b-2xl bg-brand-soft/50 px-4 py-3.5 sm:px-5">
          <dt className="font-semibold">Total</dt>
          <dd className="text-lg font-semibold">{money(total, base)}</dd>
        </div>
      </dl>
    </section>
  );
}
