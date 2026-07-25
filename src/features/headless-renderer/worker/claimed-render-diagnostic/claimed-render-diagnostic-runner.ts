/**
 * Sprint 11E Phase 2E.2D.8F.6 — provider-free claimed-render diagnostic runner (A/B).
 */

import { resolveSystemChromeExecutable } from "../chromium/chrome-executable";
import { executeHeadlessRenderJob } from "../runtime/execute-render-job";

import {
  HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE,
  validateClaimedRenderDiagnosticEnvironment,
  type ClaimedRenderDiagnosticEnvironmentVerdict,
} from "./claimed-render-diagnostic-environment";
import type { ClaimedRenderDiagnosticBootstrapLifecycleSink } from "./claimed-render-diagnostic-bootstrap-lifecycle";
import {
  createInitialBoundaryPresence,
  createStdoutClaimedRenderDiagnosticEventSink,
  type ClaimedRenderDiagnosticEventSink,
} from "./claimed-render-diagnostic-events";
import { buildClaimedRenderDiagnosticMinimalFixture } from "./claimed-render-diagnostic-fixture-minimal";
import { buildClaimedRenderDiagnosticLiveSmokeFixture } from "./claimed-render-diagnostic-fixture-live-smoke";
import {
  runClaimedRenderDiagnosticVariant,
  type ClaimedRenderDiagnosticVariantResult,
} from "./claimed-render-diagnostic-execute-variant";

export const CLAIMED_RENDER_DIAGNOSTIC_GATE_ENV =
  HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE;

export type ClaimedRenderDiagnosticComparisonClass =
  | "common_runtime_failure"
  | "production_fixture_input_failure"
  | "claimed_render_lifecycle_failure"
  | "attribution_only_failure"
  | "minimal_pass_live_smoke_fail"
  | "both_pass"
  | "both_fail_same_stage"
  | "both_fail_divergent"
  | "not_run";

export type ClaimedRenderDiagnosticRunResult = {
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly exitCode: number;
  readonly comparisonClass: ClaimedRenderDiagnosticComparisonClass;
  readonly minimal: ClaimedRenderDiagnosticVariantResult | null;
  readonly liveSmoke: ClaimedRenderDiagnosticVariantResult | null;
  readonly boundedDurationMs: number;
  readonly cleanupStatus: "ok" | "failed" | "not_run";
};

export type ClaimedRenderDiagnosticRunnerDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly eventSink?: ClaimedRenderDiagnosticEventSink;
  readonly bootstrapLifecycleSink?: ClaimedRenderDiagnosticBootstrapLifecycleSink;
  readonly validateEnvironment?: typeof validateClaimedRenderDiagnosticEnvironment;
  readonly executeRenderJob?: typeof executeHeadlessRenderJob;
  readonly forceGateOn?: boolean;
  readonly skipLiveSmoke?: boolean;
};

function classifyComparison(input: {
  readonly minimal: ClaimedRenderDiagnosticVariantResult;
  readonly liveSmoke: ClaimedRenderDiagnosticVariantResult | null;
}): ClaimedRenderDiagnosticComparisonClass {
  const { minimal, liveSmoke } = input;
  if (liveSmoke == null) return "not_run";
  if (minimal.overall === "PASS" && liveSmoke.overall === "PASS") {
    return "both_pass";
  }
  if (minimal.overall === "FAIL" && liveSmoke.overall === "FAIL") {
    if (minimal.reasonId === liveSmoke.reasonId) {
      return "both_fail_same_stage";
    }
    if (
      minimal.reasonId === "chrome_missing" ||
      minimal.reasonId === "chromium_sandbox_failed"
    ) {
      return "common_runtime_failure";
    }
    return "both_fail_divergent";
  }
  if (minimal.overall === "PASS" && liveSmoke.overall === "FAIL") {
    if (liveSmoke.pageFailureReason === "page_workspace_attribution_missing") {
      return "attribution_only_failure";
    }
    return "production_fixture_input_failure";
  }
  if (
    minimal.overall === "FAIL" &&
    liveSmoke.overall === "PASS"
  ) {
    return "claimed_render_lifecycle_failure";
  }
  return "both_fail_divergent";
}

