/**
 * Source materialization policy for 11C control plane.
 * Remote HTTP(S) is not unrestricted worker/server fetch authority.
 * Client must upload/bind owned objects (exact 11B coverage) before job create.
 */

import { classifyHeadlessSource } from "../../domain/headless-source-coverage";
import type { HeadlessRequiredSourceSlot } from "../../domain/headless-render.types";
import { cpFail, cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessMaterializationClass =
  | "direct_owned_upload_required"
  | "owned_object_reuse"
  | "remote_requires_client_upload"
  | "unknown_rejected";

/**
 * Classification of how a manifest source slot must be materialised.
 * Job acceptance requires an owned asset-bundle covering every slot —
 * never unrestricted server/worker fetch of remote URLs.
 */
export function classifyHeadlessMaterializationRequirement(
  slot: HeadlessRequiredSourceSlot,
): HeadlessMaterializationClass {
  switch (slot.classification) {
    case "blob":
    case "data":
    case "local":
      return "direct_owned_upload_required";
    case "https":
    case "http":
      return "remote_requires_client_upload";
    case "other":
    default:
      return "unknown_rejected";
  }
}

/**
 * After exact asset-bundle coverage validation succeeds, materialization is
 * considered satisfied via owned uploads. This guard only rejects unknown classes.
 */
export function assertHeadlessMaterializationPolicy(
  slots: readonly HeadlessRequiredSourceSlot[],
): HeadlessControlPlaneResult<true> {
  for (const slot of slots) {
    const cls = classifyHeadlessMaterializationRequirement(slot);
    if (cls === "unknown_rejected") {
      return cpFail(
        "INVALID_TRANSPORT",
        "Unsupported source classification for headless materialization.",
      );
    }
  }
  return cpOk(true as const);
}

/** Reject attempts to treat a remote URL as server fetch authority. */
export function rejectUnrestrictedRemoteFetchAuthority(
  sourceUrl: string,
): HeadlessControlPlaneResult<true> {
  const classification = classifyHeadlessSource(sourceUrl);
  if (classification === "http" || classification === "https") {
    return cpFail(
      "REMOTE_FETCH_FORBIDDEN",
      "Remote HTTP(S) sources require client upload or an approved ingestion adapter — not unrestricted server fetch.",
    );
  }
  return cpOk(true as const);
}

/** Explicit: /api/assets/materialize is not headless worker binder authority. */
export function isAssetsMaterializeRouteHeadlessAuthority(): false {
  return false;
}

export function classifySourceForPolicy(source: string) {
  return classifyHeadlessSource(source);
}
