"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import type { PricePoint } from "@/lib/market";
import { RANGES, rangeStart, rangeStats, rebaseBenchmark, sliceRange, type DailyPoint, type Range } from "@/lib/performance";
import { gainClass, money, pct } from "@/lib/format";
import { SegmentedToggle } from "./SegmentedToggle";
import { usePersistentState } from "./usePersistentState";
import { Select } from "./ui";

type BenchKey = "SPY" | "QQQ" | "DIA";
const BENCH_LABEL: Record<BenchKey, string> = { SPY: "S&P 500", QQQ: "Nasdaq 100", DIA: "Dow Jones" };
const RANGE_OPTIONS = RANGES.map((r) => ({ value: r, label: r === "ALL" ? "All" : r }));
const MODES = [
  { value: "usd", label: "$" },
  { value: "pct", label: "%" },
] as const;

const BRAND = "#047857";
const BENCH = "#64748b";

function shortDate(d: string, long = false) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: long ? "numeric" : undefined, timeZone: "UTC" });
}

export function PerformanceChart({
  points,
  benchmarks,
  base,
  firstDate,
  today,
}: {
  points: DailyPoint[];
  benchmarks: Record<BenchKey, PricePoint[]>;
  base: string;
  firstDate: string;
  today: string;
}) {
  const [range, setRange] = usePersistentState<Range>("folio.perfRange", "1Y", RANGES);
  const [mode, setMode] = usePersistentState<"usd" | "pct">("folio.perfMode", "usd", ["usd", "pct"]);
  const [view, setView] = useState<"mine" | BenchKey>("mine");
  const comparing = view !== "mine";
  const showPct = comparing || mode === "pct"; // comparisons are always in %

  const start = rangeStart(range, today, firstDate);
  const slice = useMemo(() => sliceRange(points, start), [points, start]);
  const stats = useMemo(() => rangeStats(slice), [slice]);
  const bench = useMemo(
    () => (comparing && benchmarks[view]?.length ? rebaseBenchmark(benchmarks[view], slice.map((p) => p.date)) : []),
    [comparing, benchmarks, view, slice],
  );
  const benchReturn = bench.length ? bench[bench.length - 1].pct : null;

  const data = useMemo(() => {
    const i0 = slice[0]?.index ?? 1;
    return slice.map((p, i) => ({
      date: p.date,
      value: p.value,
      pct: (p.index / i0 - 1) * 100,
      bench: bench[i]?.pct ?? null,
    }));
  }, [slice, bench]);

  const fmtY = (v: number) => (showPct ? `${v.toFixed(0)}%` : money(v, base, { compact: true }));
  const unavailable = comparing && !benchmarks[view]?.length;

  return (
    <div className="space-y-4">
      {/* Controls: one row above the chart */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <SegmentedToggle label="Show value in dollars or percent" value={showPct ? "pct" : "usd"} options={MODES} onChange={(v) => !comparing && setMode(v)} />
          <Select value={view} onChange={(e) => setView(e.target.value as typeof view)} aria-label="Compare with" className="w-auto py-1.5 text-xs">
            <option value="mine">My Portfolio</option>
            <option value="SPY">vs S&amp;P 500</option>
            <option value="QQQ">vs Nasdaq 100</option>
            <option value="DIA">vs Dow Jones</option>
          </Select>
        </div>
      </div>

      <section aria-labelledby="perf-chart-heading" className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="perf-chart-heading" className="font-semibold">
            Performance
          </h2>
          <p className="text-xs text-muted">
            {shortDate(start, true)} – {shortDate(today, true)}
          </p>
        </div>

        {comparing && (
          <ul className="mb-2 flex flex-wrap gap-4 text-xs" aria-label="Legend">
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: BRAND }} aria-hidden="true" /> My Portfolio
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: BENCH }} aria-hidden="true" /> {BENCH_LABEL[view]}
            </li>
          </ul>
        )}

        {data.length < 2 ? (
          <p className="py-16 text-center text-sm text-muted">Not enough history in this range yet. Try a longer range.</p>
        ) : (
          <div className="h-72 w-full sm:h-80" role="img" aria-label={`Line chart of ${showPct ? "return" : "portfolio value"} from ${shortDate(start)} to ${shortDate(today)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e5efe9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => shortDate(d)}
                  tick={{ fontSize: 11, fill: "#5b6b63" }}
                  axisLine={{ stroke: "#d1e7dd" }}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  tickFormatter={fmtY}
                  tick={{ fontSize: 11, fill: "#5b6b63" }}
                  axisLine={false}
                  tickLine={false}
                  width={showPct ? 44 : 64}
                  domain={["auto", "auto"]}
                />
                {showPct && <ReferenceLine y={0} stroke="#b6cfc3" />}
                <Tooltip
                  cursor={{ stroke: "#9fb8ab", strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 10, border: "1px solid #d1e7dd", fontSize: 12 }}
                  labelFormatter={(d) => shortDate(String(d), true)}
                  formatter={(v, name) => {
                    const n = Number(v);
                    if (name === "bench") return [pct(n, { sign: true, digits: 2 }), comparing ? BENCH_LABEL[view as BenchKey] : ""];
                    return showPct ? [pct(n, { sign: true, digits: 2 }), "My Portfolio"] : [money(n, base), "Portfolio Value"];
                  }}
                />
                <Line type="monotone" dataKey={showPct ? "pct" : "value"} stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
                {comparing && <Line type="monotone" dataKey="bench" stroke={BENCH} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-4 flex justify-center">
          <SegmentedToggle label="Time range" value={range} options={RANGE_OPTIONS} onChange={setRange} size="md" />
        </div>
        {unavailable && <p className="mt-2 text-xs text-warn">{BENCH_LABEL[view as BenchKey]} history is unavailable right now. The market feed is catching its breath.</p>}
      </section>

      {/* Summary under the chart */}
      <section aria-label="Range summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Return" value={pct(stats.returnPct, { sign: true, digits: 2 })} className={gainClass(stats.returnPct)} sub="Time-weighted, money added excluded" />
        <Stat
          label="Value Change"
          value={money(stats.valueChange, base, { sign: true })}
          className={gainClass(stats.valueChange)}
          sub={stats.netFlows ? `Incl. ${money(stats.netFlows, base, { sign: true })} money added/withdrawn` : "No money added or withdrawn"}
        />
        <Stat label="Best Day" value={stats.best ? pct(stats.best.pct, { sign: true, digits: 2 }) : "—"} className={stats.best ? gainClass(stats.best.pct) : ""} sub={stats.best ? shortDate(stats.best.date, true) : undefined} />
        <Stat label="Worst Day" value={stats.worst ? pct(stats.worst.pct, { sign: true, digits: 2 }) : "—"} className={stats.worst ? gainClass(stats.worst.pct) : ""} sub={stats.worst ? shortDate(stats.worst.date, true) : undefined} />
        {comparing && benchReturn != null && (
          <div className="col-span-2 rounded-2xl border border-brand/30 bg-brand-soft/50 p-4 lg:col-span-4">
            <p className="text-sm">
              {BENCH_LABEL[view as BenchKey]} returned <span className={`font-semibold ${gainClass(benchReturn)}`}>{pct(benchReturn, { sign: true, digits: 2 })}</span> over this range. Your portfolio{" "}
              {stats.returnPct >= benchReturn ? "beat" : "trailed"} it by{" "}
              <span className="font-semibold">{Math.abs(stats.returnPct - benchReturn).toFixed(2)} percentage points</span>.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular ${className}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
