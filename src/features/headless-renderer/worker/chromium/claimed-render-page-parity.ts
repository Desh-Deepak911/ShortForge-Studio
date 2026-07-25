/**
 * Provider-free claimed-render vs diagnostic page workspace parity.
 * Uses the same 720p/2s smoke profile shape as the execution probe.
 */

import { createHeadlessWorkerWorkspace } from "../assets/workspace";
import { WorkspaceByteBudget } from "../assets/workspace-quota";
import { materializeHeadlessPageWorkspace } from "../chromium/materialize-headless-page-workspace";
import {
  pageWorkspaceAttributionToTelemetryFacts,
} from "../chromium/page-workspace-attribution";
import { materializePageArtifactAuthority } from "../page-diagnostic/page-diagnostic-artifact";
import {
  PAGE_DIAGNOSTIC_CONTENT_DURATION_MS,
  PAGE_DIAGNOSTIC_PROFILE_ID,
} from "../page-diagnostic/page-diagnostic-fixture";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerLimits,
} from "../runtime/worker-types";

export type ClaimedRenderPageParityClassificationFacts = Readonly<
  Record<string, string>
>;

function compareMaterializationFacts(
  production: ClaimedRenderPageParityClassificationFacts,
  diagnostic: ClaimedRenderPageParityClassificationFacts,
): boolean {
  const keys = [
    "shipped_artifact_resolution_class",
    "source_artifact_presence_class",
    "source_artifact_digest_class",
    "materialized_artifact_presence_class",
    "materialized_artifact_digest_class",
    "materialized_artifact_length_class",
    "index_script_reference_class",
    "workspace_cleanup_class",
  ] as const;
  return keys.every((key) => production[key] === diagnostic[key]);
}

export type ClaimedRenderPageParityResult =
  | {
      readonly ok: true;
      readonly smokeProfileId: typeof PAGE_DIAGNOSTIC_PROFILE_ID;
      readonly contentDurationMs: typeof PAGE_DIAGNOSTIC_CONTENT_DURATION_MS;
      readonly productionFacts: ClaimedRenderPageParityClassificationFacts;
      readonly diagnosticFacts: ClaimedRenderPageParityClassificationFacts;
    }
  | {
      readonly ok: false;
      readonly stage:
        | "diagnostic_source"
        | "production_materialize"
        | "classification_parity";
      readonly reasonId: string;
    };

export async function runClaimedRenderPageParity(input: {
  readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly limits?: Partial<HeadlessWorkerLimits>;
}): Promise<ClaimedRenderPageParityResult> {
  const diagnosticSource = materializePageArtifactAuthority(input.env);
  if (!diagnosticSource.ok) {
    return {
      ok: false,
      stage: "diagnostic_source",
      reasonId: diagnosticSource.reasonId,
    };
  }

  const limits = { ...DEFAULT_HEADLESS_WORKER_LIMITS, ...input.limits };
  const hostedRoot =
    typeof (input.env as Record<string, unknown>).HEADLESS_HOSTED_WORKER_ROOT ===
    "string"
      ? String((input.env as Record<string, unknown>).HEADLESS_HOSTED_WORKER_ROOT)
      : typeof (input.env as Record<string, unknown>).HEADLESS_PAGE_BUNDLE_PATH ===
          "string"
        ? String((input.env as Record<string, unknown>).HEADLESS_PAGE_BUNDLE_PATH)
        : null;

  const parityEnv =
    hostedRoot != null
      ? {
          HEADLESS_HOSTED_WORKER_ROOT: hostedRoot,
          HEADLESS_PAGE_DIAGNOSTIC_ROOT: hostedRoot,
        }
      : input.env;

  const workspace = createHeadlessWorkerWorkspace({
    jobId: "claimed_render_page_parity_production",
    attempt: 1,
  });
  const diagnosticWorkspace = createHeadlessWorkerWorkspace({
    jobId: "claimed_render_page_parity_diagnostic",
    attempt: 1,
  });
  const budget = new WorkspaceByteBudget(limits);
  const diagnosticBudget = new WorkspaceByteBudget(limits);

  try {
    const materialized = await materializeHeadlessPageWorkspace({
      workspace,
      budget,
      maxBytes: limits.maxGeneratedBundleBytes,
      env: parityEnv,
    });
    if (!materialized.ok) {
      return {
        ok: false,
        stage: "production_materialize",
        reasonId: materialized.reasonId,
      };
    }

    const diagnosticMaterialized = await materializeHeadlessPageWorkspace({
      workspace: diagnosticWorkspace,
      budget: diagnosticBudget,
      maxBytes: limits.maxGeneratedBundleBytes,
      env: parityEnv,
    });
    if (!diagnosticMaterialized.ok) {
      return {
        ok: false,
        stage: "production_materialize",
        reasonId: diagnosticMaterialized.reasonId,
      };
    }

    const productionFacts = pageWorkspaceAttributionToTelemetryFacts(
      materialized.attribution,
    );
    const diagnosticFacts = pageWorkspaceAttributionToTelemetryFacts(
      diagnosticMaterialized.attribution,
    );

    if (!compareMaterializationFacts(productionFacts, diagnosticFacts)) {
      return {
        ok: false,
        stage: "classification_parity",
        reasonId: "materialization_classification_mismatch",
      };
    }

    return {
      ok: true,
      smokeProfileId: PAGE_DIAGNOSTIC_PROFILE_ID,
      contentDurationMs: PAGE_DIAGNOSTIC_CONTENT_DURATION_MS,
      productionFacts,
      diagnosticFacts,
    };
  } finally {
    workspace.cleanup();
    diagnosticWorkspace.cleanup();
  }
}
