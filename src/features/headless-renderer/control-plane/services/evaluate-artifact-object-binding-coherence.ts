/**
 * Structured, privacy-safe artifact-object binding coherence evaluation.
 * Produces field comparisons before any aggregate failure is returned.
 */

import type {
  HeadlessRenderArtifactV1,
  HeadlessRenderJobRequestV1,
  HeadlessRenderJobV1,
} from "../../domain/headless-render.types";
import type { HeadlessObjectMetadata } from "../ports/storage.port";
import type { HeadlessArtifactObjectBindingV1 } from "../types/artifact-object-binding";
import {
  classifyArtifactObjectBindingFailureSubstage,
  type ArtifactObjectBindingFailureSubstage,
} from "./classify-artifact-object-binding-failure";
import {
  classifyArtifactObjectBindingFieldComparisons,
  classifyArtifactObjectBindingMismatchShape,
  firstArtifactObjectBindingFieldMismatch,
  type ArtifactObjectBindingFieldComparison,
  type ArtifactObjectBindingMismatchShape,
} from "./classify-artifact-object-binding-field-comparisons";
import {
  assertArtifactObjectBindingCoherence,
  validateHeadlessArtifactObjectBinding,
} from "./validate-artifact-object-binding";
import { HEADLESS_ARTIFACT_OBJECT_BINDING_VERSION } from "../types/artifact-object-binding";

export type ArtifactObjectBindingCoherenceEvaluation =
  | {
      readonly ok: true;
      readonly binding: HeadlessArtifactObjectBindingV1;
      readonly comparisons: readonly ArtifactObjectBindingFieldComparison[];
      readonly failureSubstage: "canonical_artifact_attachment";
      readonly mismatchShape: "none";
    }
  | {
      readonly ok: false;
      readonly message: string;
      readonly comparisons: readonly ArtifactObjectBindingFieldComparison[];
      readonly failureSubstage: ArtifactObjectBindingFailureSubstage;
      readonly mismatchShape: ArtifactObjectBindingMismatchShape;
      readonly firstMismatch: ArtifactObjectBindingFieldComparison | null;
    };

function buildBindingDraft(input: {
  readonly job: HeadlessRenderJobV1;
  readonly request: HeadlessRenderJobRequestV1;
  readonly artifact: HeadlessRenderArtifactV1;
  readonly finalized: HeadlessObjectMetadata;
}): Record<string, unknown> {
  return {
    version: HEADLESS_ARTIFACT_OBJECT_BINDING_VERSION,
    jobId: input.job.jobId,
    attempt: input.job.attempt,
    ownerId: input.job.ownership.ownerId,
    projectId: input.job.ownership.projectId,
    storageLocator: {
      kind: input.finalized.locator.kind,
      storeId: input.finalized.locator.storeId,
      objectKey: input.finalized.locator.objectKey,
    },
    contentDigest: input.artifact.contentDigest,
    byteLength: input.artifact.byteLength,
    mimeType: input.artifact.mimeType,
    artifactFingerprint: input.artifact.fingerprint,
    requestFingerprint: input.request.requestFingerprint,
    expiresAtMs: input.artifact.expiresAtMs,
  };
}

export function evaluateArtifactObjectBindingCoherence(input: {
  readonly job: HeadlessRenderJobV1;
  readonly request: HeadlessRenderJobRequestV1;
  readonly artifact: HeadlessRenderArtifactV1;
  readonly finalized: HeadlessObjectMetadata;
  readonly nowMs?: number;
  readonly storeVersion?: number | null;
}): ArtifactObjectBindingCoherenceEvaluation {
  const draft = buildBindingDraft(input);
  const validated = validateHeadlessArtifactObjectBinding(draft);
  const binding = validated.ok ? validated.binding : null;
  const comparisons = classifyArtifactObjectBindingFieldComparisons({
    job: input.job,
    request: input.request,
    artifact: input.artifact,
    finalized: input.finalized,
    binding,
    nowMs: input.nowMs,
    storeVersion: input.storeVersion,
  });
  const firstMismatch = firstArtifactObjectBindingFieldMismatch(comparisons);
  const mismatchShape = classifyArtifactObjectBindingMismatchShape(comparisons);

  if (!validated.ok) {
    return Object.freeze({
      ok: false as const,
      message: validated.message,
      comparisons,
      failureSubstage: classifyArtifactObjectBindingFailureSubstage(
        validated.message,
      ),
      mismatchShape,
      firstMismatch,
    });
  }

  const coherent = assertArtifactObjectBindingCoherence({
    binding: validated.binding,
    job: input.job,
    request: input.request,
    artifact: input.artifact,
    finalized: input.finalized,
    nowMs: input.nowMs,
  });
  if (!coherent.ok) {
    return Object.freeze({
      ok: false as const,
      message: coherent.message,
      comparisons,
      failureSubstage: classifyArtifactObjectBindingFailureSubstage(
        coherent.message,
      ),
      mismatchShape,
      firstMismatch,
    });
  }

  return Object.freeze({
    ok: true as const,
    binding: validated.binding,
    comparisons,
    failureSubstage: "canonical_artifact_attachment" as const,
    mismatchShape: "none" as const,
  });
}
