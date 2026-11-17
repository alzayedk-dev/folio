import { money, pct } from "@/lib/format";

type Slice = { label: string; value: number; color: string };

/** One stacked bar: Stocks / Precious Metals / Cash, with labels so colour is never the only cue. */
export function AssetMix({ stocks, metals, cash, base }: { stocks: number; metals: number; cash: number; base: string }) {
  const total = stocks + metals + cash;
  if (total <= 0) return null;
  const slices: Slice[] = [
    { label: "Stocks", value: stocks, color: "bg-brand" },
    { label: "Precious Metals", value: metals, color: "bg-amber-500" },
    { label: "Cash", value: cash, color: "bg-muted/40" },
  ].filter((s) => s.value > 0.005);

  return (
    <section aria-labelledby="mix-heading" className="rounded-2xl border border-line bg-white px-4 py-4 shadow-sm sm:px-5">
      <h2 id="mix-heading" className="text-sm font-semibold">Asset Mix</h2>
      <div className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {slices.map((s) => (
          <div key={s.label} className={`${s.color} h-full first:rounded-l-full last:rounded-r-full`} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} aria-hidden="true" />
            <span className="text-muted">{s.label}</span>
            <span className="font-medium tabular">{pct((s.value / total) * 100)}</span>
            <span className="text-xs text-muted tabular">{money(s.value, base)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
