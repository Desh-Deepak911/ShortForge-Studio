import type {
  ExportSettings,
  FootieScene,
  FootieScript,
  StoryBackgroundMusic,
  StoryVoiceSettings,
  TimelineItem,
} from "@/features/story/types";
import type { QualityMode, Tone } from "@/types/footiebitz";

/** Lifecycle state for a saved story draft. */
export type DraftStatus = "draft" | "exported";

/** Optional brief captured when a draft is first generated. */
export interface StoryCreationBrief {
  topic: string;
  tone: Tone;
  duration: number;
  qualityMode: QualityMode;
  sceneCount: number;
}

/** Voiceover audio attached to a draft. Mirrors `FootieScript` voiceover fields. */
export interface DraftVoiceover {
  url?: string;
  durationMs?: number;
}

/**
 * Full editable story draft.
 *
 * `script` is the canonical editor payload (`FootieScript`). Top-level editor slices
 * (`scenes`, `timelineItems`, `voiceSettings`, `voiceover`, `exportSettings`,
 * `backgroundMusic`) are denormalized views kept in sync via `normalizeDraft`.
 */
export interface Draft {
  id: string;
  title: string;
  /** Original generation prompt / brief topic. */
  prompt?: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;

  /** Full editable story — source of truth for the editor. */
  script: FootieScript;

  /** Denormalized editor slices — mirrored from `script` on normalize. */
  scenes: FootieScene[];
  timelineItems?: TimelineItem[];
  voiceSettings?: StoryVoiceSettings;
  voiceover?: DraftVoiceover;
  exportSettings?: ExportSettings;
  backgroundMusic?: StoryBackgroundMusic;

  /** Dashboard helpers derived from `script`. */
  sceneCount: number;
  totalDuration: number;
  hasVoiceover: boolean;

  /** Full generation brief captured at create time. Preserved alongside `prompt`. */
  creationBrief?: StoryCreationBrief;
}

/** @deprecated Prefer `Draft`. Kept for backward compatibility. */
export type StoryDraft = Draft;

/** Lightweight draft row for dashboards and lists. */
export interface StoryDraftSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sceneCount: number;
  totalDuration: number;
  hasVoiceover: boolean;
  status: DraftStatus;
  prompt?: string;
}

export interface DraftStoreV1 {
  version: 1;
  /** Stored records may omit newer denormalized fields — coerced on read when needed. */
  drafts: StoryDraft[];
}

export interface DraftEditorSlices {
  scenes: FootieScene[];
  timelineItems?: TimelineItem[];
  voiceSettings?: StoryVoiceSettings;
  voiceover?: DraftVoiceover;
  exportSettings?: ExportSettings;
  backgroundMusic?: StoryBackgroundMusic;
}
