"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Logo } from "./ui";
import { UserMenu } from "./UserMenu";
import { NotificationBell } from "./NotificationBell";
import { SiteFooter } from "./SiteFooter";
import { IconAI, IconPerformance, IconPortfolio, IconPublic, IconReminders, IconTransactions } from "./icons";

type Tab = { href: string; label: string; short: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

export const TABS: Tab[] = [
  { href: "/portfolio", label: "Portfolio", short: "Portfolio", icon: IconPortfolio },
  { href: "/transactions", label: "Transactions", short: "Trades", icon: IconTransactions },
  { href: "/performance", label: "Performance", short: "Returns", icon: IconPerformance },
  { href: "/ai", label: "AI", short: "AI", icon: IconAI },
  { href: "/reminders", label: "Reminders", short: "Reminders", icon: IconReminders },
  { href: "/public", label: "Public", short: "Public", icon: IconPublic },
];

export function AppShell({
  displayName,
  avatarUrl,
  children,
}: {
  displayName: string;
  avatarUrl: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/portfolio" aria-label="Folio home">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/about" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-brand md:inline-block">About</Link>
            <Link href="/contact" className="mr-1 hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-brand md:inline-block">Contact</Link>
            <NotificationBell />
            <UserMenu displayName={displayName} avatarUrl={avatarUrl} />
          </div>
        </div>

        {/* Desktop / tablet tab bar */}
        <nav aria-label="Main" className="hidden md:block">
          <ul className="mx-auto flex max-w-6xl gap-1 px-4">
            {TABS.map((t) => {
              const active = isActive(t.href);
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                      active ? "border-brand text-brand" : "border-transparent text-muted hover:text-brand hover:border-brand/40"
                    }`}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-10">{children}</main>
      <div className="pb-20 md:pb-0">
        <SiteFooter signedIn />
      </div>

      {/* Phone bottom bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white md:hidden pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-6">
          {TABS.map((t) => {
            const active = isActive(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}
                >
                  <t.icon className="h-6 w-6" />
                  {t.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
