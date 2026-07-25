/**
 * Control-plane-private artifact → finalized object binding.
 * Never part of HeadlessRenderArtifactV1, safe job views, diagnostics, or
 * creator-visible API JSON.
 */

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";

export const HEADLESS_ARTIFACT_OBJECT_BINDING_VERSION = 1 as const;

/**
 * Private durable binding between a succeeded job attempt and a finalized
 * owned storage object. Locators are opaque object-storage identities — never URLs.
 */
export interface HeadlessArtifactObjectBindingV1 {
  readonly version: typeof HEADLESS_ARTIFACT_OBJECT_BINDING_VERSION;
  readonly jobId: string;
  readonly attempt: number;
  readonly ownerId: string;
  readonly projectId: string;
  readonly storageLocator: HeadlessStorageLocatorIdentity;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  /** Public artifact metadata fingerprint (`hra:sha256:…`), not a download URL. */
  readonly artifactFingerprint: string;
  readonly requestFingerprint: string;
  readonly expiresAtMs: number;
}

export const HEADLESS_ARTIFACT_OBJECT_BINDING_FIELDS = Object.freeze([
  "version",
  "jobId",
  "attempt",
  "ownerId",
  "projectId",
  "storageLocator",
  "contentDigest",
  "byteLength",
  "mimeType",
  "artifactFingerprint",
  "requestFingerprint",
  "expiresAtMs",
] as const);
