/**
 * QA-only targeted execution probe — Sprint 11E Phase 2E.2D.8F / 8F.1.
 * One bounded 720p/2s job via production outbox/queue/hosted worker path.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import {
  HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN_ENV,
  HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE,
  classifyFlyRenderDeployedValidationCandidateProbeAuthority,
  isHeadlessFlyRenderCandidateValidationGateOn,
  readHeadlessFlyRenderCandidateDigestPin,
  type HeadlessFlyStagingCandidateProbeObservation,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-deployed-validation-candidate-authority";
import { parseHeadlessFlyStagingDualMachineInventoryFromListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";
import { validatePageWorkspaceAttributionComplete } from "@/features/headless-renderer/worker/chromium/page-workspace-attribution-invariant";

import {
  runClaimedRenderExecutionProbeChain,
} from "./claimed-render-execution-probe-runner";
import {
  createNotTestedFlyRenderExecutionProbeEvidence,
  defaultFlyRenderExecutionProbeEvidencePath,
  EXECUTION_PROBE_ELIGIBILITY,
  EXECUTION_PROBE_EVIDENCE_TITLE,
  preserveOrInitializeFlyRenderExecutionProbeEvidence,
  writeFlyRenderExecutionProbeEvidence,
  type FlyRenderExecutionProbeEvidenceDocument,
} from "./claimed-render-execution-probe-evidence";
import {
  attributeFlyRenderLiveEnvironment,
  isFlyRenderLiveConfigAttributionEligible,
  validateFlyRenderLiveQaEnvContract,
} from "./qa-secret-contract";

export const HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_GATE =
  "HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE" as const;

const execFileAsync = promisify(execFile);

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  return (
    (env as Record<string, unknown>)[HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_GATE] ===
    "1"
  );
}

async function readRenderMachineImageDigestFromFly(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): Promise<string | null> {
  const appName = (env as Record<string, unknown>).HEADLESS_FLY_STAGING_APP_NAME;
  if (typeof appName !== "string" || appName.length === 0) return null;
  try {
    const { stdout } = await execFileAsync(
      "fly",
      ["machine", "list", "-a", appName, "--json"],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    let json: unknown;
    try {
      json = JSON.parse(stdout.trim());
    } catch {
      json = [];
    }
    const inventory = parseHeadlessFlyStagingDualMachineInventoryFromListJson(json);
    return inventory.render?.imageDigestSha256 ?? null;
  } catch {
    return null;
  }
}

export type FlyRenderExecutionProbeDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly forceGateOn?: boolean;
  readonly connectionProbe?: () => void;
  readonly nowIso?: () => string;
  readonly renderMachineImageDigestSha256?: string | null;
  readonly readRenderMachineImageDigestSha256?: () => Promise<string | null>;
  readonly runProbeChain?: typeof runClaimedRenderExecutionProbeChain;
  /**
   * Set only by the candidate-validation entrypoint after
   * classifyFlyRenderDeployedValidationCandidateProbeAuthority passes.
   * Skips ordinary current-image selection without weakening it for
   * official probes.
   */
  readonly candidateValidationAuthorizedDigest?: string;
};

function mapFailureAttribution(
  run: Awaited<ReturnType<typeof runClaimedRenderExecutionProbeChain>>,
): Pick<
  FlyRenderExecutionProbeEvidenceDocument,
  "failureSubstage" | "failureReasonId" | "executionAttribution"