export async function runClaimedRenderDiagnostic(
  deps: ClaimedRenderDiagnosticRunnerDeps = {},
): Promise<ClaimedRenderDiagnosticRunResult> {
  const env = deps.env ?? process.env;
  const sink = deps.eventSink ?? createStdoutClaimedRenderDiagnosticEventSink();
  const bootstrapSink = deps.bootstrapLifecycleSink;
  const startedMs = Date.now();
  const validateEnvironment =
    deps.validateEnvironment ?? validateClaimedRenderDiagnosticEnvironment;

  if (!deps.forceGateOn) {
    const envVerdict = validateEnvironment(env);
    if (!envVerdict.ok) {
      sink({
        name: "hosted.claimed_render_diagnostic",
        status: "failed",
        variant: "minimal",
        diagnosticStage: "diagnostic_environment",
        reasonId: envVerdict.reasonId,
        boundaryPresence: createInitialBoundaryPresence(),
        workspaceClassificationCount: 0,
        boundedDurationMs: Date.now() - startedMs,
        cleanupStatus: "not_run",
      });
      return {
        overall: "FAIL",
        exitCode: 1,
        comparisonClass: "not_run",
        minimal: null,
        liveSmoke: null,
        boundedDurationMs: Date.now() - startedMs,
        cleanupStatus: "not_run",
      };
    }
  } else {
    const envVerdict = validateEnvironment(env);
    if (!envVerdict.ok && envVerdict.reasonId !== "gate_off") {
      sink({
        name: "hosted.claimed_render_diagnostic",
        status: "failed",
        variant: "minimal",
        diagnosticStage: "diagnostic_environment",
        reasonId: envVerdict.reasonId,
        boundaryPresence: createInitialBoundaryPresence(),
        workspaceClassificationCount: 0,
        boundedDurationMs: Date.now() - startedMs,
        cleanupStatus: "not_run",
      });
      return {
        overall: "FAIL",
        exitCode: 1,
        comparisonClass: "not_run",
        minimal: null,
        liveSmoke: null,
        boundedDurationMs: Date.now() - startedMs,
        cleanupStatus: "not_run",
      };
    }
  }

  sink({
    name: "hosted.claimed_render_diagnostic",
    status: "ok",
    variant: "minimal",
    diagnosticStage: "diagnostic_environment",
    reasonId: null,
    boundaryPresence: createInitialBoundaryPresence(),
    workspaceClassificationCount: 0,
    boundedDurationMs: null,
    cleanupStatus: "not_run",
  });

  const minimalFixture = buildClaimedRenderDiagnosticMinimalFixture();
  bootstrapSink?.("variant_minimal_started");
  const minimal = await runClaimedRenderDiagnosticVariant({
    variant: "minimal",
    fixture: minimalFixture,
    env,
    eventSink: sink,
    executeRenderJob: deps.executeRenderJob,
  });
  bootstrapSink?.(
    "variant_minimal_terminal",
    minimal.overall === "PASS" ? "ok" : "failed",
    minimal.reasonId,
  );

  let liveSmoke: ClaimedRenderDiagnosticVariantResult | null = null;
  if (!deps.skipLiveSmoke) {
    bootstrapSink?.("variant_live_smoke_started");
    const liveSmokeFixture = buildClaimedRenderDiagnosticLiveSmokeFixture(env);
    liveSmoke = await runClaimedRenderDiagnosticVariant({
      variant: "live_smoke",
      fixture: liveSmokeFixture,
      env,
      eventSink: sink,
      executeRenderJob: deps.executeRenderJob,
    });
    bootstrapSink?.(
      "variant_live_smoke_terminal",
      liveSmoke.overall === "PASS" ? "ok" : "failed",
      liveSmoke.reasonId,
    );
  }

  const comparisonClass = classifyComparison({ minimal, liveSmoke });
  const overall =
    minimal.overall === "PASS" && (liveSmoke == null || liveSmoke.overall === "PASS")
      ? "PASS"
      : "FAIL";

  sink({
    name: "hosted.claimed_render_diagnostic",
    status: overall === "PASS" ? "ok" : "failed",
    variant: "minimal",
    diagnosticStage: "comparison",
    reasonId: comparisonClass,
    boundaryPresence: minimal.boundaryPresence,
    workspaceClassificationCount: minimal.workspaceClassificationCount,
    boundedDurationMs: Date.now() - startedMs,
    cleanupStatus: "ok",
  });

  return {
    overall,
    exitCode: overall === "PASS" ? 0 : 1,
    comparisonClass,
    minimal,
    liveSmoke,
    boundedDurationMs: Date.now() - startedMs,
    cleanupStatus: "ok",
  };
}

export type { ClaimedRenderDiagnosticEnvironmentVerdict };
