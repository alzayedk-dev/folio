"use client";

/** Accessible on/off switch that also submits with its form (hidden input "on" when checked). */
export function Switch({
  name,
  checked,
  onChange,
  label,
  description,
  disabled,
  badge,
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Small label next to the title, e.g. "Coming Soon" */
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">
          {label}
          {badge && <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">{badge}</span>}
        </p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 ${
          checked ? "bg-brand" : "bg-line"
        }`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
      {checked && <input type="hidden" name={name} value="on" />}
    </div>
  );
}
