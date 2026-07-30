/**
 * Privacy-safe aggregate maintenance health metrics.
 *
 * Emits bounded age/count classes only. Validation fails closed when private
 * identifiers or storage locators appear in serialized payloads.
 */

export type HeadlessMaintenanceAgeClass = "none" | "minutes" | "hours" | "days";

export type HeadlessMaintenanceFailureCountClass =
  | "none"
  | "single"
  | "few"
  | "many";

export type HeadlessMaintenanceBacklogCountClass =
  | "none"
  | "small"
  | "medium"
  | "large";

export type HeadlessMaintenanceHealthMetricsV1 = {
  readonly version: 1;
  readonly lastSuccessfulMaintenanceAgeClass: HeadlessMaintenanceAgeClass;
  readonly lastFailedMaintenanceAgeClass: HeadlessMaintenanceAgeClass;
  readonly consecutiveFailureCountClass: HeadlessMaintenanceFailureCountClass;
  readonly cleanupBacklogCountClass: HeadlessMaintenanceBacklogCountClass;
  readonly oldestPendingCleanupAgeClass: HeadlessMaintenanceAgeClass;
  readonly leaseContentionCount: number;
  readonly providerDeletionSuccessCount: number;
  readonly providerDeletionFailureCount: number;
  readonly unsafeDeletionRejectionCount: number;
  readonly projectSourceDeletionAttemptCount: number;
};

const METRICS_PRIVATE_KEY_PATTERN =
  /(?:objectKey|object_key|url|credential|ownerId|jobId|projectId|bucket|secret|password|token|presign|downloadUrl|putUrl|getUrl|filename|DATABASE_URL)/i;

export function classifyMaintenanceFailureCount(
  count: number,
): HeadlessMaintenanceFailureCountClass {
  if (count <= 0) return "none";
  if (count === 1) return "single";
  if (count <= 3) return "few";
  return "many";
}

export function classifyMaintenanceBacklogCount(
  count: number,
): HeadlessMaintenanceBacklogCountClass {
  if (count <= 0) return "none";
  if (count <= 10) return "small";
  if (count <= 50) return "medium";
  return "large";
}

export function classifyMaintenanceAgeClass(input: {
  readonly timestampMs: number | null | undefined;
  readonly nowMs: number;
}): HeadlessMaintenanceAgeClass {
  if (input.timestampMs == null || input.timestampMs <= 0) {
    return "none";
  }
  const ageMs = Math.max(0, input.nowMs - input.timestampMs);
  if (ageMs < 60 * 60_000) return "minutes";
  if (ageMs < 24 * 60 * 60_000) return "hours";
  return "days";
}

export function buildHeadlessMaintenanceHealthMetrics(input: {
  readonly nowMs: number;
  readonly lastSuccessAtMs: number | null;
  readonly lastFailureAtMs: number | null;
  readonly consecutiveFailureCount: number;
  readonly cleanupBacklogCount: number;
  readonly oldestPendingCleanupAgeClass: HeadlessMaintenanceAgeClass;
  readonly leaseContentionCount: number;
  readonly providerDeletionSuccessCount: number;
  readonly providerDeletionFailureCount: number;
  readonly unsafeDeletionRejectionCount: number;
  readonly projectSourceDeletionAttemptCount: number;
}): HeadlessMaintenanceHealthMetricsV1 {
  return Object.freeze({
    version: 1 as const,
    lastSuccessfulMaintenanceAgeClass: classifyMaintenanceAgeClass({
      timestampMs: input.lastSuccessAtMs,
      nowMs: input.nowMs,
    }),
    lastFailedMaintenanceAgeClass: classifyMaintenanceAgeClass({
      timestampMs: input.lastFailureAtMs,
      nowMs: input.nowMs,
    }),
    consecutiveFailureCountClass: classifyMaintenanceFailureCount(
      input.consecutiveFailureCount,
    ),
    cleanupBacklogCountClass: classifyMaintenanceBacklogCount(
      input.cleanupBacklogCount,
    ),
    oldestPendingCleanupAgeClass: input.oldestPendingCleanupAgeClass,
    leaseContentionCount: Math.max(0, Math.floor(input.leaseContentionCount)),
    providerDeletionSuccessCount: Math.max(
      0,
      Math.floor(input.providerDeletionSuccessCount),
    ),
    providerDeletionFailureCount: Math.max(
      0,
      Math.floor(input.providerDeletionFailureCount),
    ),
    unsafeDeletionRejectionCount: Math.max(
      0,
      Math.floor(input.unsafeDeletionRejectionCount),
    ),
    projectSourceDeletionAttemptCount: Math.max(
      0,
      Math.floor(input.projectSourceDeletionAttemptCount),
    ),
  });
}

export function validateHeadlessMaintenanceHealthMetricsPrivacy(
  value: unknown,
): value is HeadlessMaintenanceHealthMetricsV1 {
  if (typeof value !== "object" || value == null) return false;
  const serialized = JSON.stringify(value);
  if (METRICS_PRIVATE_KEY_PATTERN.test(serialized)) {
    return false;
  }
  const record = value as HeadlessMaintenanceHealthMetricsV1;
  return record.version === 1 && typeof record.leaseContentionCount === "number";
}
