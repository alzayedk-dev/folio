"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followPortfolio, unfollowPortfolio } from "@/app/(app)/actions/social";

/** Follow / Following toggle with follower count. Optimistic, rolls back on error. */
export function FollowButton({ portfolioId, initialFollowing, initialCount }: { portfolioId: string; initialFollowing: boolean; initialCount: number }) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [hover, setHover] = useState(false);

  function toggle() {
    const next = !following;
    setError(null);
    setFollowing(next);
    setCount((c) => c + (next ? 1 : -1));
    start(async () => {
      const res = next ? await followPortfolio(portfolioId) : await unfollowPortfolio(portfolioId);
      if (!res.ok) {
        setFollowing(!next);
        setCount((c) => c + (next ? -1 : 1));
        setError(res.error);
      } else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={following}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`min-w-32 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
          following ? "border border-brand bg-white text-brand hover:border-loss hover:text-loss" : "bg-brand text-white hover:bg-brand-strong"
        }`}
      >
        {following ? (hover ? "Unfollow" : "Following ✓") : "Follow"}
      </button>
      <p className="text-xs text-muted">
        {count} follower{count === 1 ? "" : "s"}
      </p>
      {error && <p className="max-w-56 text-right text-xs text-loss">{error}</p>}
    </div>
  );
}
