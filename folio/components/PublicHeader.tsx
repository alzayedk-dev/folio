import Link from "next/link";
import { Logo } from "./ui";
import { IconHome } from "./icons";

/** Header for public pages (landing, About, Contact). */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="Folio home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          <Link href="/" aria-label="Home" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 font-medium text-muted hover:text-brand sm:px-3">
            <IconHome className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
          <Link href="/about" className="hidden rounded-lg px-3 py-2 font-medium text-muted hover:text-brand sm:inline-block">About</Link>
          <Link href="/contact" className="hidden rounded-lg px-3 py-2 font-medium text-muted hover:text-brand sm:inline-block">Contact</Link>
          <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-brand hover:bg-brand-soft">Log In</Link>
          <Link href="/signup" className="rounded-lg bg-brand px-3.5 py-2 font-medium text-white hover:bg-brand-strong">Sign Up</Link>
        </nav>
      </div>
    </header>
  );
}
