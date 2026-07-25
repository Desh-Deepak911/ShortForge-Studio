/**
 * Frozen safe bootstrap rejection taxonomy — page contract ↔ worker attribution.
 * Never carries manifest payloads, fingerprints, locators, or console text.
 */

export const HEADLESS_PAGE_BOOTSTRAP_REJECTION_REASON_IDS = Object.freeze([
  "manifest_invalid",
  "bundle_invalid",
  "bundle_fingerprint_mismatch",
  "slot_claim_mismatch",
  "asset_reference_missing",
  "asset_reference_incoherent",
  "unsupported_schema",
  "unsupported_profile",
  "renderer_build_mismatch",
  "bootstrap_runtime_exception",
  "unknown_rejected",
] as const);

export type HeadlessPageBootstrapRejectionReasonId =
  (typeof HEADLESS_PAGE_BOOTSTRAP_REJECTION_REASON_IDS)[number];

const REASON_SET = new Set<string>(HEADLESS_PAGE_BOOTSTRAP_REJECTION_REASON_IDS);

export function isHeadlessPageBootstrapRejectionReasonId(
  value: unknown,
): value is HeadlessPageBootstrapRejectionReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function mapExportManifestIssueCodeToBootstrapRejection(
  code: string,
): HeadlessPageBootstrapRejectionReasonId {
  switch (code) {
    case "INVALID_MANIFEST":
    case "INVALID_MANIFEST_FINGERPRINT":
    case "MANIFEST_FINGERPRINT_MISMATCH":
    case "UNSUPPORTED_MANIFEST_VERSION":
      return "manifest_invalid";
    case "UNSUPPORTED_RENDERER_CONTRACT":
      return "renderer_build_mismatch";
    case "UNSUPPORTED_SCHEMA":
      return "unsupported_schema";
    default:
      if (code.includes("FINGERPRINT")) return "manifest_invalid";
      return "manifest_invalid";
  }
}

export function mapBootstrapInternalFailureToRejectionReason(input: {
  readonly invalidTarget?: boolean;
  readonly contractVersionMismatch?: boolean;
  readonly mediaPreloadFailed?: boolean;
  readonly manifestIssueCode?: string;
}): HeadlessPageBootstrapRejectionReasonId {
  if (input.contractVersionMismatch) return "renderer_build_mismatch";
  if (input.invalidTarget) return "unsupported_profile";
  if (input.manifestIssueCode != null) {
    return mapExportManifestIssueCodeToBootstrapRejection(input.manifestIssueCode);
  }
  if (input.mediaPreloadFailed) return "asset_reference_incoherent";
  return "bootstrap_runtime_exception";
}
