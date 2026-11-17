import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublic } from "@/lib/loadPublic";
import { sectorWarning, SECTOR_THRESHOLDS } from "@/lib/portfolio";
import { isMetal, METALS } from "@/lib/metals";
import { gainClass, pct } from "@/lib/format";
import { Avatar } from "@/components/UserMenu";
import { WarningBadge } from "@/components/WarningBadge";
import { PublicReturnChart } from "@/components/PublicReturnChart";
import { EmptyState } from "@/components/PagePlaceholder";
import { Card } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";

export const metadata = { title: "Public Portfolio · Folio" };

export default async function PublicPortfolioPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const p = await getPublic(supabase, userId);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isMe = user?.id === userId;
  let following = false;
  let followers = 0;
  if (p) {
    const [{ data: f }, { data: c }] = await Promise.all([
      supabase.from("follows").select("followee_id").eq("followee_id", userId).maybeSingle(),
      supabase.rpc("follower_count", { uid: userId }),
    ]);
    following = !!f;
    followers = typeof c === "number" ? c : 0;
  }

  return (
    <>
      <Link href="/public" className="mb-4 inline-flex min-h-6 items-center gap-1 py-1 text-sm font-medium text-brand hover:underline">
        ← Back To Public Portfolios
      </Link>
      {!p ? (
        <EmptyState title="This portfolio is private or no longer published." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Avatar name={p.displayName} url={p.avatarUrl} size={64} />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{p.displayName}</h1>
                {p.bio && <p className="mt-1 max-w-xl text-sm text-muted">{p.bio}</p>}
                <p className="mt-1 text-xs text-muted">Updated {new Date(p.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </div>
            </div>
            {isMe ? (
              <p className="text-xs text-muted">This is your public page · {followers} follower{followers === 1 ? "" : "s"}</p>
            ) : (
              <FollowButton userId={userId} initialFollowing={following} initialCount={followers} />
            )}
          </div>

          <section aria-label="Returns" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ["1 Month", p.returns.m1],
                ["Year To Date", p.returns.ytd],
                ["1 Year", p.returns.y1],
                ["All Time", p.returns.all],
              ] as const
            ).map(([label, v]) => (
              <Card key={label} className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
                <p className={`mt-1.5 text-xl font-semibold tabular ${gainClass(v)}`}>{v == null ? "—" : pct(v, { sign: true, digits: 2 })}</p>
              </Card>
            ))}
          </section>

          <Card>
            <h2 className="mb-3 font-semibold">Return Since First Trade</h2>
            <PublicReturnChart points={p.performance} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="pub-holdings" className="rounded-2xl border border-line bg-white shadow-sm">
              <h2 id="pub-holdings" className="border-b border-line px-5 py-3 font-semibold">
                Holdings <span className="font-normal text-muted">({p.holdingsCount})</span>
              </h2>
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-surface text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">Asset</th>
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">Sector</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">% Of Invested</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular">
                  {p.holdings.map((h) => (
                    <tr key={h.ticker}>
                      <td className="px-5 py-3">
                        <span className="block font-semibold">{isMetal(h.ticker) ? METALS[h.ticker].name : h.ticker}</span>
                        <span className="block max-w-[12rem] truncate text-xs text-muted">{isMetal(h.ticker) ? "Precious metal" : h.name}</span>
                      </td>
                      <td className="px-3 py-3 text-muted">{h.sector}</td>
                      <td className="px-5 py-3 text-right font-medium">{pct(h.weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section aria-labelledby="pub-sectors" className="rounded-2xl border border-line bg-white shadow-sm">
              <h2 id="pub-sectors" className="border-b border-line px-5 py-3 font-semibold">Sector Weights</h2>
              <ul className="divide-y divide-line">
                {p.sectors.map((s) => (
                  <li key={s.sector} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{s.sector}</span>
                      <span className="flex items-center gap-3 tabular">
                        {pct(s.weight)}
                        <WarningBadge level={sectorWarning(s.sector, s.weight)} />
                      </span>
                    </div>
                    <div className="relative mt-2 h-2 rounded-full bg-surface" aria-hidden="true">
                      <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, s.weight)}%` }} />
                      {[SECTOR_THRESHOLDS.yellow, SECTOR_THRESHOLDS.red].map((t) => (
                        <span key={t} className="absolute -top-1 h-4 w-px bg-foreground/35" style={{ left: `${t}%` }} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line px-5 py-2.5 text-xs text-muted">Weights are of invested assets; cash isn&apos;t shared.</p>
            </section>
          </div>
          <p className="text-xs text-muted">Shown in percentages only. Folio never shares amounts, share counts or cash. This isn&apos;t investment advice.</p>
        </div>
      )}
    </>
  );
}
