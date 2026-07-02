"use client";

import { PenLine, Plus, Sparkles } from "lucide-react";
import Link from "next/link";

import { StudioHeader, StudioHeaderBar } from "@/components/studio-shell";
import { PRODUCT_NAME } from "@/lib/constants/product-brand";
import {
  studioBadge,
  studioIconBox,
  studioNavPrimaryButton,
  studioNavExportButton,
} from "@/lib/utils/studioUi";

import { CREATE_BRIEF_FORM_ID } from "./create-brief.constants";

export interface CreateStudioHeaderProps {
  loading: boolean;
  /** When topic is empty, focuses the brief input; otherwise submits the brief form. */
  onWriteStory: () => void;
  hasTopic: boolean;
}

/**
 * Create route header — brand, workflow stage, drafts link, single Write Story CTA.
 */
export default function CreateStudioHeader({
  loading,
  onWriteStory,
  hasTopic,
}: CreateStudioHeaderProps) {
  return (
    <StudioHeader>
      <StudioHeaderBar>
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <div
            className={`${studioIconBox} h-8 w-8 shrink-0 sm:h-9 sm:w-9 shadow-[0_0_20px_rgba(91,140,255,0.1)]`}
          >
            <PenLine className="h-3.5 w-3.5 text-accent sm:h-4 sm:w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="truncate text-[13px] font-semibold tracking-tight text-foreground sm:text-sm">
              {PRODUCT_NAME}
            </p>
            <p className="text-[11px] text-muted">Creator platform for football shorts</p>
          </div>
        </Link>

        <span className={`${studioBadge} hidden shrink-0 sm:inline-flex`}>Brief</span>

        <div className="min-w-0 flex-1" aria-hidden />

        <Link href="/drafts" className={`${studioNavExportButton} hidden sm:inline-flex`}>
          Drafts
        </Link>

        {hasTopic ? (
          <button
            type="submit"
            form={CREATE_BRIEF_FORM_ID}
            disabled={loading}
            className={studioNavPrimaryButton}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">{loading ? "Creating story…" : "Write Story"}</span>
            <span className="sm:hidden">{loading ? "…" : "Write"}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={onWriteStory}
            className={studioNavPrimaryButton}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Write Story</span>
            <span className="sm:hidden">Write</span>
          </button>
        )}
      </StudioHeaderBar>
    </StudioHeader>
  );
}
