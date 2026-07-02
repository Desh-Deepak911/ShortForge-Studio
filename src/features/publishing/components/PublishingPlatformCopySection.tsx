"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import CopyButton from "@/components/ui/CopyButton";
import type { PublishingCopyAsset, PublishingPlatformStatus } from "@/features/publishing/publishing.types";
import { studioSecondaryButton, studioSubtleText } from "@/lib/utils/studioUi";

export interface PublishingPlatformCopySectionProps {
  platformLabel: string;
  copyAssets: PublishingCopyAsset[];
  platformStatus?: PublishingPlatformStatus;
  onMarkPublished?: () => void;
  openPlatformHref?: string;
  openPlatformLabel?: string;
  emptyMessage?: string;
  headerActions?: ReactNode;
}

/**
 * Shared platform metadata copy block — used in Publishing Modal and Publishing Queue.
 */
export default function PublishingPlatformCopySection({
  platformLabel,
  copyAssets,
  platformStatus,
  onMarkPublished,
  openPlatformHref,
  openPlatformLabel,
  emptyMessage = "No copy metadata for this platform.",
  headerActions,
}: PublishingPlatformCopySectionProps) {
  const isPublished = platformStatus === "published";

  return (
    <section className="space-y-3 rounded-xl bg-surface-elevated/40 p-4 ring-1 ring-border/15">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-foreground/90">{platformLabel}</p>
        <div className="flex flex-wrap gap-2">
          {headerActions}
          {openPlatformHref && openPlatformLabel ? (
            <a
              href={openPlatformHref}
              target="_blank"
              rel="noopener noreferrer"
              className={studioSecondaryButton}
            >
              <ExternalLink className="h-4 w-4" />
              {openPlatformLabel}
            </a>
          ) : null}
          {onMarkPublished ? (
            <button
              type="button"
              className={studioSecondaryButton}
              disabled={isPublished}
              onClick={onMarkPublished}
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark published
            </button>
          ) : null}
        </div>
      </div>

      {copyAssets.length === 0 ? (
        <p className={studioSubtleText}>{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">
          {copyAssets.map((asset) => (
            <li
              key={asset.id}
              className="flex flex-col gap-2 rounded-lg border border-border/15 p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{asset.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{asset.value}</p>
              </div>
              <CopyButton text={asset.value} label={`Copy ${asset.label}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
