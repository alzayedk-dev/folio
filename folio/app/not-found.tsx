import Link from "next/link";
import { Logo } from "@/components/ui";
import { messages } from "@/lib/messages";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-10 text-6xl font-semibold text-brand">404</p>
      <h1 className="mt-3 text-xl font-medium">{messages.notFound}</h1>
      <p className="mt-2 text-sm text-muted">The link may be old, or the page moved to another exchange.</p>
      <Link href="/" className="mt-6 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-strong">
        Back To Folio
      </Link>
    </main>
  );
}
