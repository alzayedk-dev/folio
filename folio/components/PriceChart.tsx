"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PricePoint } from "@/lib/market";
import { rangeStart, sliceRange, type Range } from "@/lib/performance";
import { gainClass, pct, price as fmtPrice } from "@/lib/format";
import { SegmentedToggle } from "./SegmentedToggle";
import { usePersistentState } from "./usePersistentState";

const RANGES: Range[] = ["1M", "6M", "YTD", "1Y", "5Y"];
const OPTIONS = RANGES.map((r) => ({ value: r, label: r }));

function shortDate(d: string, long = false) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: long ? "numeric" : undefined, timeZone: "UTC" });
}

/** Closing-price chart for one stock or metal, with its own range buttons. `scale` converts stored prices (e.g. per oz → per g). */
export function PriceChart({ points, currency, today, unitLabel, scale = 1 }: { points: PricePoint[]; currency: string; today: string; unitLabel?: string; scale?: number }) {
  const [range, setRange] = usePersistentState<Range>("folio.stockRange", "1Y", RANGES);
  const first = points[0]?.date ?? today;
  const start = rangeStart(range, today, first);
  const data = useMemo(() => sliceRange(points, start).map((p) => ({ date: p.date, close: p.close * scale })), [points, start, scale]);
  const change = data.length > 1 ? (data[data.length - 1].close / data[0].close - 1) * 100 : null;
  const up = (change ?? 0) >= 0;

  return (
    <section aria-labelledby="price-chart-heading" className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="price-chart-heading" className="font-semibold">Price</h2>
          {change != null && (
            <p className={`text-sm tabular ${gainClass(change)}`}>
              {pct(change, { sign: true, digits: 2 })} <span className="text-muted">over {range}</span>
            </p>
          )}
        </div>
      </div>
      {data.length < 2 ? (
        <p className="py-16 text-center text-sm text-muted">Price history isn&apos;t available for this range yet.</p>
      ) : (
        <div className="h-64 w-full sm:h-72" role="img" aria-label={`Closing price chart, ${range}, ${change != null ? pct(change, { sign: true }) : ""}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#e5efe9" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => shortDate(d)} tick={{ fontSize: 11, fill: "#5b6b63" }} axisLine={{ stroke: "#d1e7dd" }} tickLine={false} minTickGap={40} />
              <YAxis
                tickFormatter={(v: number) => fmtPrice(v, currency).replace(/\.\d+$/, "")}
                tick={{ fontSize: 11, fill: "#5b6b63" }}
                axisLine={false}
                tickLine={false}
                width={64}
                domain={["auto", "auto"]}
              />
              <Tooltip
                cursor={{ stroke: "#9fb8ab", strokeWidth: 1 }}
                contentStyle={{ borderRadius: 10, border: "1px solid #d1e7dd", fontSize: 12 }}
                labelFormatter={(d) => shortDate(String(d), true)}
                formatter={(v) => [`${fmtPrice(Number(v), currency)}${unitLabel ? ` / ${unitLabel}` : ""}`, "Close"]}
              />
              <Line type="monotone" dataKey="close" stroke={up ? "#047857" : "#b91c1c"} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-4 flex justify-center">
        <SegmentedToggle label="Price chart range" value={range} options={OPTIONS} onChange={setRange} size="md" />
      </div>
    </section>
  );
}
