"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { StudioConfirmDialog } from "@/components/studio-overlay";
import { StudioStatus } from "@/components/studio-status";
import { formatPublishingPackageStatus, formatPublishingPlatformStatus, getCopyAssets } from "@/features/publishing";
import PublishingPlatformCopySection from "@/features/publishing/components/PublishingPlatformCopySection";
import {
  clearPublishingPackageSchedule,
  getPublishingPackage,
  getPublishingPackages,
  removePublishingPackage,
  savePublishingPackageSchedule,
  updatePlatformStatus,
} from "@/features/publishing/queue";
import PublishingScheduleEditor from "@/features/publishing/queue/components/PublishingScheduleEditor";
import type { PublishingPackage, PublishingPlatform } from "@/features/publishing/publishing.types";
import {
  buildDailyPublishingSchedule,
  buildPublishingScheduleFromLocalInput,
  formatPublishingSchedule,
  getPublishingScheduleState,
  scheduleStateChipClass,
  sortPublishingPackagesBySchedule,
  type LocalScheduleInput,
} from "@/features/publishing/publishing-schedule.utils";
import {
  studioChip,
  studioGhostButton,
  studioPanel,
  studioSecondaryButton,
  studioSectionDesc,
  studioSectionTitle,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const PLATFORM_LABELS: Record<PublishingPlatform, string> = {
  generic: "Generic MP4",
  youtube_shorts: "YouTube Shorts",
  instagram_reels: "Instagram Reels",
  x_video: "X Video",
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusChipClass(status: PublishingPackage["status"]): string {
  switch (status) {
    case "published":
      return `${studioChip} bg-emerald-500/10 text-emerald-300/90 ring-emerald-500/20`;
    case "partially_published":
      return `${studioChip} bg-sky-500/10 text-sky-300/90 ring-sky-500/20`;
    case "exported":
    case "ready":
      return `${studioChip} bg-accent-soft/80 text-accent ring-accent/20`;
    default:
      return studioChip;
  }
}

interface PublishingQueuePanelProps {
  className?: string;
}

export default function PublishingQueuePanel({ className = "" }: PublishingQueuePanelProps) {
  const [packages, setPackages] = useState<PublishingPackage[]>(() => getPublishingPackages());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PublishingPackage | null>(null);

  const sortedPackages = useMemo(() => sortPublishingPackagesBySchedule(packages), [packages]);

  const refresh = useCallback(() => {
    setPackages(getPublishingPackages());
  }, []);

  const confirmRemove = () => {
    if (!pendingRemove) {
      return;
    }

    removePublishingPackage(pendingRemove.id);
    if (expandedId === pendingRemove.id) {
      setExpandedId(null);
    }
    setPendingRemove(null);
    refresh();
  };

  const handleMarkPublished = (pkg: PublishingPackage, platform: PublishingPlatform) => {
    updatePlatformStatus(pkg.id, platform, "published");
    refresh();
    const latest = getPublishingPackage(pkg.id);
    if (latest) {
      setExpandedId(latest.id);
    }
  };

  const handleSaveSchedule = (pkg: PublishingPackage, input: LocalScheduleInput) => {
    const schedule = buildPublishingScheduleFromLocalInput(input);
    if (!schedule) {
      return;
    }

    savePublishingPackageSchedule(pkg.id, schedule);
    refresh();
  };

  const handleClearSchedule = (pkg: PublishingPackage) => {
    clearPublishingPackageSchedule(pkg.id);
    refresh();
  };

  const handleDailyPreset = (pkg: PublishingPackage) => {
    savePublishingPackageSchedule(pkg.id, buildDailyPublishingSchedule({ hour: 22, minute: 0 }));
    refresh();
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div>
        <h1 className={studioSectionTitle}>Publishing queue</h1>
        <p className={studioSectionDesc}>
          Track manual uploads after export. Reminders are planning-only — FootieBitz does not post
          automatically or notify you when the app is closed.
        </p>
      </div>

      {sortedPackages.length === 0 ? (
        <StudioStatus
          variant="empty"
          layout="centered"
          title="No publishing packages yet"
          description="Export a story, then add it to the queue to track copy-and-upload steps per platform."
          className={`${studioPanel} max-w-none py-8`}
        />
      ) : (
        <ul className="space-y-3">
          {sortedPackages.map((pkg) => {
            const expanded = expandedId === pkg.id;
            const scheduleLabel = formatPublishingSchedule(pkg);
            const scheduleState = getPublishingScheduleState(pkg);

            return (
              <li key={pkg.id} className={`${studioPanel} p-4 sm:p-5`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground/95">{pkg.storyTitle}</p>
                    <p className={`${studioSubtleText} mt-1`}>
                      Updated {formatTimestamp(pkg.updatedAt)}
                      {pkg.exportedAsset?.fileName ? ` · ${pkg.exportedAsset.fileName}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={statusChipClass(pkg.status)}>
                        {formatPublishingPackageStatus(pkg.status)}
                      </span>
                      {scheduleState.state !== "unscheduled" ? (
                        <span className={`${studioChip} ${scheduleStateChipClass(scheduleState.state)}`}>
                          {scheduleState.label}
                        </span>
                      ) : null}
                      {scheduleLabel ? (
                        <span className={studioChip}>{scheduleLabel}</span>
                      ) : null}
                      {pkg.platforms.map((platform) => {
                        const platformStatus = pkg.platformStatuses.find(
                          (entry) => entry.platform === platform,
                        )?.status;

                        return (
                          <span key={platform} className={studioChip}>
                            {PLATFORM_LABELS[platform]} · {formatPublishingPlatformStatus(platformStatus)}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className={studioSecondaryButton}
                      onClick={() => setExpandedId(expanded ? null : pkg.id)}
                    >
                      {expanded ? "Hide details" : "View details"}
                    </button>
                    <button
                      type="button"
                      className={studioGhostButton}
                      aria-label={`Remove ${pkg.storyTitle}`}
                      onClick={() => setPendingRemove(pkg)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-5 space-y-4 border-t border-border/20 pt-5">
                    <PublishingScheduleEditor
                      key={`${pkg.id}-${pkg.schedule?.scheduledForIso ?? "none"}-${pkg.updatedAt}`}
                      pkg={pkg}
                      onSave={(input) => handleSaveSchedule(pkg, input)}
                      onClear={() => handleClearSchedule(pkg)}
                      onApplyDailyPreset={() => handleDailyPreset(pkg)}
                    />

                    {pkg.platforms.map((platform) => {
                      const copyBundle = getCopyAssets(pkg, platform);
                      const platformStatus = pkg.platformStatuses.find(
                        (entry) => entry.platform === platform,
                      )?.status;

                      return (
                        <PublishingPlatformCopySection
                          key={platform}
                          platformLabel={PLATFORM_LABELS[platform]}
                          copyAssets={copyBundle.assets}
                          platformStatus={platformStatus}
                          onMarkPublished={() => handleMarkPublished(pkg, platform)}
                          emptyMessage="No copy metadata yet for this platform."
                        />
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <StudioConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
          }
        }}
        title="Remove from queue?"
        description={
          pendingRemove
            ? `Remove "${pendingRemove.storyTitle}" from the publishing queue? This cannot be undone.`
            : ""
        }
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemove}
      />
    </div>
  );
}