> {
  const attribution = run.executionAttribution;
  if (attribution == null) {
    return {
      failureSubstage: null,
      failureReasonId: null,
      executionAttribution: null,
    };
  }
  const substage = attribution.executionSubstage;
  let reasonId: string | null = null;
  if (attribution.dispositionKind === "coherence_rejected") {
    reasonId = "claim_coherence_rejected";
  } else if (substage === "claim_coherence") {
    reasonId = "claim_coherence_rejected";
  } else if (substage === "render_request_materialization") {
    reasonId = "render_request_materialization_failed";
  } else if (substage === "source_binding_resolution") {
    reasonId = "source_binding_resolution_failed";
  } else if (substage === "storage_resolution") {
    reasonId = "storage_resolution_failed";
  } else if (substage === "workspace_prepare") {
    reasonId = "workspace_prepare_failed";
  } else if (substage === "chromium_preflight") {
    reasonId = "chromium_preflight_failed";
  } else if (substage === "chromium_launch") {
    reasonId = "chromium_launch_failed";
  } else if (attribution.pageFailureReason != null) {
    reasonId = attribution.pageFailureReason;
  } else if (substage === "browser_context_create") {
    reasonId = "browser_context_failed";
  } else if (substage === "page_create") {
    reasonId = "page_create_failed";
  } else if (substage === "page_navigation_or_content_load") {
    reasonId = "page_load_failed";
  } else if (substage === "page_bundle_injection") {
    reasonId = "page_bundle_injection_failed";
  } else if (substage === "page_contract_ready") {
    const workspaceComplete =
      attribution.pageWorkspaceAttribution != null &&
      validatePageWorkspaceAttributionComplete(
        attribution.pageWorkspaceAttribution,
      ).ok;
    if (attribution.pageFailureReason === "page_workspace_attribution_missing") {
      reasonId = "page_workspace_attribution_missing";
    } else if (workspaceComplete) {
      reasonId = attribution.pageFailureReason ?? "page_contract_missing";
    } else {
      reasonId = "page_workspace_attribution_missing";
    }
  } else if (substage === "page_request_submit") {
    reasonId = "page_request_rejected";
  } else if (substage === "page_response_wait") {
    reasonId = "page_response_missing";
  } else if (substage === "page_response_validate") {
    reasonId = "page_response_invalid";
  } else if (substage === "page_cleanup") {
    reasonId = "page_cleanup_failed";
  } else if (substage === "ffmpeg_preflight") {
    reasonId = "ffmpeg_preflight_failed";
  } else if (substage === "ffmpeg_execution") {
    reasonId = "ffmpeg_execution_failed";
  } else if (substage === "artifact_upload") {
    reasonId = "artifact_upload_failed";
  } else if (substage === "artifact_finalize") {
    reasonId = "artifact_finalize_failed";
  } else if (substage === "artifact_binding_validation") {
    reasonId = "artifact_binding_validation_failed";
  } else if (substage === "succeeded_cas") {
    reasonId = "succeeded_cas_lost";
  } else if (substage === "terminal_failure_cas") {
    reasonId = "terminal_failure_cas_failed";
  } else if (attribution.dispositionKind === "terminal_failure") {
    reasonId = "render_terminalized_failure";
  }
  return {
    failureSubstage: substage,
    failureReasonId: reasonId,
    executionAttribution: attribution,
  };
}

