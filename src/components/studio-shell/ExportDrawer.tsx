"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  studioExportDrawerBackdrop,
  studioExportDrawerBody,
  studioExportDrawerHeader,
  studioExportDrawerPanel,
  studioShellSectionDesc,
  studioShellSectionTitle,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface ExportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title?: string;
  description?: string;
}

/**
 * Export drawer — right panel on desktop, bottom sheet on mobile.
 * Keeps children mounted so in-progress export state is preserved when dismissed.
 */
export default function ExportDrawer({
  open,
  onOpenChange,
  children,
  title = "Export Video",
  description = "Format, quality, and download.",
}: ExportDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div
        aria-hidden={!open}
        className={`${studioExportDrawerBackdrop} ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-drawer-title"
        aria-hidden={!open}
        className={`${studioExportDrawerPanel} ${
          open
            ? "pointer-events-auto translate-y-0 lg:translate-x-0 lg:translate-y-0"
            : "pointer-events-none translate-y-full lg:translate-x-full lg:translate-y-0"
        }`}
      >
        <header className={studioExportDrawerHeader}>
          <div className="min-w-0">
            <h2 id="export-drawer-title" className={studioShellSectionTitle}>
              {title}
            </h2>
            {description ? <p className={studioShellSectionDesc}>{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={`${studioSubtleText} inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-border/25 hover:bg-surface-elevated/50 hover:text-foreground/90`}
            aria-label="Close export"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </header>

        <div className={studioExportDrawerBody}>{children}</div>
      </div>
    </>,
    document.body,
  );
}
