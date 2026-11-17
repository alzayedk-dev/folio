"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/app/(app)/actions/social";
import { IconBell } from "./icons";

type Note = { id: string; kind: "earnings" | "follow" | "system"; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const KIND_DOT: Record<Note["kind"], string> = { earnings: "bg-amber-500", follow: "bg-brand", system: "bg-muted" };

/** Header bell: unread badge, latest alerts, mark-as-read. Polls every 60 s while the tab is visible. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notes.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(15);
    setFailed(!!error);
    if (data) setNotes(data as Note[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

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

  async function markAll() {
    setNotes((ns) => ns.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await markNotificationsRead();
  }

  async function openNote(n: Note) {
    setOpen(false);
    if (!n.read_at) {
      setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await markNotificationsRead(n.id);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative rounded-full p-2 text-muted hover:bg-brand-soft hover:text-brand"
      >
        <IconBell className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-loss px-1 text-[11px] font-semibold text-white" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-medium text-brand hover:underline">
                Mark All Read
              </button>
            )}
          </div>
          {!loaded ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Checking the wire…</p>
          ) : failed ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Alerts are catching their breath. Try again in a moment.</p>
          ) : notes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">No alerts yet. Follow a public portfolio or hold stocks with upcoming earnings.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {notes.map((n) => {
                const inner = (
                  <span className="flex gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : KIND_DOT[n.kind]}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className={`block text-sm ${n.read_at ? "text-muted" : "font-medium text-foreground"}`}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                      <span className="block text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                    </span>
                  </span>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => openNote(n)} className="block px-4 py-3 hover:bg-brand-soft/50">
                        {inner}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => openNote(n)} className="block w-full px-4 py-3 text-left hover:bg-brand-soft/50">
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
