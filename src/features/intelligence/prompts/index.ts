export type { BuiltPrompt, PromptBuildRequest } from "./types";

export type {
  NarrativeBeat,
  NarrativeOpeningIntent,
  NarrativeOpeningIntentKind,
  NarrativePlan,
  NarrativeStructure,
} from "./narrative-plan.types";

export {
  buildNarrativePlan,
  resolveNarrativeOpeningIntent,
  type BuildNarrativePlanInput,
} from "./build-narrative-plan";

export {
  resolveEvidenceLedSurprisePreference,
  hasEvidenceLedSurprisePreference,
  normalizeEvidenceLedSurprisePreference,
  type EvidenceLedSurprisePreferenceKind,
  type ResolveEvidenceLedSurprisePreferenceInput,
} from "./resolve-evidence-led-surprise-preference";

export {
  buildPromptIntelligence,
  type BuildPromptIntelligenceInput,
} from "./build-prompt-intelligence";

export {
  promptIntelligenceToPromptText,
  type PromptIntelligenceToPromptTextInput,
} from "./prompt-intelligence-to-prompt";

export {
  buildStoryStructurePromptLines,
  buildStoryStructureStyleRules,
  resolveStoryStructureForMode,
  STORY_STRUCTURE_NARRATION_RULES,
  type StoryStructureArc,
  type StoryStructureBeatTemplate,
  type StoryStructureDefinition,
} from "./story-structure-intelligence.utils";

export {
  buildPromptIntelligenceDevSummary,
  formatPromptIntelligenceDevSummaryForDev,
  type PromptIntelligenceDevBeatSummary,
  type PromptIntelligenceDevSummary,
} from "./prompt-intelligence-dev.utils";

export {
  comparePromptIntelligenceForDev,
  type PromptIntelligenceBeatSummary,
  type PromptIntelligenceComparisonDevResult,
  type PromptIntelligenceRankingPreservation,
  type PromptIntelligenceRecommendedSource,
} from "./prompt-intelligence-comparison.dev.utils";

export type {
  PromptSection,
  PromptSectionEmphasis,
  PromptSectionKind,
} from "./prompt-section.types";

export type {
  FactBeatAssignment,
  FactSectionAssignment,
  FactUsagePlan,
  PromptGroundingRule,
  PromptLengthRule,
  PromptStyleRule,
} from "./prompt-plan.types";

export type {
  PromptIntelligenceDiagnostics,
  PromptIntelligenceResult,
} from "./prompt-intelligence.types";
