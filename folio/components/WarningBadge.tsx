import type { Warning } from "@/lib/portfolio";

// Calm by design: a gentle note, not an alarm. Grey words for every level; only the small dot hints at the level.
const STYLES: Record<Exclude<Warning, "none">, { dot: string; label: string }> = {
  ok: { dot: "bg-slate-300", label: "OK" },
  yellow: { dot: "bg-amber-300", label: "High" },
  red: { dot: "bg-rose-300", label: "Very High" },
};

/** Concentration note used under weights in the holdings and sector tables. */
export function WarningBadge({ level, title, hideNone = false }: { level: Warning; title?: string; hideNone?: boolean }) {
  if (level === "none") return hideNone ? null : <span className="text-[11px] text-muted">—</span>;
  const s = STYLES[level];
  return (
    <span title={title} className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-normal text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}
