/**
 * Narrow R2 object IO port for Design B full-object verification.
 * Provider-neutral from the verifier's perspective; adapters implement this.
 *
 * Revision authority: providerRevisionId is an opaque ETag or VersionId used
 * ONLY for TOCTOU binding (If-Match). It is NEVER treated as sha256 content
 * digest authority — digests are always computed from streamed bytes.
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type { HeadlessOwnedObjectStoreId } from "../types/owned-object-record";

export type HeadlessR2ObjectLocator = {
  readonly storeId: HeadlessOwnedObjectStoreId;
  readonly objectKey: string;
};

export type HeadlessR2RevisionAuthority =
  | "etag"
  | "version_id"
  | "unavailable";

export type HeadlessR2ObjectMetadata = {
  readonly storeId: HeadlessOwnedObjectStoreId;
  readonly objectKey: string;
  readonly byteLength: number;
  readonly mimeType: string;
  /**
   * Opaque provider revision (stripped ETag or VersionId).
   * NEVER interpret as sha256 content digest.
   */
  readonly providerRevisionId: string | null;
  readonly revisionAuthority: HeadlessR2RevisionAuthority;
};

export interface HeadlessR2ObjectIOPort {
  readObjectMetadata(
    locator: HeadlessR2ObjectLocator,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<HeadlessR2ObjectMetadata>>;

  streamFullObject(input: {
    locator: HeadlessR2ObjectLocator;
    ownerId: string;
    signal?: AbortSignal;
    maxBytes: number;
    /** Bind GetObject to a prior HEAD revision (ETag via IfMatch). */
    requiredProviderRevisionId?: string;
    requiredRevisionAuthority?: "etag" | "version_id";
  }): AsyncGenerator<
    Uint8Array,
    HeadlessControlPlaneResult<{
      readonly byteLength: number;
      readonly mimeType: string;
    }>,
    unknown
  >;

  writeUploadStream(input: {
    locator: HeadlessR2ObjectLocator;
    ownerId: string;
    contentType: string;
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

  deleteObject(
    locator: HeadlessR2ObjectLocator,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<true>>;

  /**
   * Exact object presence for one authorized locator.
   * 404/NotFound → absent; HEAD ok → present; other errors → fail (unknown).
   */
  probeExactObjectPresence(
    locator: HeadlessR2ObjectLocator,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<"present" | "absent">>;
}
