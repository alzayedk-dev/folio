"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "./Modal";
import { Switch } from "./Switch";
import { PaperBadge } from "./PaperBadge";
import { Alert, Button, Field, Input } from "./ui";
import type { Portfolio } from "@/lib/portfolios";
import { deletePortfolio, renamePortfolio, setPortfolioPublic } from "@/app/(app)/actions/portfolios";

/** Rename, publish/unpublish, or delete one portfolio. */
export function ManagePortfolioModal({ open, onClose, portfolio, isOnly }: { open: boolean; onClose: () => void; portfolio: Portfolio; isOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string; where: "name" | "public" | "delete" } | null>(null);
  const [isPublic, setIsPublic] = useState(portfolio.is_public);
  const [confirm, setConfirm] = useState("");

  function rename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const res = await renamePortfolio(portfolio.id, formData);
      setMsg(res.ok ? { tone: "success", text: "Name saved.", where: "name" } : { tone: "error", text: res.error, where: "name" });
      if (res.ok) router.refresh();
    });
  }

  function togglePublic(v: boolean) {
    setIsPublic(v);
    start(async () => {
      const res = await setPortfolioPublic(portfolio.id, v);
      if (!res.ok) {
        setIsPublic(!v);
        setMsg({ tone: "error", text: res.error, where: "public" });
      } else {
        setMsg({ tone: "success", text: v ? "Published. Others see percentages only." : "Private again. Removed from the Public tab.", where: "public" });
        router.refresh();
      }
    });
  }

  function remove() {
    start(async () => {
      const res = await deletePortfolio(portfolio.id, confirm);
      if (!res.ok) return setMsg({ tone: "error", text: res.error, where: "delete" });
      onClose();
      router.refresh();
    });
  }

  const note = (where: "name" | "public" | "delete") => (msg?.where === where ? <Alert tone={msg.tone}>{msg.text}</Alert> : null);

  return (
    <Modal open={open} onClose={onClose} title="Manage Portfolio">
      <div className="space-y-6">
        <p className="flex items-center gap-2 text-sm text-muted">
          {portfolio.kind === "paper" ? <PaperBadge /> : <span className="rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-strong">Real</span>}
          {portfolio.kind === "paper" ? "Practice portfolio with pretend money." : "A portfolio of money you've actually invested."}
        </p>

        <form onSubmit={rename} className="space-y-2">
          <Field label="Name" htmlFor="pf-rename">
            <div className="flex gap-2">
              <Input id="pf-rename" name="name" defaultValue={portfolio.name} maxLength={40} required />
              <Button type="submit" variant="outline" disabled={pending}>
                Save
              </Button>
            </div>
          </Field>
          {note("name")}
        </form>

        <div className="border-t border-line pt-4">
          <Switch
            name="isPublic"
            label="Publish This Portfolio"
            description={isPublic ? "Visible on the Public tab, percentages only. Others can follow it." : "Private. Only you can see it."}
            checked={isPublic}
            disabled={pending}
            onChange={togglePublic}
          />
          {msg?.where === "public" && msg.tone === "error" && msg.text.includes("Settings") ? (
            <Alert>
              {msg.text}{" "}
              <Link href="/settings" className="font-medium underline" onClick={onClose}>
                Open Settings
              </Link>
            </Alert>
          ) : (
            note("public")
          )}
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-loss">Delete Portfolio</h3>
          {isOnly ? (
            <p className="text-xs text-muted">This is your only portfolio, so it can&apos;t be deleted.</p>
          ) : (
            <>
              <p className="text-xs text-muted">
                This removes <strong className="text-foreground">{portfolio.name}</strong> with all its trades and cash, for good. Type its name to confirm.
              </p>
              <div className="flex gap-2">
                <Input aria-label="Type the portfolio name to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={portfolio.name} />
                <Button type="button" onClick={remove} disabled={pending || confirm.trim() !== portfolio.name.trim()} className="bg-loss hover:bg-red-700">
                  Delete
                </Button>
              </div>
              {note("delete")}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
