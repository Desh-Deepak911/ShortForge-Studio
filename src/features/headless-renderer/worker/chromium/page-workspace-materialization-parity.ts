/**
 * Deterministic diagnostic vs production page workspace materialization parity.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createHeadlessWorkerWorkspace } from "../assets/workspace";
import { WorkspaceByteBudget } from "../assets/workspace-quota";
import { materializeHeadlessPageWorkspace } from "../chromium/materialize-headless-page-workspace";
import { materializePageArtifactAuthority } from "../page-diagnostic/page-diagnostic-artifact";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerLimits,
} from "../runtime/worker-types";

export type PageWorkspaceMaterializationParityResult =
  | {
      readonly ok: true;
      readonly sourceDigestSha256: string;
      readonly materializedDigestSha256: string;
      readonly byteLength: number;
    }
  | {
      readonly ok: false;
      readonly stage: "diagnostic_source" | "production_materialize" | "digest_parity";
      readonly reasonId: string;
    };

export async function runPageWorkspaceMaterializationParity(input: {
  readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly limits?: Partial<HeadlessWorkerLimits>;
}): Promise<PageWorkspaceMaterializationParityResult> {
  const diagnosticSource = materializePageArtifactAuthority(input.env);
  if (!diagnosticSource.ok) {
    return {
      ok: false,
      stage: "diagnostic_source",
      reasonId: diagnosticSource.reasonId,
    };
  }

  const workspace = createHeadlessWorkerWorkspace({
    jobId: "page_workspace_parity",
    attempt: 1,
  });
  const limits = { ...DEFAULT_HEADLESS_WORKER_LIMITS, ...input.limits };
  const budget = new WorkspaceByteBudget(limits);

  try {
    const materialized = await materializeHeadlessPageWorkspace({
      workspace,
      budget,
      maxBytes: limits.maxGeneratedBundleBytes,
      env: input.env,
    });
    if (!materialized.ok) {
      return {
        ok: false,
        stage: "production_materialize",
        reasonId: materialized.reasonId,
      };
    }

    const scriptPath = join(workspace.rootDir, materialized.scriptFileName);
    const materializedBytes = readFileSync(scriptPath);
    const materializedDigest = createHash("sha256")
      .update(materializedBytes)
      .digest("hex");

    if (
      materializedDigest !== diagnosticSource.digestSha256 ||
      materializedBytes.byteLength !== diagnosticSource.byteLength
    ) {
      return {
        ok: false,
        stage: "digest_parity",
        reasonId: "materialized_digest_mismatch",
      };
    }

    return {
      ok: true,
      sourceDigestSha256: diagnosticSource.digestSha256,
      materializedDigestSha256: materializedDigest,
      byteLength: diagnosticSource.byteLength,
    };
  } finally {
    workspace.cleanup();
  }
}
