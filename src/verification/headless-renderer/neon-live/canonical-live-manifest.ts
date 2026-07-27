/**
 * Verification-only canonical ExportManifest construction for Neon live fixtures.
 * Final projectId is included before fingerprint authority; never cast as authority.
 * Not exported from production Headless / Export barrels.
 */

import {
  buildExportManifest,
  buildExportManifestFingerprint,
  deepFreezeExportManifest,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV4,
} from "@/features/export/domain";
import type { ExportManifestV4Draft } from "@/features/export/domain/export-manifest.types";
import { validateHeadlessClaimableProjectId } from "@/features/headless-renderer/control-plane";
import type { FootieScript } from "@/features/story/types";

export type CanonicalLiveManifestResult =
  | { readonly ok: true; readonly manifest: ExportManifestV4 }
  | {
      readonly ok: false;
      readonly code:
        | "PROJECT_ID_INVALID"
        | "MANIFEST_BUILD_FAILED"
        | "MANIFEST_VALIDATION_FAILED"
        | "FINGERPRINT_MISMATCH";
      readonly message: string;
    };

/**
 * Hostile demonstration of the pre-2B.2D.4 defect: overwrite projectId without
 * recomputing fingerprint. Never use as a live fixture authority.
 */
export function buildStaleProjectIdOverwrittenManifest(input: {
  readonly projectId: string;
  readonly story: FootieScript;
  readonly environment: Partial<ExportEnvironmentSnapshot>;
}): ExportManifestV4 {
  const base = buildExportManifest({
    story: input.story,
    environment: input.environment,
    audioMode: "with-voice",
  });
  // Intentionally stale — fingerprint still binds to the builder's projectId.
  return {
    ...base,
    project: { ...base.project, projectId: input.projectId },
  } as ExportManifestV4;
}

function detachManifestDraft(
  base: ExportManifestV4,
  projectId: string,
): ExportManifestV4Draft {
  // JSON round-trip detaches frozen production builder output without mutating it.
  const cloned = JSON.parse(JSON.stringify(base)) as ExportManifestV4;
  const { fingerprint: _drop, ...withoutFingerprint } = cloned;
  void _drop;
  return {
    ...withoutFingerprint,
    project: {
      ...withoutFingerprint.project,
      projectId,
    },
  };
}

/**
 * Build a claimable-project-bound ExportManifest for Neon live / probe fixtures.
 * Authority: buildExportManifest → draft with final projectId →
 * buildExportManifestFingerprint → validateExportManifest → deepFreeze.
 */
export function buildCanonicalLiveExportManifest(input: {
  readonly projectId: unknown;
  readonly story: FootieScript;
  readonly environment: Partial<ExportEnvironmentSnapshot>;
}): CanonicalLiveManifestResult {
  try {
    const claimable = validateHeadlessClaimableProjectId(input.projectId);
    if (!claimable.ok) {
      return {
        ok: false,
        code: "PROJECT_ID_INVALID",
        message: claimable.message,
      };
    }

    const base = buildExportManifest({
      story: input.story,
      environment: input.environment,
      audioMode: "with-voice",
    });
    if (base.version !== 4) {
      return {
        ok: false,
        code: "MANIFEST_BUILD_FAILED",
        message: "Expected ExportManifest v4 from builder.",
      };
    }

    const draft = detachManifestDraft(base, claimable.projectId);
    const fingerprint = buildExportManifestFingerprint(draft);
    if (typeof fingerprint !== "string" || !fingerprint.startsWith("em:")) {
      return {
        ok: false,
        code: "FINGERPRINT_MISMATCH",
        message: "Fingerprint authority returned a non-canonical token.",
      };
    }

    const candidate: ExportManifestV4 = { ...draft, fingerprint };
    const validated = validateExportManifest(candidate);
    if (!validated.ok) {
      return {
        ok: false,
        code: "MANIFEST_VALIDATION_FAILED",
        message:
          validated.issues[0]?.code ?? "ExportManifest validation failed.",
      };
    }

    // Recompute must match the sealed fingerprint (no invented/partial edits).
    const recomputed = buildExportManifestFingerprint(draft);
    if (recomputed !== candidate.fingerprint) {
      return {
        ok: false,
        code: "FINGERPRINT_MISMATCH",
        message: "Sealed fingerprint does not match recomputation.",
      };
    }

    if (candidate.project.projectId !== claimable.projectId) {
      return {
        ok: false,
        code: "PROJECT_ID_INVALID",
        message: "Validated manifest projectId does not match claimable input.",
      };
    }

    return {
      ok: true,
      manifest: deepFreezeExportManifest(candidate),
    };
  } catch {
    return {
      ok: false,
      code: "MANIFEST_BUILD_FAILED",
      message: "Hostile or unreadable live-manifest construction rejected.",
    };
  }
}
