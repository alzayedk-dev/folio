// Builds the percent-only public snapshot of a portfolio. Pure function (unit-tested).
// It must NEVER include dollar amounts, share counts, prices or cash.
import type { Valuation } from "./portfolio";
import { rangeStart, rangeStats, sliceRange, type DailyPoint } from "./performance";

export type SnapshotHolding = { ticker: string; name: string; sector: string; weight: number };
export type SnapshotSector = { sector: string; weight: number };
export type SnapshotReturns = { m1: number | null; ytd: number | null; y1: number | null; all: number | null };
export type Snapshot = {
  holdings: SnapshotHolding[];
  sectors: SnapshotSector[];
  returns: SnapshotReturns;
  performance: { date: string; pct: number }[];
  holdings_count: number;
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function buildSnapshot(v: Valuation, points: DailyPoint[], today: string): Snapshot {
  const invested = v.holdings.reduce((a, h) => a + h.value, 0);
  const holdings: SnapshotHolding[] = invested > 0
    ? v.holdings.map((h) => ({ ticker: h.ticker, name: h.name, sector: h.sector, weight: round((h.value / invested) * 100) }))
    : [];

  const bySector = new Map<string, number>();
  for (const h of holdings) bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + h.weight);
  const sectors = [...bySector.entries()].map(([sector, weight]) => ({ sector, weight: round(weight) })).sort((a, b) => b.weight - a.weight);

  const first = points[0]?.date;
  const ret = (range: "1M" | "YTD" | "1Y" | "ALL"): number | null => {
    if (!first) return null;
    const sl = sliceRange(points, rangeStart(range, today, first));
    return sl.length > 1 ? round(rangeStats(sl).returnPct) : null;
  };

  // Weekly points (plus the last day) keep the chart light
  const i0 = points[0]?.index ?? 1;
  const performance = points
    .filter((_, i) => i % 7 === 0 || i === points.length - 1)
    .map((p) => ({ date: p.date, pct: round((p.index / i0 - 1) * 100) }));

  return {
    holdings,
    sectors,
    returns: { m1: ret("1M"), ytd: ret("YTD"), y1: ret("1Y"), all: ret("ALL") },
    performance,
    holdings_count: holdings.length,
  };
}
