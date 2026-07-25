/**
 * Privacy-safe artifact-object binding field comparison classifications.
 * Never exposes locators, IDs, digests, URLs, or raw provider values.
 */

import {
  HEADLESS_MAX_ID_LENGTH,
  HEADLESS_MAX_OBJECT_KEY_LENGTH,
} from "../../domain/headless-render-constants";
import type {
  HeadlessRenderArtifactV1,
  HeadlessRenderJobRequestV1,
  HeadlessRenderJobV1,
} from "../../domain/headless-render.types";
import type { HeadlessObjectMetadata } from "../ports/storage.port";
import type { HeadlessArtifactObjectBindingV1 } from "../types/artifact-object-binding";
import { classifyStorageLocatorSchemaField } from "./validate-artifact-object-binding";

export const ARTIFACT_OBJECT_BINDING_FIELD_COMPARISON_CLASSES = Object.freeze([
  "match",
  "mismatch",
  "missing",
  "invalid",
  "not_applicable",
] as const);

export type ArtifactObjectBindingFieldComparisonClass =
  (typeof ARTIFACT_OBJECT_BINDING_FIELD_COMPARISON_CLASSES)[number];

export type ArtifactObjectBindingFieldComparisonAuthority =
  | "executed_artifact"
  | "uploaded_artifact_metadata"
  | "finalized_owned_object_metadata"
  | "succeeded_job_candidate"
  | "render_request"
  | "artifact_fingerprint_authority"
  | "request_fingerprint_authority"
  | "storage_locator_authority"
  | "owner_project_job_identity"
  | "object_revision_authority"
  | "expiry_authority"
  | "store_version_authority"
  | "attempt_authority"
  | "renderer_build_identity";

export type ArtifactObjectBindingFieldComparison = Readonly<{
  readonly field:
    | "content_digest"
    | "byte_length"
    | "mime_type"
    | "artifact_fingerprint"
    | "request_fingerprint"
    | "storage_locator"
    | "owner_identity"
    | "project_identity"
    | "job_identity"
    | "operation_identity"
    | "attempt"
    | "object_revision"
    | "expires_at_ms"
    | "store_version"
    | "renderer_build_id"
    | "finalized_stage"
    | "storage_purpose";
  readonly class: ArtifactObjectBindingFieldComparisonClass;
  readonly owningAuthority: ArtifactObjectBindingFieldComparisonAuthority;
}>;

export const ARTIFACT_OBJECT_BINDING_MISMATCH_SHAPES = Object.freeze([
  "none",
  "single_field_mismatch",
  "multiple_field_mismatch",
  "missing_field",
  "invalid_field",
] as const);

export type ArtifactObjectBindingMismatchShape =
  (typeof ARTIFACT_OBJECT_BINDING_MISMATCH_SHAPES)[number];

function cmp(
  field: ArtifactObjectBindingFieldComparison["field"],
  owningAuthority: ArtifactObjectBindingFieldComparisonAuthority,
  left: unknown,
  right: unknown,
): ArtifactObjectBindingFieldComparison {
  if (left == null || right == null) {
    return Object.freeze({
      field,
      class: left == null && right == null ? "match" : "missing",
      owningAuthority,
    });
  }
  if (typeof left !== typeof right) {
    return Object.freeze({ field, class: "invalid", owningAuthority });
  }
  return Object.freeze({
    field,
    class: left === right ? "match" : "mismatch",
    owningAuthority,
  });
}

function classifyStorageLocatorSchema(
  locator: HeadlessObjectMetadata["locator"],
): ArtifactObjectBindingFieldComparison {
  return Object.freeze({
    field: "storage_locator",
    class: classifyStorageLocatorSchemaField(locator),
    owningAuthority: "storage_locator_authority",
  });
}

