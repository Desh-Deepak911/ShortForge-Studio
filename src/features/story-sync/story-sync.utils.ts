import { isCaptionModeSwitchStoryPatch, isMsBackfillOnlyStoryPatch } from "@/features/editor/story-patches/story-patch-classifier";
import type { FootieScript } from "@/features/story/types";

import { createInitialStorySynchronizationState } from "./story-sync.state";
import type {
  StorySyncEditKind,
  StorySynchronizationState,
  StorySynchronizationStatus,
  StorySynchronizationSummary,
} from "./story-sync.types";

function withState(
  state: StorySynchronizationState,
  patch: Partial<StorySynchronizationState>,
): StorySynchronizationState {
  return { ...state, ...patch };
}

function nowIso(at?: string | null): string {
  return at ?? new Date().toISOString();
}

// --- Dirty markers ---

export function markStoryDirty(state: StorySynchronizationState): StorySynchronizationState {
  return withState(state, { storyDirty: true });
}

export function markNarrationDirty(state: StorySynchronizationState): StorySynchronizationState {
  return withState(state, { narrationDirty: true });
}

export function markVoiceDirty(state: StorySynchronizationState): StorySynchronizationState {
  return withState(state, { voiceDirty: true });
}

export function markPreviewDirty(state: StorySynchronizationState): StorySynchronizationState {
  return withState(state, { previewDirty: true });
}

export function markExportDirty(state: StorySynchronizationState): StorySynchronizationState {
  return withState(state, { exportDirty: true });
}

// --- Synchronized markers ---

export function markStorySynchronized(
  state: StorySynchronizationState,
): StorySynchronizationState {
  return withState(state, { storyDirty: false });
}

export function markNarrationSynchronized(
  state: StorySynchronizationState,
  at?: string | null,
): StorySynchronizationState {
  return withState(state, {
    narrationDirty: false,
    lastNarrationGeneratedAt: nowIso(at),
  });
}

export function markVoiceSynchronized(
  state: StorySynchronizationState,
  at?: string | null,
): StorySynchronizationState {
  return withState(state, {
    voiceDirty: false,
    lastVoiceGeneratedAt: nowIso(at),
  });
}

export function markPreviewSynchronized(
  state: StorySynchronizationState,
  at?: string | null,
): StorySynchronizationState {
  return withState(state, {
    previewDirty: false,
    lastPreviewAt: nowIso(at),
  });
}

export function markExportSynchronized(
  state: StorySynchronizationState,
  at?: string | null,
): StorySynchronizationState {
  return withState(state, {
    exportDirty: false,
    lastExportAt: nowIso(at),
  });
}

// --- Version advances ---

export function advanceStoryVersion(state: StorySynchronizationState): StorySynchronizationState {
  return withState(state, { storyVersion: state.storyVersion + 1 });
}

export function advanceNarrationVersion(
  state: StorySynchronizationState,
): StorySynchronizationState {
  return withState(state, { narrationVersion: state.narrationVersion + 1 });
}

export function advanceVoiceVersion(state: StorySynchronizationState): StorySynchronizationState {
  return withState(state, { voiceVersion: state.voiceVersion + 1 });
}

export function advancePreviewVersion(
  state: StorySynchronizationState,
): StorySynchronizationState {
  return withState(state, { previewVersion: state.previewVersion + 1 });
}

export function advanceExportVersion(state: StorySynchronizationState): StorySynchronizationState {
  return withState(state, { exportVersion: state.exportVersion + 1 });
}

/**
 * Applies dirty-flag policy for a story edit / lifecycle event.
 * Pure — does not regenerate narration, voice, preview, or export.
 *
 * Dirty rules:
 * - visual caption / motion / image → no dirty flags
 * - narrated subtitle (subtitleText) → narration, voice, preview, export dirty
 * - transition timing → preview + export dirty
 * - duration / structural → story, narration, voice, preview, export dirty (+ story version)
 * - narration edit → voice, preview, export dirty; narration becomes synchronized
 * - voice generation → voice + preview clean; export stays dirty until export
 * - export success → export clean
 * - preview refreshed → preview clean
 */
