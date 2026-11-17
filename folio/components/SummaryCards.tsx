import type { Valuation } from "@/lib/portfolio";
import { gainClass, money, pct } from "@/lib/format";

function StatCard({ label, value, sub, valueClass = "" }: { label: string; value: string; sub?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular sm:text-2xl ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted tabular">{sub}</p>}
    </div>
  );
}

/** Top row on the Portfolio tab. */
export function SummaryCards({ v }: { v: Valuation }) {
  const c = v.base;
  return (
    <section aria-label="Portfolio summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="col-span-2 lg:col-span-1">
        <StatCard label="Total Value" value={money(v.totalValue, c)} sub={`Invested ${money(v.investedValue, c)}`} />
      </div>
      <StatCard label="Cash" value={money(v.cashValue, c)} sub={v.totalValue > 0 ? `${pct((v.cashValue / v.totalValue) * 100)} of portfolio` : undefined} />
      <StatCard label="Today" value={money(v.dayChange, c, { sign: true })} valueClass={gainClass(v.dayChange)} sub={pct(v.dayChangePct, { sign: true, digits: 2 })} />
      <StatCard label="Unrealized P/L" value={money(v.unrealizedPL, c, { sign: true })} valueClass={gainClass(v.unrealizedPL)} sub={pct(v.unrealizedPLPct, { sign: true })} />
      <StatCard
        label="Realized P/L"
        value={money(v.realizedPL, c, { sign: true })}
        valueClass={gainClass(v.realizedPL)}
        sub={v.dividends ? `+ ${money(v.dividends, c)} dividends` : "From sales"}
      />
    </section>
  );
}
