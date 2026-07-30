/**
 * Privacy-safe aggregate cleanup metrics.
 *
 * Emits counts and bounded size/age classes only. Validation fails closed when
 * private identifiers or storage locators appear in serialized metrics payloads.
 * Privacy validation is fail closed.
 */

export type HeadlessExportCleanupMetricsV1 = {
  readonly version: 1;
  readonly storedArtifactCount: number;
  readonly estimatedStoredArtifactBytesClass:
    | "unknown"
    | "small"
    | "medium"
    | "large";
  readonly expiredArtifactCount: number;
  readonly cleanupAttempts: number;
  readonly cleanupSuccesses: number;
  readonly cleanupFailures: number;
  readonly cleanupRetryBacklog: number;
  readonly oldestPendingCleanupAgeClass:
    | "none"
    | "minutes"
    | "hours"
    | "days";
  readonly orphanCandidateCount: number;
  readonly rejectedUnsafeDeletionAttempts: number;
  readonly projectSourceDeletionAttempts: number;
};

const METRICS_PRIVATE_KEY_PATTERN =
  /(?:objectKey|object_key|url|credential|ownerId|jobId|projectId|bucket|secret|password|token|presign|downloadUrl|putUrl|getUrl|filename|DATABASE_URL)/i;

/**
 * Builds a versioned metrics snapshot from aggregate counters supplied by
 * maintenance and terminal cleanup paths.
 */
export function buildHeadlessExportCleanupMetrics(input: {
  readonly cleanupAttempts: number;
  readonly cleanupSuccesses: number;
  readonly cleanupFailures: number;
  readonly retryBacklog: number;
  readonly rejectedUnsafeDeletions: number;
  readonly projectSourceDeletionAttempts: number;
  readonly expiredArtifactCount: number;
  readonly orphanCandidates: number;
  readonly storedArtifactCount: number;
  readonly estimatedStoredArtifactBytesClass:
    | "unknown"
    | "small"
    | "medium"
    | "large";
  readonly oldestPendingCleanupAgeClass:
    | "none"
    | "minutes"
    | "hours"
    | "days";
}): HeadlessExportCleanupMetricsV1 {
  return Object.freeze({
    version: 1 as const,
    storedArtifactCount: Math.max(0, Math.floor(input.storedArtifactCount)),
    estimatedStoredArtifactBytesClass: input.estimatedStoredArtifactBytesClass,
    expiredArtifactCount: Math.max(0, Math.floor(input.expiredArtifactCount)),
    cleanupAttempts: Math.max(0, Math.floor(input.cleanupAttempts)),
    cleanupSuccesses: Math.max(0, Math.floor(input.cleanupSuccesses)),
    cleanupFailures: Math.max(0, Math.floor(input.cleanupFailures)),
    cleanupRetryBacklog: Math.max(0, Math.floor(input.retryBacklog)),
    oldestPendingCleanupAgeClass: input.oldestPendingCleanupAgeClass,
    orphanCandidateCount: Math.max(0, Math.floor(input.orphanCandidates)),
    rejectedUnsafeDeletionAttempts: Math.max(
      0,
      Math.floor(input.rejectedUnsafeDeletions),
    ),
    projectSourceDeletionAttempts: Math.max(
      0,
      Math.floor(input.projectSourceDeletionAttempts),
    ),
  });
}

/**
 * Validates that a metrics object contains only privacy-safe aggregate fields.
 */
export function validateHeadlessExportCleanupMetricsPrivacy(
  value: unknown,
): value is HeadlessExportCleanupMetricsV1 {
  if (typeof value !== "object" || value == null) return false;
  const serialized = JSON.stringify(value);
  if (METRICS_PRIVATE_KEY_PATTERN.test(serialized)) {
    return false;
  }
  const record = value as HeadlessExportCleanupMetricsV1;
  return record.version === 1 && typeof record.cleanupAttempts === "number";
}
