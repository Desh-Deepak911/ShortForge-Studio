import type { FootieScript } from "@/features/story/types";

import {
  formatMissingSceneNumbersLabel,
  resolveMediaCompleteness,
  type MediaCompletenessState,
} from "./media-completeness.utils";
import type { StorySynchronizationState } from "./story-sync.types";

export interface ExportReadinessState {
  /** All blockers clear and export fingerprint is current. */
  isReady: boolean;
  /** Story, voice, and media blockers are clear — export may proceed. */
  canExport: boolean;
  blockedReasons: string[];
  warnings: string[];
  storySynced: boolean;
  voiceSynced: boolean;
  mediaComplete: boolean;
  exportFresh: boolean;
  media: MediaCompletenessState;
}

export const EXPORT_BLOCKED_NO_SCENES_MESSAGE = "Add at least one scene to export.";
export const EXPORT_BLOCKED_NARRATION_MESSAGE =
  "Update narration before exporting.";
export const EXPORT_BLOCKED_VOICE_MESSAGE =
  "Regenerate voiceover before exporting.";

export function resolveMissingMediaBlockedMessage(
  script: FootieScript,
  media: MediaCompletenessState,
): string {
  const missingCount = media.scenesMissingMedia.length;
  const sceneLabel = formatMissingSceneNumbersLabel(script, media.scenesMissingMedia);

  if (missingCount === 1 && sceneLabel) {
    return `${sceneLabel} is missing media.`;
  }

  if (sceneLabel) {
    return `${missingCount} scenes missing media (${sceneLabel}).`;
  }

  return `${missingCount} scene${missingCount === 1 ? "" : "s"} missing media.`;
}

/**
 * Separates export readiness from story sync dirty flags.
 * `exportDirty` means the last export is stale — not that export is blocked.
 */
export function resolveExportReadiness(
  script: FootieScript,
  syncState: StorySynchronizationState,
): ExportReadinessState {
  const media = resolveMediaCompleteness(script);
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  if (!media.hasScenes) {
    blockedReasons.push(EXPORT_BLOCKED_NO_SCENES_MESSAGE);
  }

  if (syncState.narrationDirty) {
    blockedReasons.push(EXPORT_BLOCKED_NARRATION_MESSAGE);
  }

  if (syncState.voiceDirty) {
    blockedReasons.push(EXPORT_BLOCKED_VOICE_MESSAGE);
  }

  if (media.hasScenes && !media.isComplete) {
    blockedReasons.push(resolveMissingMediaBlockedMessage(script, media));
  }

  if (syncState.exportDirty) {
    warnings.push("Export is based on an older version of this story.");
  }

  if (syncState.previewDirty) {
    warnings.push("Preview may be outdated — play preview to refresh.");
  }

  const storySynced = !syncState.storyDirty && !syncState.narrationDirty;
  const voiceSynced = !syncState.voiceDirty;
  const exportFresh = !syncState.exportDirty;
  const mediaComplete = media.isComplete;
  const canExport = blockedReasons.length === 0;
  const isReady = canExport && exportFresh;

  return {
    isReady,
    canExport,
    blockedReasons,
    warnings,
    storySynced,
    voiceSynced,
    mediaComplete,
    exportFresh,
    media,
  };
}

/** Primary export gate — narration, voice, and required media must be ready. */
export function isExportReadinessBlocked(
  script: FootieScript,
  syncState: StorySynchronizationState,
): boolean {
  return !resolveExportReadiness(script, syncState).canExport;
}

/** First blocked reason for disabled export buttons and status copy. */
export function resolveExportBlockedMessage(
  script: FootieScript,
  syncState: StorySynchronizationState,
): string | undefined {
  const readiness = resolveExportReadiness(script, syncState);
  return readiness.blockedReasons[0];
}
