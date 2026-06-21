"use client";

import { Download, PenLine, Plus, Save } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  studioFooter,
  studioHeader,
  studioIconBox,
  studioNavExportButton,
  studioNavPrimaryButton,
  studioShellContainer,
  studioShellContainerWide,
} from "@/lib/studioUi";

interface AppShellProps {
  children: ReactNode;
  /** Active project title — shown beside brand on desktop when set. */
  projectTitle?: string;
  projectMeta?: string;
  hasProject: boolean;
  loading?: boolean;
  onCreateStory: () => void;
  onExport: () => void;
  createDisabled?: boolean;
  exportDisabled?: boolean;
  /** When true, show a Drafts link in the header. */
  showDraftsNav?: boolean;
  /** Manual draft save — shown in editor header when provided. */
  onSaveDraft?: () => void;
  saveDraftDisabled?: boolean;
  saveDraftConfirmation?: string | null;
}

export default function AppShell({
  children,
  projectTitle,
  projectMeta,
  hasProject,
  loading = false,
  onCreateStory,
  onExport,
  createDisabled = false,
  exportDisabled = false,
  showDraftsNav = true,
  onSaveDraft,
  saveDraftDisabled = false,
  saveDraftConfirmation,
}: AppShellProps) {
  return (
    <div className="relative z-10 flex min-h-screen min-w-0 flex-col overflow-x-hidden">
      <header className={studioHeader}>
        <div className={`${hasProject ? studioShellContainerWide : studioShellContainer} flex h-11 min-w-0 items-center gap-2 sm:h-[3.25rem] sm:gap-4`}>
          {/* Brand */}
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <div
              className={`${studioIconBox} h-8 w-8 shrink-0 sm:h-9 sm:w-9 shadow-[0_0_20px_rgba(91,140,255,0.1)]`}
            >
              <PenLine className="h-3.5 w-3.5 text-accent sm:h-4 sm:w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-tight text-foreground sm:text-sm">
                FootieBitz
              </p>
              <p className="hidden text-[11px] text-muted sm:block">Short-form studio</p>
            </div>
          </Link>

          {/* Project context — desktop / tablet */}
          {hasProject && projectTitle ? (
            <>
              <div
                aria-hidden
                className="hidden h-5 w-px shrink-0 bg-border sm:block"
              />
              <div className="hidden min-w-0 flex-1 sm:block">
                <p className="truncate text-sm font-medium tracking-tight text-foreground/95">
                  {projectTitle}
                </p>
                {projectMeta ? (
                  <p className="truncate text-[11px] text-muted">{projectMeta}</p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="hidden flex-1 sm:block" aria-hidden />
          )}

          {/* Mobile project title — compact inline when space allows */}
          {hasProject && projectTitle ? (
            <div className="min-w-0 flex-1 sm:hidden">
              <p className="truncate text-xs font-medium text-foreground/90">{projectTitle}</p>
              {projectMeta ? (
                <p className="truncate text-[10px] text-muted">{projectMeta}</p>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0 flex-1 sm:hidden" aria-hidden />
          )}

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {showDraftsNav ? (
              <Link href="/drafts" className={`${studioNavExportButton} hidden sm:inline-flex`}>
                Drafts
              </Link>
            ) : null}
            {hasProject ? (
              <>
                {onSaveDraft ? (
                  <>
                    <button
                      type="button"
                      onClick={onSaveDraft}
                      disabled={saveDraftDisabled || loading}
                      className={`${studioNavExportButton} hidden sm:inline-flex`}
                    >
                      <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={onSaveDraft}
                      disabled={saveDraftDisabled || loading}
                      aria-label="Save draft"
                      className={`${studioNavExportButton} sm:hidden`}
                    >
                      <Save className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={onExport}
                  disabled={exportDisabled || loading}
                  className={`${studioNavExportButton} hidden sm:inline-flex`}
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Export
                </button>
                <button
                  type="button"
                  onClick={onExport}
                  disabled={exportDisabled || loading}
                  aria-label="Export video"
                  className={`${studioNavExportButton} sm:hidden`}
                >
                  <Download className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCreateStory}
                  disabled={createDisabled || loading}
                  className={`${studioNavPrimaryButton} hidden sm:inline-flex`}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  New Story
                </button>
                <button
                  type="button"
                  onClick={onCreateStory}
                  disabled={createDisabled || loading}
                  aria-label="New story"
                  className={`${studioNavPrimaryButton} sm:hidden`}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </button>
              </>
            )}
          </div>
        </div>
        {saveDraftConfirmation ? (
          <div
            className={`${hasProject ? studioShellContainerWide : studioShellContainer} border-t border-border/15 py-2`}
            role="status"
            aria-live="polite"
          >
            <p className="text-center text-xs font-medium text-accent sm:text-left">
              {saveDraftConfirmation}
            </p>
          </div>
        ) : null}
      </header>

      <main
        className={`${hasProject ? studioShellContainerWide : studioShellContainer} min-w-0 flex-1 py-6 sm:py-10 lg:py-14`}
      >
        {children}
      </main>

      <footer className={studioFooter}>
        <div className={`${hasProject ? studioShellContainerWide : studioShellContainer} flex flex-col items-center justify-between gap-2 sm:flex-row`}>
          <p className="text-xs font-medium text-muted">FootieBitz</p>
          <p className="text-[11px] text-muted">Football shorts · 9:16 · MP4</p>
        </div>
      </footer>
    </div>
  );
}
