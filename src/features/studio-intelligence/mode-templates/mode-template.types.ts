import type { SceneBlueprintCollection } from "../scene-blueprint.types";
import type { StoryStrategyId } from "../story-strategy/story-strategy.types";
import type {
  CaptionBlueprintEmphasis,
  CaptionBlueprintStyleHint,
  SceneBlueprintKind,
  SceneBlueprintRole,
  TimingBlueprintPacing,
} from "../scene-blueprint.types";
import type { VisualIntentType } from "../studio-intelligence.types";

/** Canonical mode template identifiers — aligned with story strategy ids. */
export type ModeTemplateId = StoryStrategyId;

/** One target scene slot in a mode template. */
export interface ModeTemplateSlot {
  slotId: string;
  label: string;
  preferredRole: SceneBlueprintRole;
  preferredKind?: SceneBlueprintKind;
  preferredVisualIntent?: VisualIntentType;
  timingPacing?: TimingBlueprintPacing;
  captionEmphasis?: CaptionBlueprintEmphasis;
  captionStyleHint?: CaptionBlueprintStyleHint;
}

/** Relative pacing profile for a mode template. */
export interface ModeTemplateTimingProfile {
  hookPacing: TimingBlueprintPacing;
  bodyPacing: TimingBlueprintPacing;
  climaxPacing: TimingBlueprintPacing;
  ctaPacing: TimingBlueprintPacing;
}

/** Caption styling profile for a mode template. */
export interface ModeTemplateCaptionProfile {
  hookStyle: CaptionBlueprintStyleHint;
  bodyStyle: CaptionBlueprintStyleHint;
  evidenceStyle: CaptionBlueprintStyleHint;
  closeStyle: CaptionBlueprintStyleHint;
}

/** Explicit story-structure template for a Studio Intelligence content mode. */
export interface ModeTemplate {
  templateId: ModeTemplateId;
  displayName: string;
  targetBeatSequence: readonly string[];
  targetArcSequence: readonly string[];
  targetSceneSlots: readonly ModeTemplateSlot[];
  preferredSceneRoles: readonly SceneBlueprintRole[];
  preferredVisualIntents: readonly VisualIntentType[];
  timingProfile: ModeTemplateTimingProfile;
  captionProfile: ModeTemplateCaptionProfile;
}

/** Diagnostics emitted when a mode template normalizes blueprint planning metadata. */
export interface ModeTemplateApplicationDiagnostics {
  modeTemplateApplied: boolean;
  modeTemplateId: ModeTemplateId;
  templateSlotsMatched: number;
  templateFallbacks: string[];
}

/** Result of applying a mode template to a blueprint collection. */
export interface ModeTemplateApplicationResult {
  collection: SceneBlueprintCollection;
  diagnostics: ModeTemplateApplicationDiagnostics;
}
