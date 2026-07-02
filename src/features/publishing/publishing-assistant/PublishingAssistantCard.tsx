"use client";

import { CheckCircle2, ExternalLink, Share2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { StoryCreationBrief } from "@/features/drafts/types";
import { StudioStatus } from "@/components/studio-status";
import { resolveExportProfileId } from "@/features/export-profiles";
import {
  createAndEnqueuePublishingPackageFromExport,
  getPublishingAssistantPlatformLabel,
  PUBLISHING_ASSISTANT_PLATFORMS,
  resolveDefaultPublishingAssistantPlatforms,
  type PublishingAssistantPlatform,
} from "@/features/publishing/publishing-assistant/publishing-assistant.utils";
import type { PublishingPackage } from "@/features/publishing/publishing.types";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import type { ScriptMode } from "@/types/footiebitz";
import {
  studioFieldLabel,
  studioOptionRow,
  studioPanel,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface PublishingAssistantCardProps {
  script: FootieScript;
  exportSettings: ExportSettings;
  exportFileName: string;
  durationSec: number;
  draftId?: string;
  creationBrief?: StoryCreationBrief;
  scriptMode?: ScriptMode;
  objectUrl?: string;
}

export default function PublishingAssistantCard({
  script,
  exportSettings,
  exportFileName,
  durationSec,
  draftId,
  creationBrief,
  scriptMode,
  objectUrl,
}: PublishingAssistantCardProps) {
  const defaultPlatforms = useMemo(
    () => resolveDefaultPublishingAssistantPlatforms(exportSettings),
    [exportSettings],
  );

  const [selectedPlatforms, setSelectedPlatforms] = useState<PublishingAssistantPlatform[]>(
    () => defaultPlatforms,
  );
  const [createdPackage, setCreatedPackage] = useState<PublishingPackage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const togglePlatform = (platform: PublishingAssistantPlatform) => {
    setSelectedPlatforms((current) =>
      current.includes(platform)
        ? current.filter((entry) => entry !== platform)
        : [...current, platform],
    );
    setErrorMessage(null);
  };

  const handlePrepare = () => {
    if (!draftId) {
      setErrorMessage("Save this story as a draft before preparing a publishing package.");
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const result = createAndEnqueuePublishingPackageFromExport({
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

      setCreatedPackage(result.package);
    } catch {
      setErrorMessage("Could not create publishing package.");
    } finally {
      setIsCreating(false);
    }
  };

  const profileId = resolveExportProfileId(exportSettings);

  return (
    <div className={`${studioPanel} space-y-4`}>
      <div className="flex items-start gap-3">
        <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Prepare for publishing
            </p>
            <p className={`${studioSubtleText} mt-1 text-[11px]`}>
              Optional — create a local publishing package with metadata and manual upload
              checklists. Your download is already complete.
            </p>
          </div>

          {!createdPackage ? (
            <>
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
                <p className={studioSubtleText}>Generic export — choose the platforms you plan to upload to.</p>
              ) : null}

              <button
                type="button"
                onClick={handlePrepare}
                disabled={isCreating || selectedPlatforms.length === 0}
                className={`${studioSecondaryButton} w-full`}
              >
                {isCreating ? "Preparing package..." : "Prepare publishing package"}
              </button>
            </>
          ) : (
            <div className="space-y-3 rounded-xl bg-surface-elevated/30 p-4 ring-1 ring-border/15">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground/95">Publishing package created</p>
                  <p className={`${studioSubtleText} mt-1`}>
                    {createdPackage.platforms.length} platform
                    {createdPackage.platforms.length === 1 ? "" : "s"} ·{" "}
                    {createdPackage.exportedAsset?.fileName ?? exportFileName}
                  </p>
                </div>
              </div>

              <dl className="space-y-2 text-[11px]">
                <div>
                  <dt className={studioFieldLabel}>Hook</dt>
                  <dd className="mt-1 text-foreground/90">{createdPackage.metadata.common.hook || "—"}</dd>
                </div>
                {createdPackage.metadata.youtube.title ? (
                  <div>
                    <dt className={studioFieldLabel}>YouTube title</dt>
                    <dd className="mt-1 text-foreground/90">{createdPackage.metadata.youtube.title}</dd>
                  </div>
                ) : null}
                {createdPackage.metadata.instagram.caption ? (
                  <div>
                    <dt className={studioFieldLabel}>Instagram caption</dt>
                    <dd className="mt-1 line-clamp-3 whitespace-pre-wrap text-foreground/90">
                      {createdPackage.metadata.instagram.caption}
                    </dd>
                  </div>
                ) : null}
                {createdPackage.metadata.x.post ? (
                  <div>
                    <dt className={studioFieldLabel}>X post</dt>
                    <dd className="mt-1 line-clamp-2 text-foreground/90">{createdPackage.metadata.x.post}</dd>
                  </div>
                ) : null}
              </dl>

              <Link href="/publishing" className={`${studioPrimaryButton} w-full`}>
                <ExternalLink className="h-4 w-4" />
                Open Publishing Queue
              </Link>
            </div>
          )}

          {errorMessage ? (
            <StudioStatus variant="error" layout="inline" description={errorMessage} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
