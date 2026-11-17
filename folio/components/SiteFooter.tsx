import Link from "next/link";
import { Logo } from "./ui";

/** Footer on every page (public and signed-in). */
export function SiteFooter({ signedIn = false }: { signedIn?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-2 text-sm text-muted">Track your stocks, precious metals and cash in one simple place.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
          <Link href="/about" className="py-1 text-muted hover:text-brand">About</Link>
          <Link href="/contact" className="py-1 text-muted hover:text-brand">Contact</Link>
          {signedIn ? (
            <>
              <Link href="/portfolio" className="py-1 text-muted hover:text-brand">Portfolio</Link>
              <Link href="/settings" className="py-1 text-muted hover:text-brand">Settings</Link>
            </>
          ) : (
            <>
              <Link href="/login" className="py-1 text-muted hover:text-brand">Log In</Link>
              <Link href="/signup" className="py-1 text-muted hover:text-brand">Sign Up</Link>
            </>
          )}
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted">
          © {year} Folio · Folio monitors your investments. It does not place trades or give financial advice.
        </p>
      </div>
    </footer>
  );
}
