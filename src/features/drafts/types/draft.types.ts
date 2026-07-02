import type { CreatorAssetPlanningSnapshot } from "@/features/editor/creator-asset-planning/creator-asset-planning.types";
import type { ProjectAudioMixerSettings } from "@/features/audio-mixer/audio-mixer.types";
import type { CaptionPresetId } from "@/features/caption-engine/caption-engine.types";
import type {
  CreatorTemplateId,
  CreatorTemplatePromptHints,
} from "@/features/creator-templates/creator-template.types";
import type { SpeechStylePreset } from "@/features/speech-style/speech-style.types";
import type {
  ExportSettings,
  FootieScene,
  FootieScript,
  StoryBackgroundMusic,
  StoryVoiceSettings,
  TimelineItem,
} from "@/features/story/types";
import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";

/** Lifecycle state for a saved story draft. */
export type DraftStatus = "draft" | "exported";

/** Dashboard workflow status derived from pipeline stage, script content, and export state. */
export type DraftWorkflowStatus = "script_review" | "voice_ready" | "storyboard_ready" | "exported";

/**
 * Staged create workflow progress. Omitted on legacy drafts that were generated
 * in one step — those are treated as editor-ready when scenes exist.
 */
export type DraftPipelineStage = "script_review" | "voiceover_ready" | "editor_ready";

/** Optional brief captured when a draft is first generated. */
export interface StoryCreationBrief {
  topic: string;
  tone: Tone;
  duration: number;
  qualityMode: QualityMode;
  sceneCount: number;
  /** Content format — omitted on legacy briefs (treated as `story`). */
  scriptMode?: ScriptMode;
  /** Optional match stats, formations, events, or extra context. */
  context?: string;
  /** User opted into API-Football enrichment at create time. */
  enableResearch?: boolean;
  /** @deprecated Use `enableResearch`. */
  footballResearch?: boolean;
  /** True when API-Football data was merged into context for script generation. */
  researchApplied?: boolean;
  /** Non-fatal research failure message when enableResearch was requested. */
  researchWarning?: string;
  /** Built-in creator template selected on /create — omitted on legacy briefs. */
  templateId?: CreatorTemplateId;
  /** Structured prompt hints from the selected template — not consumed by generation yet. */
  templatePromptHints?: CreatorTemplatePromptHints;
  /** Optional voice default suggested by the template for later editor seeding. */
  voiceId?: string;
  /** Optional speech style preset suggested by the template for later editor seeding. */
  speechStylePreset?: SpeechStylePreset;
  /** Optional caption preset suggested by the template for later editor seeding. */
  captionPreset?: CaptionPresetId;
  /** Optional audio mixer defaults suggested by the template for later editor seeding. */
  audioMixer?: ProjectAudioMixerSettings;
}

/** Voiceover audio attached to a draft. Mirrors `FootieScript` voiceover fields. */
export interface DraftVoiceover {
  url?: string;
  durationMs?: number;
  /** Persisted MP3 payload — restored to a blob URL on editor load. */
  audioBase64?: string;
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

  /** Where the user left off in the staged create workflow. */
  pipelineStage?: DraftPipelineStage;

  /** Cached Creator Asset Studio planning — survives reload when Asset Intelligence is enabled. */
  assetPlanningSnapshot?: CreatorAssetPlanningSnapshot;
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
  workflowStatus: DraftWorkflowStatus;
  workflowStatusLabel: string;
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
