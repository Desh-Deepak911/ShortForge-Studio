import type { HeadlessOutputSummary } from "../state/product-dispatch.types";

export const HEADLESS_ACTIVE_JOB_REF_VERSION = 1 as const;
export const HEADLESS_ACTIVE_JOB_STORAGE_KEY = "footiebitz:headless-active-job:v1";

export interface HeadlessActiveJobReferenceV1 {
  readonly version: typeof HEADLESS_ACTIVE_JOB_REF_VERSION;
  readonly draftId: string;
  readonly jobId: string;
  readonly createdAtMs: number;
  readonly operationId: string;
  readonly output: HeadlessOutputSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateActiveJobReference(
  value: unknown,
): HeadlessActiveJobReferenceV1 | null {
  if (!isRecord(value)) return null;
  if (value.version !== HEADLESS_ACTIVE_JOB_REF_VERSION) return null;
  if (typeof value.draftId !== "string" || value.draftId.length === 0) return null;
  if (typeof value.jobId !== "string" || value.jobId.length < 8) return null;
  if (typeof value.createdAtMs !== "number" || !Number.isFinite(value.createdAtMs)) {
    return null;
  }
  if (typeof value.operationId !== "string" || value.operationId.length < 8) {
    return null;
  }
  if (!isRecord(value.output)) return null;
  const resolution = value.output.resolution;
  const format = value.output.format;
  if (
    resolution !== "720p" &&
    resolution !== "1080p" &&
    resolution !== "4k"
  ) {
    return null;
  }
  if (format !== "webm" && format !== "mp4") return null;

  // Reject accidental persistence of secrets/manifests.
  const forbiddenKeys = [
    "manifest",
    "assetBundle",
    "credentials",
    "signedUrl",
    "url",
    "locator",
    "digest",
    "fingerprint",
  ];
  for (const key of forbiddenKeys) {
    if (key in value) return null;
  }

  return Object.freeze({
    version: HEADLESS_ACTIVE_JOB_REF_VERSION,
    draftId: value.draftId,
    jobId: value.jobId,
    createdAtMs: value.createdAtMs,
    operationId: value.operationId,
    output: Object.freeze({
      resolution,
      format,
    }),
  });
}

export function readActiveJobReference(
  storage: Pick<Storage, "getItem">,
  draftId: string,
): HeadlessActiveJobReferenceV1 | null {
  let raw: string | null;
  try {
    raw = storage.getItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const ref = validateActiveJobReference(parsed);
  if (!ref) return null;
  if (ref.draftId !== draftId) return null;
  return ref;
}

export function writeActiveJobReference(
  storage: Pick<Storage, "setItem">,
  ref: HeadlessActiveJobReferenceV1,
): void {
  const safe = validateActiveJobReference(ref);
  if (!safe) return;
  try {
    storage.setItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // ignore quota / private mode
  }
}

export function clearActiveJobReference(
  storage: Pick<Storage, "removeItem">,
): void {
  try {
    storage.removeItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Clear if malformed, cross-draft, or expired (>7d). */
export function reconcileActiveJobReference(
  storage: Pick<Storage, "getItem" | "removeItem">,
  draftId: string,
  nowMs: number = Date.now(),
): HeadlessActiveJobReferenceV1 | null {
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  let raw: string | null;
  try {
    raw = storage.getItem(HEADLESS_ACTIVE_JOB_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearActiveJobReference(storage);
    return null;
  }
  const ref = validateActiveJobReference(parsed);
  if (!ref || ref.draftId !== draftId || nowMs - ref.createdAtMs > MAX_AGE_MS) {
    clearActiveJobReference(storage);
    return null;
  }
  return ref;
}