export async function runFlyRenderExecutionProbe(
  deps: FlyRenderExecutionProbeDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: FlyRenderExecutionProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
}> {
  console.log("\nSprint 11E Phase 2E.2D.8F — Fly render execution probe\n");
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultFlyRenderExecutionProbeEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());

  if (!deps.forceGateOn && !isGateOn(env)) {
    const preserved = preserveOrInitializeFlyRenderExecutionProbeEvidence(
      evidencePath,
    );
    console.log(
      "  NOT TESTED — set HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE=1 with full QA bridge.",
    );
    console.log(
      `  Execution probe evidence ${preserved.action} (overall=${preserved.overall}). Zero connections.`,
    );
    return { exitCode: 0, overall: "NOT_TESTED", connectionFactoryCalls: 0 };
  }

  const configAttribution = attributeFlyRenderLiveEnvironment(env);
  const envContract = validateFlyRenderLiveQaEnvContract(env);
  if (
    !isFlyRenderLiveConfigAttributionEligible(configAttribution) ||
    !envContract.ok
  ) {
    writeFlyRenderExecutionProbeEvidence({
      evidencePath,
      document: {
        ...createNotTestedFlyRenderExecutionProbeEvidence([
          "Gate on but QA secret contract incomplete.",
          "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
        ]),
        overall: "FAIL",
        eligibilityVerdict: EXECUTION_PROBE_ELIGIBILITY.FAIL_CONFIG,
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        failureSubstage: null,
        failureReasonId: null,
        cleanupStatus: "not_run",
      },
    });
    console.log(
      `execution_probe_eligibility_verdict=${EXECUTION_PROBE_ELIGIBILITY.FAIL_CONFIG}`,
    );
    return { exitCode: 1, overall: "FAIL", connectionFactoryCalls: 0 };
  }

  let renderImageDigestSha256: string | null = null;
  if (deps.renderMachineImageDigestSha256 !== undefined) {
    renderImageDigestSha256 = deps.renderMachineImageDigestSha256;
  } else if (deps.readRenderMachineImageDigestSha256) {
    renderImageDigestSha256 = await deps.readRenderMachineImageDigestSha256();
  } else {
    renderImageDigestSha256 = await readRenderMachineImageDigestFromFly(env);
  }
  if (deps.candidateValidationAuthorizedDigest != null) {
    if (
      renderImageDigestSha256 == null ||
      deps.candidateValidationAuthorizedDigest !== renderImageDigestSha256
    ) {
      writeFlyRenderExecutionProbeEvidence({
        evidencePath,
        document: {
          ...createNotTestedFlyRenderExecutionProbeEvidence([
            "Candidate-validation authorized digest does not match render Machine digest.",
            "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
          ]),
          overall: "FAIL",
          eligibilityVerdict: EXECUTION_PROBE_ELIGIBILITY.FAIL_TELEMETRY_IMAGE,
          startedAtIso: nowIso(),
          endedAtIso: nowIso(),
          failureSubstage: null,
          failureReasonId: null,
          cleanupStatus: "not_run",
        },
      });
      console.log(
        `execution_probe_eligibility_verdict=${EXECUTION_PROBE_ELIGIBILITY.FAIL_TELEMETRY_IMAGE}`,
      );
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls: 0 };
    }
  } else {
    const telemetryImage =
      classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
        renderImageDigestSha256,
      });
    if (!telemetryImage.ok) {
      writeFlyRenderExecutionProbeEvidence({
        evidencePath,
        document: {
          ...createNotTestedFlyRenderExecutionProbeEvidence([
            `Render Machine image authority rejected (${telemetryImage.reasonId}).`,
            "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
          ]),
          overall: "FAIL",
          eligibilityVerdict: EXECUTION_PROBE_ELIGIBILITY.FAIL_TELEMETRY_IMAGE,
          startedAtIso: nowIso(),
          endedAtIso: nowIso(),
          failureSubstage: null,
          failureReasonId: null,
          cleanupStatus: "not_run",
        },
      });
      console.log(
        `execution_probe_eligibility_verdict=${EXECUTION_PROBE_ELIGIBILITY.FAIL_TELEMETRY_IMAGE}`,
      );
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls: 0 };
    }
  }

  let connectionFactoryCalls = 0;
  const startedAtIso = nowIso();
  const runProbe = deps.runProbeChain ?? runClaimedRenderExecutionProbeChain;
  const run = await runProbe({
    env,
    connectionProbe: () => {
      connectionFactoryCalls += 1;
      deps.connectionProbe?.();
    },
  });
  const endedAtIso = nowIso();

  const notes = [
    "One bounded 720p-webm-30 / 2000ms production-path execution probe.",
    "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
    "Hosted Fly render worker is sole consumer of the shared staging render stream.",
    "No Machine scale/restart/redeploy; no 4K capacity claim.",
  ];

  if (run.overall === "PASS") {
    writeFlyRenderExecutionProbeEvidence({
      evidencePath,
      document: {
        title: EXECUTION_PROBE_EVIDENCE_TITLE,
        overall: "PASS",
        eligibilityVerdict: EXECUTION_PROBE_ELIGIBILITY.PASS,
        startedAtIso,
        endedAtIso,
        failureSubstage: null,
        failureReasonId: null,
        executionAttribution: run.executionAttribution,
        cleanupStatus: run.cleanupStatus,
        executionStages: run.stages,
        smokeWorkload: run.smokeWorkload,
        resourceObservation: run.resourceObservation,
        executionDurationMs: run.executionDurationMs,
        artifactAuthority: run.artifactAuthority,
        acceptedImageDigestSha256: run.acceptedImageDigestSha256,
        owningBoundaryEvidence: run.owningBoundaryEvidence,
        owningBoundaryIngestionFailure: null,
        boundaryEmissionClassification:
          run.owningBoundaryIngestion?.emissionClassification ?? null,
        jobCreateAttribution: run.jobCreateAttribution,
        notes,
      },
    });
    console.log("  PASS — targeted execution probe succeeded.");
    return { exitCode: 0, overall: "PASS", connectionFactoryCalls };
  }

  const failure = mapFailureAttribution(run);
  const cleanupFailed = run.cleanupStatus === "failed";
  const successAttributionFailed = run.successAttributionFailureCategory != null;
  const ingestionFailed =
    run.owningBoundaryIngestion != null &&
    !run.owningBoundaryIngestion.ok;
  const ingestionFailureReason = ingestionFailed
    ? run.owningBoundaryIngestion!.reasonId
    : null;
  const boundaryEmissionClassification =
    run.owningBoundaryIngestion?.emissionClassification ?? null;
  writeFlyRenderExecutionProbeEvidence({
    evidencePath,
    document: {
      title: EXECUTION_PROBE_EVIDENCE_TITLE,
      overall: "FAIL",
      eligibilityVerdict: cleanupFailed
        ? EXECUTION_PROBE_ELIGIBILITY.FAIL_CLEANUP
        : successAttributionFailed
          ? EXECUTION_PROBE_ELIGIBILITY.FAIL
          : ingestionFailed
            ? EXECUTION_PROBE_ELIGIBILITY.FAIL
            : EXECUTION_PROBE_ELIGIBILITY.FAIL,
      startedAtIso,
      endedAtIso,
      ...failure,
      cleanupStatus: run.cleanupStatus,
      executionStages: run.stages,
      smokeWorkload: run.smokeWorkload,
      resourceObservation: run.resourceObservation,
      executionDurationMs: run.executionDurationMs,
      artifactAuthority: run.artifactAuthority,
      acceptedImageDigestSha256: run.acceptedImageDigestSha256,
      owningBoundaryEvidence: run.owningBoundaryEvidence,
      owningBoundaryIngestionFailure: ingestionFailureReason,
      boundaryEmissionClassification,
      jobCreateAttribution: run.jobCreateAttribution,
      notes: [
        ...notes,
        run.failedStageId != null
          ? `Failed at stage ${run.failedStageId}.`
          : "Probe failed before stage completion.",
        ...(successAttributionFailed
          ? [
              `Success attribution derivation failed (${run.successAttributionFailureCategory}).`,
            ]
          : []),
        ...(ingestionFailed
          ? [`Owning boundary ingestion failed (${ingestionFailureReason}).`]
          : []),
        ...(boundaryEmissionClassification != null
          ? [`Boundary emission classification: ${boundaryEmissionClassification}.`]
          : []),
        ...(run.boundedBoundaryCaptureLines.length > 0
          ? [
              `Bounded boundary capture retained ${run.boundedBoundaryCaptureLines.length} line(s) for next correlation.`,
            ]
          : []),
      ],
    },
  });
  console.log(
    `  FAIL — stage=${run.failedStageId ?? "unknown"} cleanup=${run.cleanupStatus}${
      run.successAttributionFailureCategory != null
        ? ` success_attribution=${run.successAttributionFailureCategory}`
        : ""
    }`,
  );
  return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
}

export type FlyRenderCandidateValidationProbeDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly connectionProbe?: () => void;
  readonly nowIso?: () => string;
  readonly candidateObservation?: HeadlessFlyStagingCandidateProbeObservation;
  readonly runProbeChain?: typeof runClaimedRenderExecutionProbeChain;
};

/**
 * Separate entrypoint for deployed-validation-candidate probes.
 * Defaults off with zero provider contact. Does not weaken ordinary
 * current-image execution probe selection.
 */
export async function runFlyRenderCandidateValidationProbe(
  deps: FlyRenderCandidateValidationProbeDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: FlyRenderExecutionProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
  readonly reasonId: string | null;
}> {
  const env = deps.env ?? process.env;
  if (!isHeadlessFlyRenderCandidateValidationGateOn(env)) {
    return {
      exitCode: 0,
      overall: "NOT_TESTED",
      connectionFactoryCalls: 0,
      reasonId: "candidate_gate_disabled",
    };
  }
  const pin = readHeadlessFlyRenderCandidateDigestPin(env);
  if (pin == null) {
    return {
      exitCode: 1,
      overall: "FAIL",
      connectionFactoryCalls: 0,
      reasonId: "candidate_digest_pin_missing",
    };
  }
  if (deps.candidateObservation == null) {
    return {
      exitCode: 1,
      overall: "FAIL",
      connectionFactoryCalls: 0,
      reasonId: "hostile_input",
    };
  }
  const observation: HeadlessFlyStagingCandidateProbeObservation = {
    ...deps.candidateObservation,
    candidateValidationGateEnabled: true,
    candidateDigestPin: pin,
    candidateDigestSha256:
      deps.candidateObservation.candidateDigestSha256 ?? pin,
  };
  const authority =
    classifyFlyRenderDeployedValidationCandidateProbeAuthority(observation);
  if (!authority.ok) {
    return {
      exitCode: 1,
      overall: "FAIL",
      connectionFactoryCalls: 0,
      reasonId: authority.reasonId,
    };
  }
  // Provider contact remains behind the ordinary QA execution-probe gate and
  // secret contract; candidate authority replaces only current-image selection.
  return runFlyRenderExecutionProbe({
    env: {
      ...env,
      [HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE]: "1",
      [HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN_ENV]: pin,
    },
    evidencePath: deps.evidencePath,
    connectionProbe: deps.connectionProbe,
    nowIso: deps.nowIso,
    renderMachineImageDigestSha256: authority.candidateDigestSha256,
    runProbeChain: deps.runProbeChain,
    forceGateOn: true,
    candidateValidationAuthorizedDigest: authority.candidateDigestSha256,
  }).then((result) => ({
    ...result,
    reasonId: null,
  }));
}
