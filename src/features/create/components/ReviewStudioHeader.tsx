"use client";

import { PenLine } from "lucide-react";
import Link from "next/link";

import { StudioHeader, StudioHeaderBar } from "@/components/studio-shell";
import { PRODUCT_NAME } from "@/lib/constants/product-brand";
import {
  studioBadge,
  studioIconBox,
  studioNavExportButton,
  studioNavPrimaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface ReviewPrimaryAction {
  label: string;
  onClick: () => void;
  disabled: boolean;
  disabledReason?: string;
  loading?: boolean;
}

export interface ReviewStudioHeaderProps {
  projectTitle: string;
  primaryAction: ReviewPrimaryAction;
  persistWarning?: string | null;
}

/**
 * Review route header — project title, Script Review stage, single context-aware CTA.
 */
export default function ReviewStudioHeader({
  projectTitle,
  primaryAction,
  persistWarning,
}: ReviewStudioHeaderProps) {
  return (
    <StudioHeader
      banner={
        persistWarning ? (
          <p className="text-center text-xs font-medium text-amber-200/95 sm:text-left" role="status">
            {persistWarning}
          </p>
        ) : null
      }
    >
      <StudioHeaderBar>
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <div
            className={`${studioIconBox} h-8 w-8 shrink-0 sm:h-9 sm:w-9 shadow-[0_0_20px_rgba(91,140,255,0.1)]`}
          >
            <PenLine className="h-3.5 w-3.5 text-accent sm:h-4 sm:w-4" strokeWidth={1.75} />
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-[13px] font-semibold tracking-tight text-foreground sm:text-sm">
              {PRODUCT_NAME}
            </p>
            <p className="truncate text-[11px] text-muted">{projectTitle}</p>
          </div>
        </Link>

        <span className={`${studioBadge} hidden shrink-0 sm:inline-flex`}>Script Review</span>

        <div className="min-w-0 flex-1 sm:hidden">
          <p className="truncate text-xs font-medium text-foreground/90">{projectTitle}</p>
        </div>

        <Link href="/drafts" className={`${studioNavExportButton} hidden sm:inline-flex`}>
          Drafts
        </Link>

        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled || primaryAction.loading}
          className={studioNavPrimaryButton}
          title={primaryAction.disabled ? primaryAction.disabledReason : undefined}
        >
          <span className="hidden sm:inline">
            {primaryAction.loading ? `${primaryAction.label}…` : primaryAction.label}
          </span>
          <span className="sm:hidden">
            {primaryAction.loading ? "…" : primaryAction.label.split(" ").slice(0, 2).join(" ")}
          </span>
        </button>
      </StudioHeaderBar>

      {primaryAction.disabled && primaryAction.disabledReason ? (
        <p className={`${studioSubtleText} border-t border-border/15 px-3 py-2 text-center sm:px-4 sm:text-left`}>
          {primaryAction.disabledReason}
        </p>
      ) : null}
    </StudioHeader>
  );
}
