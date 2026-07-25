/**
 * Sprint 11B.1A — Explicit public API authority classification.
 *
 * Every root-exported helper is one of:
 * - canonical_validator: runtime-validates unknown input; returns detached canonical authority
 * - validated_builder: builds only via full runtime validation; discriminated Result
 * - fingerprint_utility: pure non-authoritative digest/fingerprint helper (never establishes job/artifact authority alone)
 * - pure_utility: diagnostics, constants, coverage extractors, transition legality (non-authoritative)
 *
 * No export may attach a fingerprint to typed caller data and treat it as authoritative.
 */

export type HeadlessPublicApiClass =
  | "canonical_validator"
  | "validated_builder"
  | "fingerprint_utility"
  | "pure_utility";

/**
 * Authoritative / builder / utility classification for domain barrel exports
 * that are functions establishing or assisting Headless contracts.
 */
export const HEADLESS_PUBLIC_API_CLASSIFICATION = Object.freeze({
  // Canonical validators / assertions
  validateHeadlessAssetBundle: "canonical_validator",
  validateHeadlessRenderJobRequest: "canonical_validator",
  validateHeadlessRenderJob: "canonical_validator",
  validateHeadlessRenderArtifact: "canonical_validator",
  validateHeadlessRenderJobCoherence: "canonical_validator",
  validateHeadlessArtifactRequestCoherence: "canonical_validator",

  // Validated builders (Result — never fingerprint-only authority)
  finalizeHeadlessAssetBundle: "validated_builder",
  finalizeHeadlessRenderJobRequest: "validated_builder",
  finalizeHeadlessRenderArtifact: "validated_builder",
  createAcceptedHeadlessRenderJob: "validated_builder",
  applyHeadlessJobTransition: "validated_builder",

  // Pure fingerprint utilities (non-authoritative alone)
  buildHeadlessAssetBundleFingerprint: "fingerprint_utility",
  buildHeadlessManifestPayloadDigest: "fingerprint_utility",
  buildHeadlessRenderJobRequestFingerprint: "fingerprint_utility",
  buildHeadlessRenderJobFingerprint: "fingerprint_utility",
  buildHeadlessArtifactMetadataFingerprint: "fingerprint_utility",
  buildHeadlessIdempotencyAuthorityKey: "fingerprint_utility",
  buildHeadlessAuthorityFingerprint: "fingerprint_utility",
  buildHeadlessSourceDigest: "fingerprint_utility",
  headlessSourceDigest: "fingerprint_utility",
  headlessSha256Hex: "fingerprint_utility",
  headlessSha256OfCanonical: "fingerprint_utility",
  headlessCanonicalEncode: "fingerprint_utility",
  headlessStableStringify: "fingerprint_utility",
  isHeadlessAuthorityFingerprint: "fingerprint_utility",
  assertHeadlessFingerprintKind: "fingerprint_utility",
  verifyHeadlessAssetBundleFingerprintCoherence: "fingerprint_utility",

  // Pure non-authority utilities
  classifyHeadlessSource: "pure_utility",
  extractRequiredHeadlessSourceSlots: "pure_utility",
  headlessSourceSlotKey: "pure_utility",
  parseHeadlessSourceSlotKey: "pure_utility",
  isCanonicalHeadlessSourceSlotKey: "pure_utility",
  headlessMediaItemDedupeKey: "pure_utility",
  isLegalHeadlessJobTransition: "pure_utility",
  resolveHeadlessJobTransition: "pure_utility",
  deepFreezeHeadlessValue: "pure_utility",
  sanitizeDiagnosticMessage: "pure_utility",
  headlessIssue: "pure_utility",
  headlessRequestsSemanticallyEqual: "pure_utility",
  isHeadlessReasonId: "pure_utility",
  isHeadlessTerminalState: "pure_utility",
  isHeadlessActiveState: "pure_utility",
} as const satisfies Record<string, HeadlessPublicApiClass>);

/** Names that must never appear as public authority shortcuts. */
export const HEADLESS_FORBIDDEN_PUBLIC_EXPORTS = Object.freeze([
  "attachHeadlessFingerprint",
  "approveHeadlessJob",
  "markHeadlessValid",
  "trustTypedRequest",
  "buildJobWithoutValidation",
  "unsafeFinalizeHeadless",
] as const);
