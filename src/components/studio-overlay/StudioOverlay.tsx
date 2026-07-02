"use client";

import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  studioExportDrawerBackdrop,
  studioExportDrawerPanel,
  studioOverlayBody,
  studioOverlayCloseButton,
  studioOverlayFooter,
  studioOverlayHeader,
  studioOverlayModalPanel,
  studioOverlayModalShell,
  studioShellSectionDesc,
  studioShellSectionTitle,
} from "@/lib/utils/studioUi";

import { useStudioOverlayLock } from "./useStudioOverlayLock";

export type StudioOverlayVariant = "drawer-end" | "modal-center";

export interface StudioOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: StudioOverlayVariant;
  title: ReactNode;
  description?: ReactNode;
  titleId?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerIcon?: ReactNode;
  closeLabel?: string;
  /** When false, unmount panel content while closed (default true for drawers). */
  keepMounted?: boolean;
  className?: string;
  panelClassName?: string;
  maxWidthClassName?: string;
}

/**
 * Unified Studio overlay — drawer-end (export, asset browser) or modal-center (publishing, confirm).
 */
export default function StudioOverlay({
  open,
  onOpenChange,
  variant = "drawer-end",
  title,
  description,
  titleId = "studio-overlay-title",
  children,
  footer,
  headerIcon,
  closeLabel = "Close",
  keepMounted = true,
  className = "",
  panelClassName = "",
  maxWidthClassName = "max-w-2xl",
}: StudioOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const handleClose = () => onOpenChange(false);

  useStudioOverlayLock(open, handleClose, panelRef);

  if (typeof document === "undefined") {
    return null;
  }

  if (!keepMounted && !open) {
    return null;
  }

  const backdrop = (
    <div
      aria-hidden={!open}
      className={`${studioExportDrawerBackdrop} ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={handleClose}
    />
  );

  const header = (
    <header className={studioOverlayHeader}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {headerIcon ? <span className="shrink-0 text-accent">{headerIcon}</span> : null}
          <h2 id={titleId} className={studioShellSectionTitle}>
            {title}
          </h2>
        </div>
        {description ? <p className={studioShellSectionDesc}>{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={handleClose}
        className={studioOverlayCloseButton}
        aria-label={closeLabel}
      >
        <X className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </header>
  );

  const body = <div className={studioOverlayBody}>{children}</div>;
  const footerNode = footer ? <footer className={studioOverlayFooter}>{footer}</footer> : null;

  if (variant === "drawer-end") {
    return createPortal(
      <>
        {backdrop}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-hidden={!open}
          tabIndex={-1}
          className={`${studioExportDrawerPanel} ${panelClassName} ${
            open
              ? "pointer-events-auto translate-y-0 lg:translate-x-0 lg:translate-y-0"
              : "pointer-events-none translate-y-full lg:translate-x-full lg:translate-y-0"
          } ${className}`.trim()}
        >
          {header}
          {body}
          {footerNode}
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      {backdrop}
      <div
        aria-hidden={!open}
        className={`${studioOverlayModalShell} ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        } ${className}`.trim()}
        onClick={handleClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`${studioOverlayModalPanel} ${maxWidthClassName} ${panelClassName} ${
            open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`.trim()}
          onClick={(event) => event.stopPropagation()}
        >
          {header}
          {body}
          {footerNode}
        </div>
      </div>
    </>,
    document.body,
  );
}
