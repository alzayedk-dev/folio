import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { firstPublicPortfolioOf } from "@/lib/loadPublic";
import { EmptyState } from "@/components/PagePlaceholder";

export const metadata = { title: "Public Portfolio · Folio" };

/** Old link format (/public/<userId>): send people to that investor's published portfolio. */
export default async function OldPublicLink({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const portfolioId = await firstPublicPortfolioOf(supabase, userId);
  if (portfolioId) redirect(`/public/p/${portfolioId}`);
  return (
    <>
      <Link href="/public" className="mb-4 inline-flex min-h-6 items-center gap-1 py-1 text-sm font-medium text-brand hover:underline">
        ← Back To Public Portfolios
      </Link>
      <EmptyState title="This portfolio is private or no longer published." />
    </>
  );
}
