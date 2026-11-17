import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPublic } from "@/lib/loadPublic";
import { PageHeader, EmptyState } from "@/components/PagePlaceholder";
import { Avatar } from "@/components/UserMenu";
import { gainClass, pct } from "@/lib/format";
import { PaperBadge } from "@/components/PaperBadge";

export const metadata = { title: "Public Portfolios · Folio" };

export default async function PublicPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const list = (await listPublic(supabase)).sort((a, b) => (b.returns.y1 ?? b.returns.all ?? -1e9) - (a.returns.y1 ?? a.returns.all ?? -1e9));

  return (
    <>
      <PageHeader title="Public Portfolios" subtitle="See how other Folio investors allocate, in % only. Copy ideas by trading in your own broker app." />
      {list.length === 0 ? (
        <EmptyState title="No one has opened their books yet.">Publish one of yours from Manage (next to the portfolio switcher) to be the first.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.portfolioId}>
              <Link href={`/public/p/${p.portfolioId}`} className="block h-full rounded-2xl border border-line bg-white p-5 shadow-sm transition-colors hover:border-brand">
                <div className="flex items-center gap-3">
                  <Avatar name={p.displayName} url={p.avatarUrl} size={44} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{p.portfolioName}</span>
                      {p.portfolioKind === "paper" && <PaperBadge />}
                      {p.userId === user?.id && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">You</span>}
                    </p>
                    <p className="truncate text-xs font-medium text-muted">by {p.displayName}</p>
                    <p className="text-xs text-muted">
                      {p.holdingsCount} holding{p.holdingsCount === 1 ? "" : "s"}
                      {p.sectors[0] && ` · Top sector: ${p.sectors[0].sector}`}
                    </p>
                  </div>
                </div>
                {p.bio && <p className="mt-3 line-clamp-2 text-sm text-muted">{p.bio}</p>}
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center tabular">
                  {(
                    [
                      ["1M", p.returns.m1],
                      ["1Y", p.returns.y1],
                      ["All", p.returns.all],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="rounded-lg bg-surface py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
                      <dd className={`text-sm font-semibold ${gainClass(v)}`}>{v == null ? "—" : pct(v, { sign: true })}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
