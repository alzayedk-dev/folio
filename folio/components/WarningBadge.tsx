import type { Warning } from "@/lib/portfolio";

const STYLES: Record<Exclude<Warning, "none">, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-gain", text: "text-gain", label: "OK" },
  yellow: { dot: "bg-amber-500", text: "text-warn", label: "High" },
  red: { dot: "bg-loss", text: "text-loss", label: "Very High" },
};

/** Concentration warning used by the holdings and sector tables. */
export function WarningBadge({ level, title }: { level: Warning; title?: string }) {
  if (level === "none") return <span className="text-xs text-muted">—</span>;
  const s = STYLES[level];
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${s.text}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}
