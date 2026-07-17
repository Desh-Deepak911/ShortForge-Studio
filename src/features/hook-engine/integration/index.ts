/**
 * Hook Engine integration public surface — Sprint 7D.
 */

export type {
  HookNeutralFactProvenance,
  HookNeutralOpeningBeatAssignment,
  HookNeutralResearchEvidence,
  HookNeutralResearchFact,
} from "./neutral-research-evidence.types";

export {
  buildNeutralResearchEvidence,
  buildSemanticResearchFingerprint,
  buildSemanticFactId,
  buildManualFactId,
} from "./build-neutral-research-evidence";
export { mapNeutralEvidenceToGroundingClaims } from "./map-neutral-evidence-to-grounding";
export {
  buildHookDirective,
  buildBoundedPermittedClaimMap,
  buildBoundedPermittedClaimIds,
} from "./build-hook-directive";
export type { DirectiveClaimEntry } from "./build-hook-directive";
export {
  buildHookGenerationContext,
  type BuildHookGenerationContextInput,
  type HookAdapterTemplateContext,
  type HookGenerationContext,
} from "./build-hook-generation-context";
export {
  generateHookedNarration,
  storyScriptFromHookedNarration,
  type GenerateHookedNarrationInput,
  type GenerateHookedNarrationResult,
  type HookedNarrationModelCall,
  type HookedNarrationModelResult,
} from "./generate-hooked-narration";
export { buildCreatorFacingHookFailureMessage } from "./creator-facing-hook-error";
