import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { PublicHeader } from "./PublicHeader";
import { SiteFooter } from "./SiteFooter";

/** Layout for public content pages (About, Contact): public header, centred content, footer. */
export async function PublicPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-3 text-lg text-muted">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter signedIn={!!user} />
    </div>
  );
}
