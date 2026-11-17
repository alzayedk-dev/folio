"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** Small ⓘ button: shows a short explanation on hover, keyboard focus, or click/tap (tap again or Escape to close). */
export function InfoTip({ text, label = "More info" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position on screen (fixed) so scrolling table boxes can't clip the tip; keep it inside the window
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      const width = 208;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 6, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [pinned]);

  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => !pinned && setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((p) => !p);
          setOpen((o) => (pinned ? false : true) || !o);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold leading-none text-muted hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        i
      </button>
      {open && pos && (
        <span
          id={id}
          role="tooltip"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 w-52 whitespace-normal rounded-lg border border-line bg-white px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
