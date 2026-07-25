/**
 * Narrow provider-neutral IO for exact artifact object delete + presence.
 * Locator possession alone is never semantic cleanup authority — callers must
 * revalidate durable owned-object + job binding before invoking these methods.
 */

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessArtifactObjectPresence = "present" | "absent";

export interface HeadlessArtifactObjectIOPort {
  /**
   * Delete the exact authorized object. Success means the provider accepted
   * DeleteObject — not that durable metadata is complete.
   */
  deleteExactObject(input: {
    readonly locator: HeadlessStorageLocatorIdentity;
    readonly ownerId: string;
  }): Promise<HeadlessControlPlaneResult<true>>;

  /**
   * Exact presence probe for one authorized locator.
   * - 404 / NotFound on the exact object → absent
   * - successful HEAD → present
   * - provider/auth/other errors → fail (unknown — never treat as absent)
   */
  probeExactObjectPresence(input: {
    readonly locator: HeadlessStorageLocatorIdentity;
    readonly ownerId: string;
  }): Promise<HeadlessControlPlaneResult<HeadlessArtifactObjectPresence>>;
}
