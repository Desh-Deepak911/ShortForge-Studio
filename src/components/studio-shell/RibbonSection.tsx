"use client";

import type { ReactNode } from "react";

import { studioRibbonSection, studioRibbonSectionTitle } from "@/lib/utils/studioUi";

export interface RibbonSectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * Grouped ribbon controls for one editing context.
 */
export default function RibbonSection({ title, icon, children }: RibbonSectionProps) {
  return (
    <section className={studioRibbonSection} aria-label={title}>
      <div className={studioRibbonSectionTitle}>
        {icon ? <span aria-hidden>{icon}</span> : null}
        <span>{title}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </section>
  );
}