export function classifyArtifactObjectBindingFieldComparisons(input: {
  readonly job: HeadlessRenderJobV1;
  readonly request: HeadlessRenderJobRequestV1;
  readonly artifact: HeadlessRenderArtifactV1;
  readonly finalized: HeadlessObjectMetadata;
  readonly binding?: HeadlessArtifactObjectBindingV1 | null;
  readonly nowMs?: number;
  readonly storeVersion?: number | null;
}): readonly ArtifactObjectBindingFieldComparison[] {
  const out: ArtifactObjectBindingFieldComparison[] = [];
  const push = (row: ArtifactObjectBindingFieldComparison) => {
    out.push(Object.freeze(row));
  };

  push(
    cmp(
      "content_digest",
      "executed_artifact",
      input.artifact.contentDigest,
      input.finalized.contentDigest,
    ),
  );
  push(
    cmp(
      "byte_length",
      "executed_artifact",
      input.artifact.byteLength,
      input.finalized.byteLength,
    ),
  );
  push(
    cmp(
      "mime_type",
      "executed_artifact",
      input.artifact.mimeType,
      input.finalized.mimeType,
    ),
  );
  push(
    cmp(
      "artifact_fingerprint",
      "artifact_fingerprint_authority",
      input.artifact.fingerprint,
      input.job.artifact?.fingerprint ?? null,
    ),
  );
  push(
    cmp(
      "request_fingerprint",
      "request_fingerprint_authority",
      input.request.requestFingerprint,
      input.job.requestFingerprint,
    ),
  );
  push(
    cmp(
      "owner_identity",
      "owner_project_job_identity",
      input.job.ownership.ownerId,
      input.finalized.ownerId,
    ),
  );
  push(
    cmp(
      "project_identity",
      "owner_project_job_identity",
      input.job.ownership.projectId,
      input.finalized.projectId,
    ),
  );
  push(
    cmp(
      "job_identity",
      "owner_project_job_identity",
      input.binding?.jobId ?? input.job.jobId,
      input.job.jobId,
    ),
  );
  push(
    cmp(
      "attempt",
      "attempt_authority",
      input.binding?.attempt ?? input.job.attempt,
      input.job.attempt,
    ),
  );
  push(
    cmp(
      "expires_at_ms",
      "expiry_authority",
      input.artifact.expiresAtMs,
      input.finalized.expiresAtMs,
    ),
  );
  push(
    cmp(
      "renderer_build_id",
      "renderer_build_identity",
      input.artifact.rendererBuildId ?? null,
      input.job.rendererBuildId ?? null,
    ),
  );
  push(
    cmp(
      "finalized_stage",
      "finalized_owned_object_metadata",
      input.finalized.finalized ? "finalized" : "not_finalized",
      "finalized",
    ),
  );
  push(
    cmp(
      "storage_purpose",
      "finalized_owned_object_metadata",
      input.finalized.purpose,
      "artifact",
    ),
  );

  push(classifyStorageLocatorSchema(input.finalized.locator));

  if (input.binding != null) {
    push(
      cmp(
        "content_digest",
        "succeeded_job_candidate",
        input.binding.contentDigest,
        input.job.artifact?.contentDigest ?? null,
      ),
    );
    push(
      cmp(
        "byte_length",
        "succeeded_job_candidate",
        input.binding.byteLength,
        input.job.artifact?.byteLength ?? null,
      ),
    );
    push(
      cmp(
        "mime_type",
        "succeeded_job_candidate",
        input.binding.mimeType,
        input.job.artifact?.mimeType ?? null,
      ),
    );
    push(
      cmp(
        "storage_locator",
        "storage_locator_authority",
        `${input.binding.storageLocator.kind}|${input.binding.storageLocator.storeId}|${input.binding.storageLocator.objectKey.length}`,
        `${input.finalized.locator.kind}|${input.finalized.locator.storeId}|${input.finalized.locator.objectKey.length}`,
      ),
    );
  }

  push({
    field: "operation_identity",
    class: "not_applicable",
    owningAuthority: "owner_project_job_identity",
  });
  push({
    field: "object_revision",
    class: "not_applicable",
    owningAuthority: "object_revision_authority",
  });

  if (input.nowMs != null) {
    push({
      field: "expires_at_ms",
      class:
        input.artifact.expiresAtMs >= input.nowMs ? "match" : "mismatch",
      owningAuthority: "expiry_authority",
    });
  }

  if (input.storeVersion != null) {
    push({
      field: "store_version",
      class: "not_applicable",
      owningAuthority: "store_version_authority",
    });
  }

  return Object.freeze(out);
}

export function firstArtifactObjectBindingFieldMismatch(
  comparisons: readonly ArtifactObjectBindingFieldComparison[],
): ArtifactObjectBindingFieldComparison | null {
  for (const row of comparisons) {
    if (
      row.class === "mismatch" ||
      row.class === "missing" ||
      row.class === "invalid"
    ) {
      return row;
    }
  }
  return null;
}

export function classifyArtifactObjectBindingMismatchShape(
  comparisons: readonly ArtifactObjectBindingFieldComparison[],
): ArtifactObjectBindingMismatchShape {
  const failures = comparisons.filter(
    (row) =>
      row.class === "mismatch" ||
      row.class === "missing" ||
      row.class === "invalid",
  );
  if (failures.length === 0) return "none";
  const hasInvalid = failures.some((row) => row.class === "invalid");
  const hasMissing = failures.some((row) => row.class === "missing");
  const hasMismatch = failures.some((row) => row.class === "mismatch");
  if (hasInvalid && !hasMissing && !hasMismatch) return "invalid_field";
  if (hasMissing && !hasMismatch && !hasInvalid) return "missing_field";
  if (failures.length === 1 && hasMismatch) return "single_field_mismatch";
  if (failures.length > 1) return "multiple_field_mismatch";
  return "single_field_mismatch";
}

/** Production-shaped canonical R2 object key length (142 chars). */
export function productionShapedArtifactObjectKeyLength(): number {
  return [
    "staging",
    "finalized",
    "artifacts",
    "artifact",
    "a".repeat(16),
    "b".repeat(16),
    "c".repeat(16),
    "d".repeat(16),
    "none",
    "0".repeat(32),
  ].join("/").length;
}

export function buildProductionShapedArtifactObjectKey(): string {
  return [
    "staging",
    "finalized",
    "artifacts",
    "artifact",
    "a".repeat(16),
    "b".repeat(16),
    "c".repeat(16),
    "d".repeat(16),
    "none",
    "0".repeat(32),
  ].join("/");
}
