"use client";

import { PenLine, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PRODUCT_NAME } from "@/lib/constants/product-brand";
import { isPrimaryNavLinkActive, PRIMARY_NAV_LINKS } from "@/lib/constants/product-navigation";
import {
  studioFooter,
  studioHeader,
  studioIconBox,
  studioNavExportButton,
  studioNavPrimaryButton,
  studioShellContainer,
} from "@/lib/utils/studioUi";

interface SiteNavProps {
  children?: ReactNode;
}

function navLinkClass(active: boolean) {
  return active
    ? "text-sm font-medium text-foreground/95"
    : "text-sm font-medium text-muted transition hover:text-foreground/85";
}

export default function SiteNav({ children }: SiteNavProps) {
  const pathname = usePathname();

  return (
    <div className="relative z-10 flex min-h-screen min-w-0 flex-col overflow-x-hidden">
      <header className={studioHeader}>
        <div className={`${studioShellContainer} flex h-11 min-w-0 items-center gap-3 sm:h-[3.25rem] sm:gap-6`}>
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <div
              className={`${studioIconBox} h-8 w-8 shrink-0 sm:h-9 sm:w-9 shadow-[0_0_20px_rgba(91,140,255,0.1)]`}
            >
              <PenLine className="h-3.5 w-3.5 text-accent sm:h-4 sm:w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-tight text-foreground sm:text-sm">
                {PRODUCT_NAME}
              </p>
              <p className="hidden text-[11px] text-muted sm:block">Creator platform for football shorts</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-5 sm:flex" aria-label="Primary">
            {PRIMARY_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={navLinkClass(isPrimaryNavLinkActive(pathname, link.href))}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="min-w-0 flex-1" aria-hidden />

          <Link href="/create" className={`${studioNavPrimaryButton} hidden sm:inline-flex`}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Write Story
          </Link>
          <Link href="/create" aria-label="Write story" className={`${studioNavPrimaryButton} sm:hidden`}>
            <Plus className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
      </header>

      <main className={`${studioShellContainer} min-w-0 flex-1 py-6 sm:py-10 lg:py-14`}>
        {children}
      </main>

      <footer className={studioFooter}>
        <div className={`${studioShellContainer} flex flex-col items-center justify-between gap-2 sm:flex-row`}>
          <p className="text-xs font-medium text-muted">{PRODUCT_NAME}</p>
          <p className="text-[11px] text-muted">Football shorts · 9:16 · MP4</p>
        </div>
      </footer>
    </div>
  );
}

export function SiteNavSecondaryLink({
  href,
  children,
  className = studioNavExportButton,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
