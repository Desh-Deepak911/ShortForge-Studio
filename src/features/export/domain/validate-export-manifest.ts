/**
 * Version-dispatching ExportManifest authority (Sprint 9C).
 * Preflight / runtime must use these — never assume latest version.
 */

import {
  validateExportManifestV2SceneMedia,
  assertExportManifestV2SceneMedia,
  type ExportManifestV2IntegrityIssue,
  type ExportManifestV2IntegrityResult,
} from "./assert-export-manifest-v2-scene-media";
import {
  validateExportManifestV3SceneMedia,
  assertExportManifestV3SceneMedia,
} from "./assert-export-manifest-v3-scene-media";
import {
  validateExportManifestV4SceneMedia,
  assertExportManifestV4SceneMedia,
} from "./assert-export-manifest-v4-scene-media";
import {
  validateExportManifestV5SceneMedia,
  assertExportManifestV5SceneMedia,
} from "./assert-export-manifest-v5-scene-media";
import {
  EXPORT_MANIFEST_VERSION,
  EXPORT_MANIFEST_V5_VERSION,
  EXPORT_MANIFEST_V3_VERSION,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  EXPORT_RENDERER_CONTRACT_V5,
  EXPORT_RENDERER_CONTRACT_V3,
  EXPORT_RENDERER_CONTRACT_V2,
} from "./export-manifest.types";

export type ExportManifestIntegrityIssue = ExportManifestV2IntegrityIssue;
export type ExportManifestIntegrityResult = ExportManifestV2IntegrityResult;

function issue(
  code: string,
  message: string,
): ExportManifestIntegrityIssue {
  return { code, message };
}

/**
 * Total, non-throwing version-aware validation.
 * Unknown versions / mismatched contracts fail closed.
 */
export function validateExportManifest(
  manifest: unknown,
): ExportManifestIntegrityResult {
  try {
    if (manifest === null || manifest === undefined || typeof manifest !== "object") {
      return {
        ok: false,
        issues: [
          issue("INVALID_MANIFEST", "ExportManifest must be a non-null object."),
        ],
      };
    }

    const record = manifest as Record<string, unknown>;
    const version = record.version;
    const contract = record.rendererContractVersion;

    if (version === EXPORT_MANIFEST_V2_VERSION) {
      if (contract !== EXPORT_RENDERER_CONTRACT_V2) {
        return {
          ok: false,
          issues: [
            issue(
              "UNSUPPORTED_RENDERER_CONTRACT",
              `ExportManifest v2 requires renderer contract "${EXPORT_RENDERER_CONTRACT_V2}".`,
            ),
          ],
        };
      }
      return validateExportManifestV2SceneMedia(manifest);
    }

    if (version === EXPORT_MANIFEST_V3_VERSION) {
      if (contract !== EXPORT_RENDERER_CONTRACT_V3) {
        return {
          ok: false,
          issues: [
            issue(
              "UNSUPPORTED_RENDERER_CONTRACT",
              `ExportManifest v3 requires renderer contract "${EXPORT_RENDERER_CONTRACT_V3}".`,
            ),
          ],
        };
      }
      return validateExportManifestV3SceneMedia(manifest);
    }

    if (version === EXPORT_MANIFEST_VERSION) {
      if (contract !== EXPORT_RENDERER_CONTRACT_VERSION) {
        return {
          ok: false,
          issues: [
            issue(
              "UNSUPPORTED_RENDERER_CONTRACT",
              `ExportManifest v4 requires renderer contract "${EXPORT_RENDERER_CONTRACT_VERSION}".`,
            ),
          ],
        };
      }
      return validateExportManifestV4SceneMedia(manifest);
    }

    if (version === EXPORT_MANIFEST_V5_VERSION) {
      if (contract !== EXPORT_RENDERER_CONTRACT_V5) {
        return {
          ok: false,
          issues: [
            issue(
              "UNSUPPORTED_RENDERER_CONTRACT",
              `ExportManifest v5 requires renderer contract "${EXPORT_RENDERER_CONTRACT_V5}".`,
            ),
          ],
        };
      }
      return validateExportManifestV5SceneMedia(manifest);
    }

    return {
      ok: false,
      issues: [
        issue(
          "UNSUPPORTED_MANIFEST_VERSION",
          `Unsupported ExportManifest version: ${String(version)}.`,
        ),
      ],
    };
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_MANIFEST",
          error instanceof Error
            ? `Manifest validation failed unexpectedly: ${error.message}`
            : "Manifest validation failed unexpectedly.",
        ),
      ],
    };
  }
}

export function assertExportManifest(manifest: unknown): void {
  const result = validateExportManifest(manifest);
  if (!result.ok) {
    const first = result.issues[0]!;
    throw new Error(
      `ExportManifest integrity failed (${first.code}): ${first.message}`,
    );
  }
}

/** @deprecated Prefer assertExportManifest — kept for explicit frozen-v2 call sites. */
export {
  assertExportManifestV2SceneMedia,
  assertExportManifestV3SceneMedia,
  assertExportManifestV4SceneMedia,
  assertExportManifestV5SceneMedia,
};
