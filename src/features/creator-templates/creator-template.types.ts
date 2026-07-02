import type { ProjectAudioMixerSettings } from "@/features/audio-mixer/audio-mixer.types";
import type { CaptionPresetId } from "@/features/caption-engine/caption-engine.types";
import type { SpeechStylePreset } from "@/features/speech-style/speech-style.types";
import type { ScriptMode } from "@/types/footiebitz";

/** Built-in creator template identifiers. */
export type CreatorTemplateId =
  | "educational_bullet_points"
  | "football_match_preview"
  | "player_analysis"
  | "top_10_countdown"
  | "history_explained"
  | "transfer_news"
  | "tactical_breakdown"
  | "documentary"
  | "myth_vs_reality";

/** High-level grouping for template discovery and filtering. */
export type CreatorTemplateCategory =
  | "educational"
  | "match_day"
  | "analysis"
  | "list"
  | "history"
  | "news"
  | "tactical"
  | "documentary"
  | "debate";

/** Optional story-level defaults a template can suggest during create/editor seeding. */
export interface CreatorTemplateDefaults {
  scriptMode: ScriptMode;
  sceneCount: number;
  targetDurationSec: number;
  voiceId?: string;
  speechStylePreset?: SpeechStylePreset;
  captionPreset?: CaptionPresetId;
  audioMixer?: ProjectAudioMixerSettings;
}

/** Prompt Intelligence hints — metadata only until wired in a later phase. */
export interface CreatorTemplatePromptHints {
  tone: string;
  structure: string;
  openingStyle: string;
  pacing: string;
  ctaStyle: string;
  avoid?: string;
}

/** Music mood metadata for future background-music suggestions. */
export interface CreatorTemplateMusicProfile {
  mood: string;
  energy: "low" | "medium" | "high";
  tempo: "slow" | "moderate" | "fast";
  recommendedUse: string[];
}

/** Visual and asset styling guidance for future Studio/Asset Intelligence alignment. */
export interface CreatorTemplateStyleProfile {
  visualStyle: string;
  assetStyle: string;
  captionStyle: string;
  musicMood?: CreatorTemplateMusicProfile;
}

/** Immutable creator-facing template definition. */
export interface CreatorTemplate {
  id: CreatorTemplateId;
  title: string;
  description: string;
  category: CreatorTemplateCategory;
  recommendedFor: string[];
  defaults: CreatorTemplateDefaults;
  promptHints: CreatorTemplatePromptHints;
  styleProfile: CreatorTemplateStyleProfile;
}

/** Safe, fully normalized defaults after registry resolution. */
export interface ResolvedCreatorTemplateDefaults {
  scriptMode: ScriptMode;
  sceneCount: number;
  targetDurationSec: number;
  voiceId?: string;
  speechStylePreset?: SpeechStylePreset;
  captionPreset?: CaptionPresetId;
  audioMixer?: ProjectAudioMixerSettings;
}
