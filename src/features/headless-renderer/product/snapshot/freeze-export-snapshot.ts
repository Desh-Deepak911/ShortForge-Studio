/**
 * Snapshot / idempotency helpers for one Export click.
 */

export interface FreezeHeadlessSnapshotInput {
  readonly draftId: string;
  readonly resolution: "720p" | "1080p" | "4k";
  readonly format: "webm" | "mp4";
  readonly manifestFingerprint: string;
  readonly assetBundleFingerprint: string;
  readonly nowMs?: number;
  readonly randomUUID?: () => string;
}

export interface FrozenHeadlessClickAuthority {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly draftId: string;
  readonly resolution: "720p" | "1080p" | "4k";
  readonly format: "webm" | "mp4";
  readonly manifestFingerprint: string;
  readonly assetBundleFingerprint: string;
  readonly createdAtMs: number;
}

function defaultUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Mint one-click authority. Do not reuse across explicit new exports.
 */
export function freezeHeadlessClickAuthority(
  input: FreezeHeadlessSnapshotInput,
): FrozenHeadlessClickAuthority {
  const uuid = input.randomUUID ?? defaultUuid;
  const operationId = uuid();
  const createdAtMs = input.nowMs ?? Date.now();
  // The operation ID is the one-click replay authority. The server request
  // fingerprint separately binds the project, profile, manifest, and bundle.
  // Keep this value within the durable job record's bounded-ID contract.
  const idempotencyKey = `h11e:${operationId}`;

  return Object.freeze({
    operationId,
    idempotencyKey,
    draftId: input.draftId,
    resolution: input.resolution,
    format: input.format,
    manifestFingerprint: input.manifestFingerprint,
    assetBundleFingerprint: input.assetBundleFingerprint,
    createdAtMs,
  });
}
