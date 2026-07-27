import type { ReactNode } from "react";

import {
  studioShellEditorMaxWidth,
  studioShellHeaderRegion,
  studioShellMaxWidth,
  studioShellRegionPadding,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioHeaderProps extends StudioShellRegionProps {
  /** Secondary row below main header (save status, warnings). */
  banner?: ReactNode;
  /** Uses the wider editor workspace boundary without changing document routes. */
  wide?: boolean;
}

/**
 * Top shell chrome. Accepts arbitrary header content (brand, nav, actions).
 * Presentation only — no routing or draft logic.
 */
export default function StudioHeader({
  children,
  banner,
  wide = false,
  className = "",
  id,
}: StudioHeaderProps) {
  const maxWidthClass = wide ? studioShellEditorMaxWidth : studioShellMaxWidth;

  return (
    <header
      id={id}
      className={`${studioShellHeaderRegion} ${className}`.trim()}
    >
      <div className={`${maxWidthClass} ${studioShellRegionPadding}`}>
        {children}
      </div>
      {banner ? (
        <div
          className={`${maxWidthClass} border-t border-border/15 px-3 py-2 sm:px-4`}
        >
          {banner}
        </div>
      ) : null}
    </header>
  );
}

export function StudioHeaderBar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[3.25rem] min-w-0 items-center gap-2 sm:gap-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
