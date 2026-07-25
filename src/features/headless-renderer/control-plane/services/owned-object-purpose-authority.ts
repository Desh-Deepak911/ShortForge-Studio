/**
 * Purpose authority helpers for Design B owned objects.
 * Artifact purpose cannot contribute to provisional verification coverage.
 * Source purposes (manifest / asset_bundle_record / asset_bytes) cannot be
 * downloadable artifacts. storeId coherence is enforced by the record validator.
 */

import type { HeadlessOwnedObjectPurpose } from "../types/owned-object-record";

const SOURCE_PURPOSES = Object.freeze([
  "manifest",
  "asset_bundle_record",
  "asset_bytes",
] as const);

export type HeadlessSourceOwnedObjectPurpose =
  (typeof SOURCE_PURPOSES)[number];

export function isHeadlessSourceOwnedObjectPurpose(
  purpose: HeadlessOwnedObjectPurpose,
): purpose is HeadlessSourceOwnedObjectPurpose {
  return (SOURCE_PURPOSES as readonly string[]).includes(purpose);
}

export function isHeadlessArtifactOwnedObjectPurpose(
  purpose: HeadlessOwnedObjectPurpose,
): purpose is "artifact" {
  return purpose === "artifact";
}

/**
 * Artifact purpose must never contribute to provisional verification coverage.
 */
export function assertSourcePurposeNotArtifact(
  purpose: HeadlessOwnedObjectPurpose,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string } {
  if (purpose === "artifact") {
    return {
      ok: false,
      message: "Artifact purpose cannot contribute to source coverage.",
    };
  }
  return { ok: true };
}

/**
 * Source purposes cannot be treated as downloadable artifacts.
 */
export function assertArtifactPurposeNotSourceCoverage(
  purpose: HeadlessOwnedObjectPurpose,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string } {
  if (purpose !== "artifact") {
    return {
      ok: false,
      message: "Source purpose cannot be a downloadable artifact.",
    };
  }
  return { ok: true };
}
