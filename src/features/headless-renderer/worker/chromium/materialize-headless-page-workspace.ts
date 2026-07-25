/**
 * Shared production/diagnostic page bundle workspace materialization.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HeadlessWorkerWorkspace } from "../assets/workspace";
import type { WorkspaceByteBudget } from "../assets/workspace-quota";
import { buildHeadlessRendererHtml } from "./bundle-page";
import {
  createInitialPageWorkspaceAttribution,
  type PageWorkspaceAttribution,
} from "./page-workspace-attribution";
import { readShippedPageArtifactAuthority } from "./shipped-page-artifact";
import type { ProviderBackedBoundaryTelemetryPort } from "../runtime/provider-backed-boundary-telemetry";
import { createNoOpProviderBackedBoundaryTelemetry } from "../runtime/provider-backed-boundary-telemetry";

export const HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME = "headless-renderer-page.js" as const;
export const HEADLESS_PAGE_WORKSPACE_HTML_NAME = "index.html" as const;

export type MaterializeHeadlessPageWorkspaceFailureReasonId =
  | "page_artifact_absent"
  | "page_artifact_unreadable"
  | "page_bundle_quota_exceeded"
  | "page_bundle_write_failed"
  | "materialized_digest_mismatch"
  | "index_script_reference_invalid"
  | "index_write_failed";

export type MaterializeHeadlessPageWorkspaceResult =
  | {
      readonly ok: true;
      readonly attribution: PageWorkspaceAttribution;
      readonly scriptFileName: typeof HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME;
      readonly htmlFileName: typeof HEADLESS_PAGE_WORKSPACE_HTML_NAME;
      readonly sourceDigestSha256: string;
    }
  | {
      readonly ok: false;
      readonly reasonId: MaterializeHeadlessPageWorkspaceFailureReasonId;
      readonly attribution: PageWorkspaceAttribution;
    };

function digestBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function classifyIndexScriptReference(html: string, scriptFileName: string): PageWorkspaceAttribution["indexScriptReferenceClass"] {
  const expected = `./${scriptFileName}`;
  if (!html.includes(expected)) {
    return html.includes("<script") ? "invalid" : "missing";
  }
  return "valid_relative";
}

export async function materializeHeadlessPageWorkspace(input: {
  readonly workspace: HeadlessWorkerWorkspace;
  readonly budget: WorkspaceByteBudget;
  readonly maxBytes: number;
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly boundaryTelemetry?: ProviderBackedBoundaryTelemetryPort;
}): Promise<MaterializeHeadlessPageWorkspaceResult> {
  const boundaryTelemetry =
    input.boundaryTelemetry ?? createNoOpProviderBackedBoundaryTelemetry();
  boundaryTelemetry.emit("page_workspace_materialization_started");
  const attribution = createInitialPageWorkspaceAttribution();
  const finish = (
    result: MaterializeHeadlessPageWorkspaceResult,
  ): MaterializeHeadlessPageWorkspaceResult => {
    boundaryTelemetry.emit("page_workspace_materialization_complete", {
      workspaceAttribution: result.attribution,
    });
    return result;
  };
  const env = input.env ?? process.env;
  const source = readShippedPageArtifactAuthority(env);

  if (!source.ok) {
    return finish({
      ok: false,
      reasonId:
        source.presentClass === "absent"
          ? "page_artifact_absent"
          : "page_artifact_unreadable",
      attribution: Object.freeze({
        ...attribution,
        shippedArtifactResolutionClass: source.presentClass,
        sourcePageArtifactPresent: source.presentClass,
        materializedArtifactPresent: "absent",
        cleanupDisposition: "ok",
      }),
    });
  }

  const withSource = Object.freeze({
    ...attribution,
    shippedArtifactResolutionClass: "resolved_readable" as const,
    sourcePageArtifactPresent: "present_readable" as const,
    sourceArtifactDigestMatch: "match" as const,
  });

  if (source.byteLength > input.maxBytes) {
    return finish({
      ok: false,
      reasonId: "page_bundle_quota_exceeded",
      attribution: Object.freeze({
        ...withSource,
        materializedArtifactPresent: "absent",
        cleanupDisposition: "ok",
      }),
    });
  }

  const scriptPath = join(input.workspace.rootDir, HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME);
  const htmlPath = join(input.workspace.rootDir, HEADLESS_PAGE_WORKSPACE_HTML_NAME);
  const bundleReserve = input.budget.reserve(source.bytes.byteLength, "bundle");
  if (!bundleReserve.ok) {
    return finish({
      ok: false,
      reasonId: "page_bundle_quota_exceeded",
      attribution: Object.freeze({
        ...withSource,
        materializedArtifactPresent: "absent",
        cleanupDisposition: "ok",
      }),
    });
  }

  try {
    writeFileSync(scriptPath, source.bytes);
    const committed = input.budget.commit(
      bundleReserve.reservationId,
      source.bytes.byteLength,
    );
    if (!committed.ok) {
      input.budget.release(bundleReserve.reservationId);
      return finish({
        ok: false,
        reasonId: "page_bundle_write_failed",
        attribution: Object.freeze({
          ...withSource,
          materializedArtifactPresent: "absent",
          cleanupDisposition: "failed",
        }),
      });
    }
  } catch {
    input.budget.release(bundleReserve.reservationId);
    return finish({
      ok: false,
      reasonId: "page_bundle_write_failed",
      attribution: Object.freeze({
        ...withSource,
        materializedArtifactPresent: "absent",
        cleanupDisposition: "failed",
      }),
    });
  }

  let materializedBytes: Uint8Array;
  try {
    materializedBytes = new Uint8Array(readFileSync(scriptPath));
  } catch {
    return finish({
      ok: false,
      reasonId: "page_bundle_write_failed",
      attribution: Object.freeze({
        ...withSource,
        materializedArtifactPresent: "unreadable",
        cleanupDisposition: "failed",
      }),
    });
  }

  const materializedDigest = digestBytes(materializedBytes);
  const digestMatch = materializedDigest === source.digestSha256;
  const lengthMatch = materializedBytes.byteLength === source.byteLength;
  const withMaterialized = Object.freeze({
    ...withSource,
    materializedArtifactPresent: "present_readable" as const,
    materializedArtifactDigestMatch: digestMatch ? ("match" as const) : ("mismatch" as const),
    materializedByteLengthMatch: lengthMatch ? ("match" as const) : ("mismatch" as const),
  });

  if (!digestMatch || !lengthMatch) {
    return finish({
      ok: false,
      reasonId: "materialized_digest_mismatch",
      attribution: Object.freeze({
        ...withMaterialized,
        cleanupDisposition: "ok",
      }),
    });
  }

  const html = buildHeadlessRendererHtml(HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME);
  const indexClass = classifyIndexScriptReference(html, HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME);
  if (indexClass !== "valid_relative") {
    return finish({
      ok: false,
      reasonId: "index_script_reference_invalid",
      attribution: Object.freeze({
        ...withMaterialized,
        indexScriptReferenceClass: indexClass,
        cleanupDisposition: "ok",
      }),
    });
  }

  const htmlBytes = Buffer.byteLength(html, "utf8");
  const htmlReserve = input.budget.reserve(htmlBytes, "html");
  if (!htmlReserve.ok) {
    return finish({
      ok: false,
      reasonId: "page_bundle_quota_exceeded",
      attribution: Object.freeze({
        ...withMaterialized,
        indexScriptReferenceClass: indexClass,
        cleanupDisposition: "ok",
      }),
    });
  }

  try {
    writeFileSync(htmlPath, html, "utf8");
    input.budget.commit(htmlReserve.reservationId, htmlBytes);
  } catch {
    input.budget.release(htmlReserve.reservationId);
    return finish({
      ok: false,
      reasonId: "index_write_failed",
      attribution: Object.freeze({
        ...withMaterialized,
        indexScriptReferenceClass: indexClass,
        cleanupDisposition: "failed",
      }),
    });
  }

  if (!existsSync(htmlPath)) {
    return finish({
      ok: false,
      reasonId: "index_write_failed",
      attribution: Object.freeze({
        ...withMaterialized,
        indexScriptReferenceClass: "missing",
        cleanupDisposition: "failed",
      }),
    });
  }

  return finish({
    ok: true,
    attribution: Object.freeze({
      ...withMaterialized,
      indexScriptReferenceClass: indexClass,
    }),
    scriptFileName: HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME,
    htmlFileName: HEADLESS_PAGE_WORKSPACE_HTML_NAME,
    sourceDigestSha256: source.digestSha256,
  });
}
