"use client";

import { ExternalLink, Share2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { StoryCreationBrief } from "@/features/drafts/types";
import { resolveExportProfileId } from "@/features/export-profiles";
import {
  getCopyAssets,
  formatPublishingPlatformStatus,
} from "@/features/publishing";
import PublishingPlatformCopySection from "@/features/publishing/components/PublishingPlatformCopySection";
import { StudioStatus } from "@/components/studio-status";
import StudioOverlay from "@/components/studio-overlay/StudioOverlay";
import {
  addPublishingPackage,
  updatePlatformStatus as persistPlatformStatus,
  updatePublishingPackage,
} from "@/features/publishing/queue";
import { updatePlatformStatus as applyPlatformStatusToPackage } from "@/features/publishing/publishing-package.utils";
import type { PublishingPackage, PublishingPlatform } from "@/features/publishing/publishing.types";
import {
  createPublishingPackageFromExport,
  getPublishingAssistantPlatformLabel,
  getPublishingAssistantPlatformOpenLabel,
  getPublishingAssistantPlatformUrl,
  PUBLISHING_ASSISTANT_PLATFORMS,
  resolveDefaultPublishingAssistantPlatforms,
  type PublishingAssistantPlatform,
} from "@/features/publishing/publishing-assistant/publishing-assistant.utils";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import type { ScriptMode } from "@/types/footiebitz";
import {
  studioChip,
  studioFieldLabel,
  studioOptionRow,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface PublishingAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: FootieScript;
  exportSettings: ExportSettings;
  exportFileName: string;
  durationSec: number;
  draftId?: string;
  creationBrief?: StoryCreationBrief;
  scriptMode?: ScriptMode;
  objectUrl?: string;
}

export default function PublishingAssistantModal({
  open,
  onOpenChange,
  script,
  exportSettings,
  exportFileName,
  durationSec,
  draftId,
  creationBrief,
  scriptMode,
  objectUrl,
}: PublishingAssistantModalProps) {
  const defaultPlatforms = useMemo(
    () => resolveDefaultPublishingAssistantPlatforms(exportSettings),
    [exportSettings],
  );

  const [selectedPlatforms, setSelectedPlatforms] = useState<PublishingAssistantPlatform[]>(
    () => defaultPlatforms,
  );
  const [activePlatform, setActivePlatform] = useState<PublishingAssistantPlatform | null>(
    () => defaultPlatforms[0] ?? null,
  );
  const [workingPackage, setWorkingPackage] = useState<PublishingPackage | null>(null);
  const [savedToQueue, setSavedToQueue] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const togglePlatform = (platform: PublishingAssistantPlatform) => {
    setSelectedPlatforms((current) => {
      const next = current.includes(platform)
        ? current.filter((entry) => entry !== platform)
        : [...current, platform];
      if (!next.includes(activePlatform as PublishingAssistantPlatform)) {
        setActivePlatform(next[0] ?? null);
      }
      return next;
    });
    setErrorMessage(null);
  };

  const handleGenerate = () => {
    if (!draftId) {
      setErrorMessage("Save this story as a draft before publishing.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const result = createPublishingPackageFromExport({
        draftId,
        script,
        exportSettings,
        exportFileName,
        durationSec,
        selectedPlatforms,
        creationBrief,
        scriptMode,
        objectUrl,
      });

      if (!result.ok || !result.package) {
        setErrorMessage(result.error ?? "Could not create publishing package.");
        return;
      }

      setWorkingPackage(result.package);
      setActivePlatform((result.package.platforms[0] as PublishingAssistantPlatform) ?? null);
    } catch {
      setErrorMessage("Could not create publishing package.");
    } finally {
      setIsGenerating(false);
    }
  };

  const persistPackage = (pkg: PublishingPackage): boolean => {
    const result = savedToQueue
      ? updatePublishingPackage(pkg)
      : addPublishingPackage(pkg);

    if (!result.ok) {
      setErrorMessage(result.error ?? "Could not save to publishing queue.");
      return false;
    }

    setSavedToQueue(true);
    if (result.package) {
      setWorkingPackage(result.package);
    }
    return true;
  };

  const handleMarkPublished = (platform: PublishingPlatform) => {
    if (!workingPackage) {
      return;
    }

    const next = applyPlatformStatusToPackage(workingPackage, platform, "published");
    setWorkingPackage(next);

    if (savedToQueue) {
      const persisted = persistPlatformStatus(next.id, platform, "published");
      if (persisted) {
        setWorkingPackage(persisted);
      }
    }
  };

  const handleSaveToQueue = () => {
    if (!workingPackage) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    persistPackage(workingPackage);
    setIsSaving(false);
  };

  const profileId = resolveExportProfileId(exportSettings);
  const activeCopyBundle =
    workingPackage && activePlatform ? getCopyAssets(workingPackage, activePlatform) : null;
  const activePlatformStatus = workingPackage?.platformStatuses.find(
    (entry) => entry.platform === activePlatform,
  )?.status;

  return (
    <StudioOverlay
      open={open}
      onOpenChange={onOpenChange}
      variant="modal-center"
      title="Manual publishing assistant"
      description="Auto-posting is coming later. Copy metadata, open each platform, and upload manually."
      titleId="publishing-assistant-title"
      closeLabel="Close publishing assistant"
      headerIcon={<Share2 className="h-4 w-4" strokeWidth={1.75} />}
      keepMounted={false}
      footer={
        workingPackage ? (
          <>
            <button
              type="button"
              onClick={handleSaveToQueue}
              disabled={isSaving || savedToQueue}
              className={`${studioSecondaryButton} w-full sm:flex-1`}
            >
              {savedToQueue ? "Saved to queue" : isSaving ? "Saving..." : "Save to queue"}
            </button>
            <Link href="/publishing" className={`${studioSecondaryButton} w-full sm:flex-1`}>
              <ExternalLink className="h-4 w-4" />
              Open Publishing Queue
            </Link>
          </>
        ) : undefined
      }
    >
      {!workingPackage ? (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className={`${studioFieldLabel} mb-1`}>Platforms</legend>
            {PUBLISHING_ASSISTANT_PLATFORMS.map((platform) => (
              <label key={platform} className={studioOptionRow(selectedPlatforms.includes(platform))}>
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                  className="mt-0.5 accent-accent"
                />
                <span className="text-sm text-foreground/90">
                  {getPublishingAssistantPlatformLabel(platform)}
                </span>
              </label>
            ))}
          </fieldset>

          {profileId === "generic_mp4" ? (
            <p className={studioSubtleText}>
              Generic export — choose the platforms you plan to upload to.
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || selectedPlatforms.length === 0}
            className={`${studioPrimaryButton} w-full`}
          >
            {isGenerating ? "Preparing metadata..." : "Start manual publishing"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {workingPackage.platforms.map((platform) => {
              const status = workingPackage.platformStatuses.find(
                (entry) => entry.platform === platform,
              )?.status;

              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setActivePlatform(platform as PublishingAssistantPlatform)}
                  className={`${studioChip} ${
                    activePlatform === platform ? "ring-accent/40 bg-accent-soft/60" : ""
                  }`}
                >
                  {getPublishingAssistantPlatformLabel(platform as PublishingAssistantPlatform)} ·{" "}
                  {formatPublishingPlatformStatus(status)}
                </button>
              );
            })}
          </div>

          {activePlatform && activeCopyBundle ? (
            <PublishingPlatformCopySection
              platformLabel={getPublishingAssistantPlatformLabel(activePlatform)}
              copyAssets={activeCopyBundle.assets}
              platformStatus={activePlatformStatus}
              onMarkPublished={() => handleMarkPublished(activePlatform)}
              openPlatformHref={getPublishingAssistantPlatformUrl(activePlatform)}
              openPlatformLabel={getPublishingAssistantPlatformOpenLabel(activePlatform)}
            />
          ) : null}
        </div>
      )}

      {errorMessage ? (
        <StudioStatus variant="error" layout="inline" description={errorMessage} className="mt-3" />
      ) : null}
    </StudioOverlay>
  );
}
