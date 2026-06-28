/** @deprecated Legacy FootballResearchContext context adapters — test/legacy only. Do not use in production path. */
export {
  assembleResearchContextFromBundle,
  type AssembledResearchContext,
  type AssembleResearchContextInput,
} from "../assemble-research-context";
export {
  executeCanonicalResearchPlan,
  type CanonicalResearchExecutionResult,
  type ExecuteCanonicalResearchPlanOptions,
} from "../execute-canonical-research.server";
export { canonicalResearchBundleToFootballContext } from "../canonical-research-bundle.adapter";
export { bundleToResearchContextText } from "../bundle-to-context-text";
export {
  buildPromptSectionsFromBundle,
  renderAssembledPromptSections,
} from "../build-prompt-sections";
export { assembledContextToPromptText } from "../assembled-context-to-prompt";
