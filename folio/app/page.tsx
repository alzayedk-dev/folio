import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui";

const FEATURES = [
  { title: "Every Holding, Live", text: "Prices fill in automatically for US and international stocks, with P/L in $ or %." },
  { title: "Sector Check-Up", text: "See your sector mix and get gentle warnings when one stock or sector gets too heavy." },
  { title: "Performance Since Day One", text: "Track your portfolio against the S&P 500, Nasdaq 100 or Dow." },
  { title: "Earnings Reminders", text: "Know 10 days and 1 day ahead when your companies report." },
  { title: "AI Analyst", text: "Ask about stocks, sectors and markets. It explains, it doesn't advise." },
  { title: "Public Portfolios", text: "Publish your allocation in % only, and follow investors you like." },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/portfolio");

  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-brand hover:bg-brand-soft">
            Log In
          </Link>
          <Link href="/signup" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
            Sign Up
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Your Portfolio, <span className="text-brand">Clearly.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
            Folio tracks your stocks, sectors and performance in one calm, simple place.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/signup" className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-strong">
              Open Your Folio
            </Link>
            <Link href="/login" className="rounded-lg border border-brand px-6 py-3 font-medium text-brand hover:bg-brand-soft">
              Log In
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line p-6">
              <h2 className="font-semibold text-brand">{f.title}</h2>
              <p className="mt-2 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Folio monitors your investments. It does not give financial advice.
      </footer>
    </div>
  );
}
