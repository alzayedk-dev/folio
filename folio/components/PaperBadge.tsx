/** Small "Paper" label shown wherever a practice (pretend-money) portfolio appears. */
export function PaperBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Paper portfolio: practice with pretend money"
      className={`inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ${className}`}
    >
      Paper
    </span>
  );
}
