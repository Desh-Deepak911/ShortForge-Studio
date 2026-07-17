import type { RefObject } from "react";

import type { CreatorTemplateId } from "@/features/creator-templates";
import type { HookStyleSelection } from "@/features/hook-engine/presentation";
import type { StoryStrategySelection } from "@/features/retention-story/presentation";
import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";

export const CREATE_BRIEF_FORM_ID = "create-brief-form";

export const BRIEF_TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: "dramatic", label: "Dramatic", description: "High stakes, cinematic" },
  { value: "funny", label: "Funny", description: "Witty and banter-led" },
  { value: "tactical", label: "Tactical", description: "Insight and analysis" },
  { value: "news", label: "News", description: "Headline-style recap" },
  { value: "emotional", label: "Emotional", description: "Passion and feeling" },
];

export const BRIEF_DURATION_OPTIONS = [25, 30, 35, 45, 60] as const;

export type BriefFactHandlingMode = "verified_facts_only" | "creative_premise";

export const BRIEF_FACT_HANDLING_OPTIONS: {
  value: BriefFactHandlingMode;
  label: string;
  description: string;
}[] = [
  {
    value: "verified_facts_only",
    label: "Verified facts only",
    description: "Use research-backed facts; unsupported details stay out",
  },
  {
    value: "creative_premise",
    label: "Creative premise",
    description: "Use your supplied story-world facts for this narration",
  },
];

export const BRIEF_QUALITY_OPTIONS: { value: QualityMode; label: string; description: string }[] = [
  { value: "cheap", label: "Fast", description: "Quickest first pass" },
  { value: "balanced", label: "Balanced", description: "Good balance of speed and polish" },
  { value: "best", label: "Studio", description: "Highest polish" },
];

export type BriefReliabilityMode = "flexible" | "precise";

export const BRIEF_RELIABILITY_OPTIONS: {
  value: BriefReliabilityMode;
  label: string;
  description: string;
}[] = [
  {
    value: "flexible",
    label: "Flexible (recommended)",
    description:
      "Best-effort draft with safe adaptations and warnings. Quality misses still return a story.",
  },
  {
    value: "precise",
    label: "Precise",
    description:
      "Prefer exact Hook/opening and strict structure. Unmet requirements get an explanation instead of silent Auto changes.",
  },
];

export interface BriefCanvasProps {
  topic: string;
  onTopicChange: (value: string) => void;
  topicInputRef: RefObject<HTMLTextAreaElement | null>;
  scriptMode: ScriptMode;
  onScriptModeChange: (mode: ScriptMode) => void;
  context: string;
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  storyStrategy: StoryStrategySelection;
  onStoryStrategyChange: (selection: StoryStrategySelection) => void;
  storyStrategyCompatibilityNotice: string | null;
  hookStyle: HookStyleSelection;
  onHookStyleChange: (selection: HookStyleSelection) => void;
  userAuthoredHook: string;
  onUserAuthoredHookChange: (value: string) => void;
  selectedTemplateId: CreatorTemplateId | "";
  onTemplateChange: (templateId: CreatorTemplateId | "") => void;
  sceneCount: number;
  enableResearch: boolean;
  factHandlingMode: BriefFactHandlingMode;
  onFactHandlingModeChange: (mode: BriefFactHandlingMode) => void;
  premiseDetails: string;
  onPremiseDetailsChange: (value: string) => void;
  reliabilityMode: BriefReliabilityMode;
  onReliabilityModeChange: (mode: BriefReliabilityMode) => void;
  hookStyleCompatibilityNotice: string | null;
  sampleTopics: readonly string[];
  loading: boolean;
  error: string | null;
  onClearError: () => void;
  onSubmit: () => void;
  onUseAutoHook?: () => void;
}
