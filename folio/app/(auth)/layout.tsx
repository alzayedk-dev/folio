import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8" aria-label="Folio home">
        <Logo />
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 sm:p-8 shadow-sm">{children}</div>
    </main>
  );
}
