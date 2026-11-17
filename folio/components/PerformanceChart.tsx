"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import type { PricePoint } from "@/lib/market";
import { RANGES, rangeStart, rangeStats, rebaseBenchmark, rebaseIndex, sliceRange, type DailyPoint, type Range } from "@/lib/performance";
import type { Portfolio } from "@/lib/portfolios";
import { compareSeries } from "@/app/(app)/actions/performance";
import { PaperBadge } from "./PaperBadge";
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
// Colours for other portfolios (distinct from the emerald line and the grey benchmark)
const OTHER_COLORS = ["#2563eb", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626", "#4f46e5", "#ca8a04"];

function shortDate(d: string, long = false) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: long ? "numeric" : undefined, timeZone: "UTC" });
}

export function PerformanceChart({
  points,
  benchmarks,
  base,
  firstDate,
  today,
  currentName = "My Portfolio",
  others = [],
}: {
  points: DailyPoint[];
  benchmarks: Record<BenchKey, PricePoint[]>;
  base: string;
  firstDate: string;
  today: string;
  currentName?: string;
  others?: Pick<Portfolio, "id" | "name" | "kind">[];
}) {
  const [range, setRange] = usePersistentState<Range>("folio.perfRange", "1Y", RANGES);
  const [mode, setMode] = usePersistentState<"usd" | "pct">("folio.perfMode", "usd", ["usd", "pct"]);
  const [view, setView] = useState<"mine" | BenchKey>("mine");
  const [picked, setPicked] = useState<string[]>([]);
  const [series, setSeries] = useState<Record<string, { date: string; index: number }[] | "loading" | "error">>({});
  const colorOf = (id: string) => OTHER_COLORS[Math.max(0, others.findIndex((o) => o.id === id)) % OTHER_COLORS.length];
  const nameOf = (id: string) => others.find((o) => o.id === id)?.name ?? "Portfolio";
  const comparingBench = view !== "mine";
  const comparing = comparingBench || picked.length > 0;
  const showPct = comparing || mode === "pct"; // comparisons are always in %

  function togglePick(id: string) {
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
    if (!series[id]) {
      setSeries((s) => ({ ...s, [id]: "loading" }));
      compareSeries(id)
        .then((r) => setSeries((s) => ({ ...s, [id]: r.ok ? r.points : "error" })))
        .catch(() => setSeries((s) => ({ ...s, [id]: "error" })));
    }
  }

  const start = rangeStart(range, today, firstDate);
  const slice = useMemo(() => sliceRange(points, start), [points, start]);
  const stats = useMemo(() => rangeStats(slice), [slice]);
  const bench = useMemo(
    () => (comparingBench && benchmarks[view as BenchKey]?.length ? rebaseBenchmark(benchmarks[view as BenchKey], slice.map((p) => p.date)) : []),
    [comparingBench, benchmarks, view, slice],
  );
  const benchReturn = bench.length ? bench[bench.length - 1].pct : null;

  const otherLines = useMemo(() => {
    const dates = slice.map((p) => p.date);
    const out: Record<string, (number | null)[]> = {};
    for (const id of picked) {
      const s = series[id];
      if (Array.isArray(s)) out[id] = rebaseIndex(s, dates);
    }
    return out;
  }, [picked, series, slice]);

  const data = useMemo(() => {
    const i0 = slice[0]?.index ?? 1;
    return slice.map((p, i) => {
      const row: Record<string, number | string | null> = {
        date: p.date,
        value: p.value,
        pct: (p.index / i0 - 1) * 100,
        bench: bench[i]?.pct ?? null,
      };
      for (const [id, vals] of Object.entries(otherLines)) row[`o_${id}`] = vals[i];
      return row;
    });
  }, [slice, bench, otherLines]);
  const otherReturn = (id: string) => {
    const vals = otherLines[id];
    if (!vals) return null;
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return vals[i];
    return null;
  };

  const fmtY = (v: number) => (showPct ? `${v.toFixed(0)}%` : money(v, base, { compact: true }));
  const unavailable = comparingBench && !benchmarks[view as BenchKey]?.length;

  return (
    <div className="space-y-4">
      {/* Controls: one row above the chart */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <SegmentedToggle label="Show value in dollars or percent" value={showPct ? "pct" : "usd"} options={MODES} onChange={(v) => !comparing && setMode(v)} />
          <Select value={view} onChange={(e) => setView(e.target.value as typeof view)} aria-label="Benchmark" className="w-auto py-1.5 text-xs">
            <option value="mine">No Benchmark</option>
            <option value="SPY">Vs. S&amp;P 500</option>
            <option value="QQQ">Vs. Nasdaq 100</option>
            <option value="DIA">Vs. Dow Jones</option>
          </Select>
          {others.length > 0 && <CompareMenu others={others} picked={picked} onToggle={togglePick} colorOf={colorOf} />}
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
          <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: BRAND }} aria-hidden="true" /> {currentName}
            </li>
            {picked.map((id) => (
              <li key={id} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ background: colorOf(id) }} aria-hidden="true" /> {nameOf(id)}
                {series[id] === "loading" && <span className="text-muted">(loading…)</span>}
                {series[id] === "error" && <span className="text-warn">(unavailable)</span>}
              </li>
            ))}
            {comparingBench && (
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: BENCH }} aria-hidden="true" /> {BENCH_LABEL[view as BenchKey]}
              </li>
            )}
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
                    if (name === "bench") return [pct(n, { sign: true, digits: 2 }), comparingBench ? BENCH_LABEL[view as BenchKey] : ""];
                    if (typeof name === "string" && name.startsWith("o_")) return [pct(n, { sign: true, digits: 2 }), nameOf(name.slice(2))];
                    return showPct ? [pct(n, { sign: true, digits: 2 }), currentName] : [money(n, base), "Portfolio Value"];
                  }}
                />
                <Line type="monotone" dataKey={showPct ? "pct" : "value"} stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
                {comparingBench && <Line type="monotone" dataKey="bench" stroke={BENCH} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />}
                {picked.filter((id) => otherLines[id]).map((id) => (
                  <Line key={id} type="monotone" dataKey={`o_${id}`} stroke={colorOf(id)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                ))}
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
        {picked.filter((id) => otherReturn(id) != null).length > 0 && (
          <div className="col-span-2 rounded-2xl border border-line bg-white p-4 shadow-sm lg:col-span-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Return Over This Range</p>
            <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: BRAND }} aria-hidden="true" />{currentName}</span>
                <span className={`font-semibold tabular ${gainClass(stats.returnPct)}`}>{pct(stats.returnPct, { sign: true, digits: 2 })}</span>
              </li>
              {picked.map((id) => {
                const r = otherReturn(id);
                return r == null ? null : (
                  <li key={id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: colorOf(id) }} aria-hidden="true" />{nameOf(id)}</span>
                    <span className={`font-semibold tabular ${gainClass(r)}`}>{pct(r, { sign: true, digits: 2 })}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {comparingBench && benchReturn != null && (
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

/** "Compare With" menu: tick other portfolios to draw them as % lines. */
function CompareMenu({
  others,
  picked,
  onToggle,
  colorOf,
}: {
  others: Pick<Portfolio, "id" | "name" | "kind">[];
  picked: string[];
  onToggle: (id: string) => void;
  colorOf: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium hover:border-brand/50"
      >
        Compare With{picked.length ? ` (${picked.length})` : ""}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1.5 w-64 rounded-xl border border-line bg-white p-2 shadow-xl">
          <p className="px-2 pb-1 text-[11px] text-muted">Your other portfolios, shown as % return</p>
          {others.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-brand-soft">
              <input type="checkbox" checked={picked.includes(o.id)} onChange={() => onToggle(o.id)} className="h-4 w-4" style={{ accentColor: colorOf(o.id) }} />
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(o.id) }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.kind === "paper" && <PaperBadge />}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
