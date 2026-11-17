import type { SectorRow } from "@/lib/portfolio";
import { SECTOR_THRESHOLDS } from "@/lib/portfolio";
import { money, pct } from "@/lib/format";
import { WarningBadge } from "./WarningBadge";
import { METALS, isMetal } from "@/lib/metals";

const NOTE = `Guideline: one sector above ${SECTOR_THRESHOLDS.yellow}% is high, above ${SECTOR_THRESHOLDS.red}% is very high. ETFs ("Other") and cash get no warning. Not advice.`;

/** Bar showing a weight on a 0–100% track, with thin marks at the two warning thresholds. */
function WeightBar({ weight, muted }: { weight: number; muted?: boolean }) {
  const w = Math.max(0, Math.min(100, weight));
  return (
    <div className="relative h-2.5 w-full rounded-full bg-surface" aria-hidden="true">
      <div className={`h-2.5 rounded-full ${muted ? "bg-muted/40" : "bg-brand"}`} style={{ width: `${w}%` }} />
      {[SECTOR_THRESHOLDS.yellow, SECTOR_THRESHOLDS.red].map((t) => (
        <span key={t} className="absolute -top-1 h-4.5 w-px bg-foreground/35" style={{ left: `${t}%` }} />
      ))}
    </div>
  );
}

/** Sector weights with thresholds and warnings (server-rendered, no client JS). */
export function SectorTable({ sectors, base }: { sectors: SectorRow[]; base: string }) {
  const total = sectors.reduce((a, s) => a + s.weight, 0);

  return (
    <section aria-labelledby="sector-heading" className="rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="sector-heading" className="font-semibold">Sector Weights</h2>
        <p className="text-xs text-muted" title={NOTE}>
          Thresholds {SECTOR_THRESHOLDS.yellow}% / {SECTOR_THRESHOLDS.red}%
        </p>
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Portfolio weight by sector, with concentration warnings</caption>
        <thead className="border-b border-line bg-surface text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium sm:px-5">Sector</th>
            <th scope="col" className="hidden w-2/5 px-3 py-2.5 text-left font-medium sm:table-cell">
              <span className="sr-only">Weight bar</span>
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Weight</th>
            <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular">
          {sectors.map((s) => {
            const neutral = s.sector === "Cash" || s.sector === "Other";
            return (
              <tr key={s.sector}>
                <td className="px-4 py-3 sm:px-5">
                  <span className={`block font-medium ${s.sector === "Cash" ? "text-muted" : ""}`}>{s.sector}</span>
                  {s.tickers.length > 0 && <span className="block text-xs text-muted">{s.tickers.map((t) => (isMetal(t) ? METALS[t].name : t)).join(", ")}</span>}
                  {/* phone: bar under the name */}
                  <div className="mt-2 sm:hidden">
                    <WeightBar weight={s.weight} muted={neutral} />
                  </div>
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <WeightBar weight={s.weight} muted={neutral} />
                </td>
                <td className="px-3 py-3 text-right font-medium">
                  <span className="block">{pct(s.weight)}</span>
                  <span className="mt-0.5 flex justify-end">
                    <WarningBadge level={s.warning} title={NOTE} hideNone />
                  </span>
                </td>
                <td className="hidden px-3 py-3 text-right text-muted md:table-cell">{money(s.value, base)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-brand/30 bg-brand-soft/40 font-semibold tabular">
          <tr>
            <td className="px-4 py-3 sm:px-5">Total</td>
            <td className="hidden sm:table-cell" />
            <td className="px-3 py-3 text-right">{pct(total)}</td>
            <td className="hidden md:table-cell" />
          </tr>
        </tfoot>
      </table>
      <p className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
        The thin marks on each bar show the {SECTOR_THRESHOLDS.yellow}% and {SECTOR_THRESHOLDS.red}% guidelines. These come from common rules of thumb, not financial advice.
      </p>
    </section>
  );
}
