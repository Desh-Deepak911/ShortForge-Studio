/**
 * Provider-neutral owned object storage ports.
 * Locators are opaque identities — never unrestricted fetch URLs.
 */

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessUploadPurpose =
  | "manifest"
  | "asset_bytes"
  | "asset_bundle_record"
  | "artifact";

export interface HeadlessObjectMetadata {
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly ownerId: string;
  readonly projectId: string;
  readonly purpose: HeadlessUploadPurpose;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly expiresAtMs: number;
  readonly finalized: boolean;
}

export interface HeadlessUploadSession {
  /** Opaque short-lived capability — never persisted as semantic identity. */
  readonly capabilityToken: string;
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly ownerId: string;
  readonly projectId: string;
  readonly purpose: HeadlessUploadPurpose;
  readonly expiresAtMs: number;
}

export interface HeadlessOwnedObjectBytes {
  readonly metadata: HeadlessObjectMetadata;
  readonly bytes: Uint8Array;
}

export interface HeadlessStoragePort {
  /**
   * Create an upload session. For `purpose: "artifact"`, trusted worker
   * `expectedContentDigest` + `expectedByteLength` are required so production
   * adapters can persist durable staging identity before any PutObject bytes.
   * These are never client-controlled semantic authority.
   */
  createUploadSession(input: {
    ownerId: string;
    projectId: string;
    purpose: HeadlessUploadPurpose;
    mimeType: string;
    expiresAtMs: number;
    /** Required when purpose === "artifact". Trusted worker digest claim. */
    expectedContentDigest?: string;
    /** Required when purpose === "artifact". Trusted worker byte length. */
    expectedByteLength?: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessUploadSession>>;

  /**
   * Write bytes under an active upload session capability.
   * Capability must not be logged or returned in diagnostics after use.
   * Retained for small manifests/assets and compatibility fixtures.
   * Artifact upload MUST use `writeUploadStream`.
   */
  writeUploadBytes(input: {
    capabilityToken: string;
    bytes: Uint8Array;
  }): Promise<HeadlessControlPlaneResult<{ byteLength: number }>>;

  /**
   * Streamed upload under an active capability (Sprint 11D Phase 3.3).
   * Consumes bounded chunks; never requires a whole-object buffer from the caller.
   * Enforces: no zero-byte success, no bytes beyond expected/max, exact final
   * byte-count agreement, cancellation/timeout, one terminal completion.
   * Capability tokens and source paths must never appear in results/diagnostics.
   */
  writeUploadStream(input: {
    capabilityToken: string;
    expectedByteLength: number;
    maxBytes: number;
    signal?: AbortSignal;
    chunks: AsyncIterable<Uint8Array>;
  }): Promise<
    HeadlessControlPlaneResult<{
      readonly byteLength: number;
      readonly chunkCount: number;
      readonly peakChunkBytes: number;
    }>
  >;

  finalizeUploadedObject(input: {
    capabilityToken: string;
    expectedContentDigest: string;
  }): Promise<HeadlessControlPlaneResult<HeadlessObjectMetadata>>;

  readObjectMetadata(
    locator: HeadlessStorageLocatorIdentity,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<HeadlessObjectMetadata>>;

  /**
   * Open owned object bytes.
   * Optional `options.signal` / `options.maxBytes` are provider-neutral hooks:
   * implementations that cannot cancel mid-read must still check `signal`
   * before returning bytes and may reject when `byteLength > maxBytes`.
   */
  openOwnedObject(
    locator: HeadlessStorageLocatorIdentity,
    ownerId: string,
    nowMs?: number,
    options?: {
      readonly signal?: AbortSignal;
      readonly maxBytes?: number;
    },
  ): Promise<HeadlessControlPlaneResult<HeadlessOwnedObjectBytes>>;

  verifyObjectDigest(input: {
    locator: HeadlessStorageLocatorIdentity;
    ownerId: string;
    expectedContentDigest: string;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessObjectMetadata>>;

  deleteObject(
    locator: HeadlessStorageLocatorIdentity,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<true>>;
}