export function applyStorySyncEdit(
  state: StorySynchronizationState,
  kind: StorySyncEditKind,
  at?: string | null,
): StorySynchronizationState {
  switch (kind) {
    case "caption":
    case "motion":
    case "image":
      return state;

    case "caption_layout":
      return markExportDirty(state);

    case "spoken_text": {
      let next = markNarrationDirty(state);
      next = markVoiceDirty(next);
      next = markPreviewDirty(next);
      next = markExportDirty(next);
      return next;
    }

    case "transition":
      return markExportDirty(markPreviewDirty(state));

    case "duration":
    case "structural": {
      let next = advanceStoryVersion(state);
      next = markStoryDirty(next);
      next = markNarrationDirty(next);
      next = markVoiceDirty(next);
      next = markPreviewDirty(next);
      next = markExportDirty(next);
      return next;
    }

    case "narration": {
      let next = advanceNarrationVersion(state);
      next = markNarrationSynchronized(next, at);
      next = markStorySynchronized(next);
      next = markVoiceDirty(next);
      next = markPreviewDirty(next);
      next = markExportDirty(next);
      return next;
    }

    case "voice_generated": {
      let next = advanceVoiceVersion(state);
      next = markVoiceSynchronized(next, at);
      next = markPreviewSynchronized(next, at);
      return next;
    }

    case "export_success": {
      let next = advanceExportVersion(state);
      next = markExportSynchronized(next, at);
      return next;
    }

    case "preview_refreshed": {
      let next = advancePreviewVersion(state);
      next = markPreviewSynchronized(next, at);
      return next;
    }

    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Priority summary for future UI.
 * Highest-priority outstanding work wins as `status`.
 */
export function getSynchronizationSummary(
  state: StorySynchronizationState,
): StorySynchronizationSummary {
  const statuses: StorySynchronizationStatus[] = [];

  if (state.narrationDirty) {
    statuses.push("Needs narration update");
  }
  if (state.voiceDirty) {
    statuses.push("Needs voice regeneration");
  }
  if (state.previewDirty) {
    statuses.push("Needs preview refresh");
  }
  if (state.exportDirty) {
    statuses.push("Needs export");
  }

  if (statuses.length === 0 && !state.storyDirty) {
    return {
      status: "Synced",
      statuses: ["Synced"],
      state,
    };
  }

  // Story-only dirty without narration/voice still implies narration may need review.
  if (state.storyDirty && statuses.length === 0) {
    statuses.push("Needs narration update");
  }

  const status = statuses[0] ?? "Synced";

  return {
    status,
    statuses: statuses.length > 0 ? statuses : ["Synced"],
    state,
  };
}

/** Convenience: start from a clean synchronized baseline. */
export function createSynchronizedStoryState(
  partial?: Partial<StorySynchronizationState>,
): StorySynchronizationState {
  return createInitialStorySynchronizationState(partial);
}

/**
 * Maps a classified story patch to a sync edit kind.
 * Returns null when the edit does not affect synchronization state.
 */
export function resolveStorySyncEditKind(
  prev: FootieScript,
  next: FootieScript,
  classification: {
    classes: Array<
      | "structural"
      | "timing"
      | "spoken_text"
      | "caption"
      | "caption_layout"
      | "media"
      | "motion"
      | "transition"
      | "audio"
      | "metadata"
    >;
  },
): StorySyncEditKind | null {
  const voiceAttached =
    Boolean(next.voiceoverUrl) &&
    (prev.voiceoverUrl !== next.voiceoverUrl ||
      prev.voiceoverDurationMs !== next.voiceoverDurationMs);

  if (voiceAttached) {
    return "voice_generated";
  }

  if (isCaptionModeSwitchStoryPatch(prev, next)) {
    return "caption";
  }

  if (classification.classes.includes("structural")) {
    return "structural";
  }

  if (classification.classes.includes("timing") && !isMsBackfillOnlyStoryPatch(prev, next)) {
    return "duration";
  }

  if (prev.narration !== next.narration) {
    return "narration";
  }

  if (classification.classes.includes("spoken_text")) {
    return "spoken_text";
  }

  if (classification.classes.includes("caption_layout")) {
    return "caption_layout";
  }

  if (classification.classes.includes("transition")) {
    return "transition";
  }

  if (classification.classes.includes("caption")) {
    return "caption";
  }

  if (classification.classes.includes("motion")) {
    return "motion";
  }

  if (classification.classes.includes("media")) {
    return "image";
  }

  return null;
}

/**
 * Maps a presentation-only edit to sync policy without diff heuristics.
 * Presentation commits must never dirty narration or voice.
 */
export function resolvePresentationSyncEditKind(
  classification: {
    classes: Array<
      | "structural"
      | "timing"
      | "spoken_text"
      | "caption"
      | "caption_layout"
      | "media"
      | "motion"
      | "transition"
      | "audio"
      | "metadata"
    >;
  },
): StorySyncEditKind | null {
  if (classification.classes.includes("caption_layout")) {
    return "caption_layout";
  }

  if (
    classification.classes.includes("caption") ||
    classification.classes.includes("motion")
  ) {
    return "caption";
  }

  return "caption";
}

export type StorySyncBannerKind = "narration" | "voice" | "export";

export const STORY_SYNC_EXPORT_BLOCKED_MESSAGE =
  "Narration or voiceover is out of sync. Update narration and regenerate voiceover before exporting.";

export function isStorySyncExportBlocked(state: StorySynchronizationState): boolean {
  return state.narrationDirty || state.voiceDirty;
}

export interface StorySyncBannerModel {
  kind: StorySyncBannerKind;
  title: string;
  description?: string;
  primaryLabel: string;
  secondaryLabel: string;
  tone: "warning" | "info";
}

/** Highest-priority banner for the current sync state (one banner only). */
export function resolveStorySyncBanner(
  state: StorySynchronizationState,
): StorySyncBannerModel | null {
  if (state.narrationDirty) {
    if (state.storyDirty) {
      return {
        kind: "narration",
        title: "Story changed after narration generation.",
        description: "Update narration.",
        primaryLabel: "Update narration",
        secondaryLabel: "Dismiss",
        tone: "warning",
      };
    }

    return {
      kind: "narration",
      title: "Narrated subtitles changed.",
      description: "Update narration before exporting.",
      primaryLabel: "Update narration",
      secondaryLabel: "Dismiss",
      tone: "warning",
    };
  }

  if (state.voiceDirty) {
    return {
      kind: "voice",
      title: "Voiceover is outdated.",
      description: "Regenerate voice before exporting.",
      primaryLabel: "Generate voice",
      secondaryLabel: "Later",
      tone: "warning",
    };
  }

  if (state.exportDirty) {
    return {
      kind: "export",
      title: "Export is based on an older version of this story.",
      primaryLabel: "Export updated video",
      secondaryLabel: "Dismiss",
      tone: "info",
    };
  }

  return null;
}

export type StorySyncStepTone = "success" | "warning" | "neutral";

export interface StorySyncStepModel {
  id: "story" | "narration" | "voice" | "preview" | "export";
  label: string;
  statusLabel: string;
  tone: StorySyncStepTone;
}

/** Informational rows for the synchronization status card. */
export function resolveStorySyncSteps(
  state: StorySynchronizationState,
): StorySyncStepModel[] {
  return [
    {
      id: "story",
      label: "Story",
      statusLabel: state.storyDirty ? "Needs update" : "Synced",
      tone: state.storyDirty ? "warning" : "success",
    },
    {
      id: "narration",
      label: "Narration",
      statusLabel: state.narrationDirty ? "Needs update" : "Synced",
      tone: state.narrationDirty ? "warning" : "success",
    },
    {
      id: "voice",
      label: "Voice",
      statusLabel: state.voiceDirty ? "Needs regeneration" : "Synced",
      tone: state.voiceDirty ? "warning" : "success",
    },
    {
      id: "preview",
      label: "Preview",
      statusLabel: state.previewDirty ? "Needs refresh" : "Ready",
      tone: state.previewDirty ? "warning" : "success",
    },
    {
      id: "export",
      label: "Export",
      statusLabel: state.exportDirty ? "Needs export" : "Synced",
      tone: state.exportDirty ? "warning" : "success",
    },
  ];
}

export function getStorySyncDirtySignature(state: StorySynchronizationState): string {
  return [
    state.storyDirty ? "1" : "0",
    state.narrationDirty ? "1" : "0",
    state.voiceDirty ? "1" : "0",
    state.previewDirty ? "1" : "0",
    state.exportDirty ? "1" : "0",
    state.storyVersion,
    state.narrationVersion,
    state.voiceVersion,
    state.exportVersion,
  ].join(":");
}
