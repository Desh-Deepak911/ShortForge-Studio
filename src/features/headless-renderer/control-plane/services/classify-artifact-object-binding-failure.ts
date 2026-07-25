/**
 * Safe artifact-object binding failure classification — never exposes internal messages.
 */

export const ARTIFACT_OBJECT_BINDING_FAILURE_SUBSTAGES = Object.freeze([
  "canonical_artifact_attachment",
  "binding_coherence",
  "binding_validation",
  "finalized_coherence_assertion",
  "provider_finalize",
] as const);

export type ArtifactObjectBindingFailureSubstage =
  (typeof ARTIFACT_OBJECT_BINDING_FAILURE_SUBSTAGES)[number];

const SUBSTAGE_SET = new Set<string>(ARTIFACT_OBJECT_BINDING_FAILURE_SUBSTAGES);

export function classifyArtifactObjectBindingFailureSubstage(
  message: string,
): ArtifactObjectBindingFailureSubstage {
  if (
    message.includes("Finalized") ||
    message.includes("Storage object") ||
    message.includes("Storage purpose")
  ) {
    return "finalized_coherence_assertion";
  }
  if (message.includes("Binding requires succeeded")) {
    return "canonical_artifact_attachment";
  }
  if (
    message.includes("Binding validation") ||
    message.includes("storageLocator") ||
    message.includes("Binding identity") ||
    message.includes("Binding contentDigest") ||
    message.includes("Binding byteLength") ||
    message.includes("Binding mimeType") ||
    message.includes("Binding artifactFingerprint") ||
    message.includes("Binding requestFingerprint") ||
    message.includes("Binding expiresAtMs") ||
    message.includes("Binding attempt") ||
    message.includes("Unsupported binding version")
  ) {
    return "binding_validation";
  }
  return "binding_coherence";
}

export function isArtifactObjectBindingFailureSubstage(
  value: string,
): value is ArtifactObjectBindingFailureSubstage {
  return SUBSTAGE_SET.has(value);
}
