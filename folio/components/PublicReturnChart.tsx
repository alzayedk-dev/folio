"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { pct } from "@/lib/format";

/** % return since the owner's first trade (no dollar values). */
export function PublicReturnChart({ points }: { points: { date: string; pct: number }[] }) {
  if (points.length < 2) return <p className="py-12 text-center text-sm text-muted">Not enough history to chart yet.</p>;
  const fmt = (d: string, long = false) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: long ? "numeric" : "2-digit", timeZone: "UTC" });
  return (
    <div className="h-64 w-full" role="img" aria-label={`Return since first trade: ${pct(points[points.length - 1].pct, { sign: true })}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e5efe9" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => fmt(d)} tick={{ fontSize: 11, fill: "#5b6b63" }} axisLine={{ stroke: "#d1e7dd" }} tickLine={false} minTickGap={40} />
          <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "#5b6b63" }} axisLine={false} tickLine={false} width={44} />
          <ReferenceLine y={0} stroke="#b6cfc3" />
          <Tooltip
            cursor={{ stroke: "#9fb8ab", strokeWidth: 1 }}
            contentStyle={{ borderRadius: 10, border: "1px solid #d1e7dd", fontSize: 12 }}
            labelFormatter={(d) => fmt(String(d), true)}
            formatter={(v) => [pct(Number(v), { sign: true, digits: 2 }), "Return"]}
          />
          <Line type="monotone" dataKey="pct" stroke="#047857" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
