export {
  ASSET_VALIDATOR_VERSION,
  type AssetRepairCandidate,
  type AssetRepairSuggestion,
  type AssetValidationResult,
  type AssetValidationRuleId,
  type AssetValidationRuleResult,
  type AssetValidationWarningType,
  type AssetValidatorContext,
  type AssetValidatorDiagnostics,
  type AssetValidatorInput,
} from "./asset-validator.types";

export {
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
  hasImportantUnusedEntities,
} from "./asset-validator.utils";

export { evaluateAllAssetValidationRules } from "./asset-validator.rules";

export {
  createEmptyAssetValidationResult,
  isAssetRecommendationValid,
  snapshotAssetValidatorInput,
  validateAssetRecommendations,
} from "./asset-validator";
