/**
 * Maps durable storage finalize failures to safe finalize substages for boundary
 * telemetry. Upload completion and finalize failure must remain distinct so
 * terminal cleanup never masks a Neon finalize rejection as an upload fault.
 */

import type { HeadlessControlPlaneErrorCode } from "../../control-plane/types/control-plane.types";
import type { ArtifactFinalizeSubstageClass } from "./provider-backed-boundary-telemetry";

const FINALIZE_SUBSTAGE_BY_CODE: Readonly<
  Partial<Record<HeadlessControlPlaneErrorCode, ArtifactFinalizeSubstageClass>>
> = Object.freeze({
  MANIFEST_NOT_FOUND: "binding_validation",
  OBJECT_OWNERSHIP_MISMATCH: "binding_validation",
  MANIFEST_DIGEST_MISMATCH: "binding_validation",
  OBJECT_INTEGRITY_FAILED: "finalized_coherence_assertion",
  ASSET_DIGEST_MISMATCH: "finalized_coherence_assertion",
  ASSET_LENGTH_MISMATCH: "finalized_coherence_assertion",
  ASSET_MIME_MISMATCH: "finalized_coherence_assertion",
  STALE_TRANSITION: "provider_finalize",
  CLAIM_REJECTED: "provider_finalize",
  TERMINAL_IMMUTABLE: "finalized_coherence_assertion",
  JOB_NOT_FOUND: "binding_validation",
  INTERNAL_ERROR: "provider_finalize",
  DATABASE_UNAVAILABLE: "provider_finalize",
});

/**
 * Classifies a finalizeUploadedObject control-plane failure without exposing
 * provider payloads, object keys, or ownership identifiers.
 */
export function classifyStorageFinalizeFailureSubstage(
  code: unknown,
): ArtifactFinalizeSubstageClass {
  if (typeof code === "string" && code in FINALIZE_SUBSTAGE_BY_CODE) {
    return FINALIZE_SUBSTAGE_BY_CODE[code as HeadlessControlPlaneErrorCode]!;
  }
  return "provider_finalize";
}
