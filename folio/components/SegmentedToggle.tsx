"use client";

/** Small pill switch, e.g. $ / % or 1M · 6M · YTD. Reused across the app. */
export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "sm",
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-6 rounded-md font-medium ${pad} ${active ? "bg-brand text-white" : "text-muted hover:text-brand"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
