/**
 * Explicit synchronization state between Story, Narration, Voiceover, Preview, and Export.
 * Foundation only — no runtime wiring in 4.0A-1.
 */

/** Versioned sync flags for story pipeline surfaces. */
export interface StorySynchronizationState {
  storyVersion: number;
  narrationVersion: number;
  voiceVersion: number;
  previewVersion: number;
  exportVersion: number;

  storyDirty: boolean;
  narrationDirty: boolean;
  voiceDirty: boolean;
  previewDirty: boolean;
  exportDirty: boolean;

  lastNarrationGeneratedAt: string | null;
  lastVoiceGeneratedAt: string | null;
  lastExportAt: string | null;
  lastPreviewAt: string | null;
}

/**
 * Edit / lifecycle events that drive dirty-flag policy.
 * Pure classification — does not perform narration or voice generation.
 */
export type StorySyncEditKind =
  | "caption"
  | "spoken_text"
  | "motion"
  | "image"
  | "transition"
  | "duration"
  | "structural"
  | "narration"
  | "voice_generated"
  | "export_success"
  | "preview_refreshed";

/** Human-readable sync status for future UI (not rendered in 4.0A-1). */
export type StorySynchronizationStatus =
  | "Synced"
  | "Needs narration update"
  | "Needs voice regeneration"
  | "Needs preview refresh"
  | "Needs export";

export interface StorySynchronizationSummary {
  status: StorySynchronizationStatus;
  statuses: StorySynchronizationStatus[];
  state: StorySynchronizationState;
}
