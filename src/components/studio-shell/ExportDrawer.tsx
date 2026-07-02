"use client";

import type { ReactNode } from "react";

import StudioOverlay from "@/components/studio-overlay/StudioOverlay";

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
  return (
    <StudioOverlay
      open={open}
      onOpenChange={onOpenChange}
      variant="drawer-end"
      title={title}
      description={description}
      titleId="export-drawer-title"
      closeLabel="Close export"
      keepMounted
    >
      {children}
    </StudioOverlay>
  );
}
