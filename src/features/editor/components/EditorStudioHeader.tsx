"use client";

import { Download, PenLine, Save } from "lucide-react";
import Link from "next/link";

import { StudioHeader, StudioHeaderBar } from "@/components/studio-shell";
import { PRODUCT_NAME } from "@/lib/constants/product-brand";
import {
  studioBadge,
  studioIconBox,
  studioNavExportButton,
} from "@/lib/utils/studioUi";

export interface EditorStudioHeaderProps {
  projectTitle: string;
  projectMeta: string;
  onSaveDraft: () => void;
  saveDraftDisabled?: boolean;
  saveDraftConfirmation?: string | null;
  onExport: () => void;
  exportDisabled?: boolean;
  persistWarning?: string | null;
}

/**
 * Editor route header — project context, save draft, export drawer trigger.
 */
export default function EditorStudioHeader({
  projectTitle,
  projectMeta,
  onSaveDraft,
  saveDraftDisabled = false,
  saveDraftConfirmation,
  onExport,
  exportDisabled = false,
  persistWarning,
}: EditorStudioHeaderProps) {
  return (
    <StudioHeader
      banner={
        persistWarning || saveDraftConfirmation ? (
          <>
            {persistWarning ? (
              <p className="text-center text-xs font-medium text-amber-200/95 sm:text-left" role="status">
                {persistWarning}
              </p>
            ) : null}
            {saveDraftConfirmation ? (
              <p
                className={`text-center text-xs font-medium text-accent sm:text-left ${persistWarning ? "mt-1.5 border-t border-border/15 pt-1.5" : ""}`}
                role="status"
              >
                {saveDraftConfirmation}
              </p>
            ) : null}
          </>
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

        <span className={`${studioBadge} hidden shrink-0 sm:inline-flex`}>Editor</span>

        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="truncate text-sm font-medium tracking-tight text-foreground/95">{projectTitle}</p>
          <p className="truncate text-[11px] text-muted">{projectMeta}</p>
        </div>

        <div className="min-w-0 flex-1 sm:hidden">
          <p className="truncate text-xs font-medium text-foreground/90">{projectTitle}</p>
          <p className="truncate text-[10px] text-muted">{projectMeta}</p>
        </div>

        <Link href="/drafts" className={`${studioNavExportButton} hidden sm:inline-flex`}>
          Drafts
        </Link>

        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saveDraftDisabled}
          className={`${studioNavExportButton} hidden sm:inline-flex`}
        >
          <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
          Save Draft
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saveDraftDisabled}
          aria-label="Save draft"
          className={`${studioNavExportButton} sm:hidden`}
        >
          <Save className="h-4 w-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          className={`${studioNavExportButton} hidden sm:inline-flex`}
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          Export Video
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-label="Export video"
          className={`${studioNavExportButton} sm:hidden`}
        >
          <Download className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </StudioHeaderBar>
    </StudioHeader>
  );
}
