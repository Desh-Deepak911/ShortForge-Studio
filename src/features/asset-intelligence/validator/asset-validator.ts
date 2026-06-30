import { evaluateAllAssetValidationRules } from "./asset-validator.rules";
import type { AssetValidationResult, AssetValidatorInput } from "./asset-validator.types";
import { ASSET_VALIDATOR_VERSION } from "./asset-validator.types";
import {
  buildRepairCandidates,
  buildRepairSuggestions,
  buildValidatorContext,
  buildValidatorDiagnostics,
  cloneAssetValidatorInput,
  collectValidationWarnings,
  computeEntityCoverageScore,
  computeProviderQualityScore,
  computeRecommendationQualityScore,
  computeValidationScore,
  computeVisualDiversityScore,
} from "./asset-validator.utils";

/** Validates asset intelligence recommendations and provider planning output. */
export function validateAssetRecommendations(input: AssetValidatorInput): AssetValidationResult {
  const clonedInput = cloneAssetValidatorInput(input);
  const context = buildValidatorContext(clonedInput);
  const ruleResults = evaluateAllAssetValidationRules(clonedInput, context);
  const repairSuggestions = buildRepairSuggestions(clonedInput, ruleResults);
  const repairCandidates = buildRepairCandidates(clonedInput, ruleResults);

  const entityCoverageScore = computeEntityCoverageScore(clonedInput);
  const providerCoverageScore = clonedInput.providerPlan.diagnostics.providerCoverage;
  const visualDiversityScore = computeVisualDiversityScore(clonedInput);
  const recommendationQualityScore = computeRecommendationQualityScore(ruleResults, clonedInput);
  const providerQualityScore = computeProviderQualityScore(ruleResults, clonedInput);

  return {
    validatorVersion: ASSET_VALIDATOR_VERSION,
    validationScore: computeValidationScore(ruleResults),
    entityCoverageScore,
    providerCoverageScore,
    visualDiversityScore,
    recommendationQualityScore,
    providerQualityScore,
    warnings: collectValidationWarnings(ruleResults),
    repairSuggestions,
    repairCandidates,
    ruleResults,
    diagnostics: buildValidatorDiagnostics(ruleResults, repairSuggestions),
    validatedAt: new Date().toISOString(),
  };
}

/** Returns whether planning output meets the minimum validation threshold. */
export function isAssetRecommendationValid(
  input: AssetValidatorInput,
  threshold = 0.75,
): boolean {
  return validateAssetRecommendations(input).validationScore >= threshold;
}

/** Creates an empty validation result for missing planning output. */
export function createEmptyAssetValidationResult(): AssetValidationResult {
  return {
    validatorVersion: ASSET_VALIDATOR_VERSION,
    validationScore: 0,
    entityCoverageScore: 0,
    providerCoverageScore: 0,
    visualDiversityScore: 0,
    recommendationQualityScore: 0,
    providerQualityScore: 0,
    warnings: ["No asset planning output to validate."],
    repairSuggestions: [],
    repairCandidates: [],
    ruleResults: [],
    diagnostics: {
      validatorVersion: ASSET_VALIDATOR_VERSION,
      validationRulesExecuted: [],
      warningsByType: {},
      repairSuggestionCount: 0,
    },
    validatedAt: new Date(0).toISOString(),
  };
}

export function snapshotAssetValidatorInput(input: AssetValidatorInput): string {
  return JSON.stringify(input);
}
