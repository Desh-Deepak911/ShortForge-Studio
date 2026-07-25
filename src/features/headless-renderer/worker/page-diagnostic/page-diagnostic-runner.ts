/**
 * Sprint 11E Phase 2E.2D.8F.3 — provider-free page diagnostic runner.
 */

import { accessSync, constants } from "node:fs";

import { resolveSystemChromeExecutable } from "../chromium/chrome-executable";
import { buildHeadlessChromeLaunchArgs } from "../chromium/chrome-launch-args";
import { renderFramesWithChromium } from "../chromium/render-session";
import { createHeadlessWorkerWorkspace } from "../assets/workspace";
import { WorkspaceByteBudget } from "../assets/workspace-quota";
import { buildHeadlessFramePlan } from "../runtime/frame-plan";
import { resolveHeadlessRenderTarget } from "../runtime/render-target";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerLimits,
} from "../runtime/worker-types";

import { materializePageArtifactAuthority } from "./page-diagnostic-artifact";
import {
  validatePageDiagnosticEnvironment,
  type PageDiagnosticEnvironmentVerdict,
} from "./page-diagnostic-environment";
import {
  createStdoutPageDiagnosticEventSink,
  type PageDiagnosticEventSink,
  type PageDiagnosticSafeEvent,
} from "./page-diagnostic-events";
import {
  buildPageDiagnosticManifestV3,
  buildPageDiagnosticPngBytes,
  PAGE_DIAGNOSTIC_CONTENT_DURATION_MS,
  stagePageDiagnosticAssets,
} from "./page-diagnostic-fixture";
import {
  mapProductionFailureToDiagnosticReason,
  mapProductionPageSubstageToDiagnostic,
  type PageDiagnosticReasonId,
  type PageDiagnosticSubstageId,
} from "./page-diagnostic-substages";

export const PAGE_DIAGNOSTIC_GATE_ENV =
  "HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC" as const;

export type PageDiagnosticRunResult = {
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly exitCode: number;
  readonly failedSubstage: PageDiagnosticSubstageId | null;
  readonly reasonId: PageDiagnosticReasonId | null;
  readonly boundedDurationMs: number;
  readonly cleanupStatus: "ok" | "failed" | "not_run";
};

export type PageDiagnosticRunnerDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly eventSink?: PageDiagnosticEventSink;
  readonly validateEnvironment?: typeof validatePageDiagnosticEnvironment;
  readonly materializePageArtifact?: typeof materializePageArtifactAuthority;
  readonly renderContract?: typeof renderFramesWithChromium;
  readonly limits?: Partial<HeadlessWorkerLimits>;
  readonly contentDurationMs?: number;
  readonly forceGateOn?: boolean;
};

function emitStage(
  sink: PageDiagnosticEventSink,
  input: Omit<PageDiagnosticSafeEvent, "name" | "boundedDurationMs"> & {
    readonly boundedDurationMs?: number | null;
  },
): void {
  sink({
    name: "hosted.page_diagnostic",
    boundedDurationMs: input.boundedDurationMs ?? null,
    ...input,
  });
}

function failResult(input: {
  readonly substage: PageDiagnosticSubstageId;
  readonly reasonId: PageDiagnosticReasonId;
  readonly startedMs: number;
  readonly cleanupStatus: PageDiagnosticRunResult["cleanupStatus"];
  readonly sink: PageDiagnosticEventSink;
  readonly filePresentClass?: PageDiagnosticSafeEvent["filePresentClass"];
  readonly scriptLoadedClass?: PageDiagnosticSafeEvent["scriptLoadedClass"];
  readonly contractGlobalClass?: PageDiagnosticSafeEvent["contractGlobalClass"];
  readonly contractVersionClass?: PageDiagnosticSafeEvent["contractVersionClass"];
  readonly responseClass?: PageDiagnosticSafeEvent["responseClass"];
  readonly chromiumExitClass?: PageDiagnosticSafeEvent["chromiumExitClass"];
}): PageDiagnosticRunResult {
  emitStage(input.sink, {
    status: "failed",
    diagnosticStage: input.substage,
    pageSubstage: input.substage,
    reasonId: input.reasonId,
    filePresentClass: input.filePresentClass ?? "not_applicable",
    scriptLoadedClass: input.scriptLoadedClass ?? "not_applicable",
    contractGlobalClass: input.contractGlobalClass ?? "not_applicable",
    contractVersionClass: input.contractVersionClass ?? "not_applicable",
    responseClass: input.responseClass ?? "runtime_exception",
    chromiumExitClass: input.chromiumExitClass ?? "failed",
    cleanupStatus: input.cleanupStatus,
    boundedDurationMs: Date.now() - input.startedMs,
  });
  return {
    overall: "FAIL",
    exitCode: 1,
    failedSubstage: input.substage,
    reasonId: input.reasonId,
    boundedDurationMs: Date.now() - input.startedMs,
    cleanupStatus: input.cleanupStatus,
  };
}

export async function runPageDiagnostic(
  deps: PageDiagnosticRunnerDeps = {},
): Promise<PageDiagnosticRunResult> {
  const env = deps.env ?? process.env;
  const sink = deps.eventSink ?? createStdoutPageDiagnosticEventSink();
  const startedMs = Date.now();
  const validateEnvironment = deps.validateEnvironment ?? validatePageDiagnosticEnvironment;
  const materializePageArtifact =
    deps.materializePageArtifact ?? materializePageArtifactAuthority;
  const renderContract = deps.renderContract ?? renderFramesWithChromium;
  const contentDurationMs =
    deps.contentDurationMs ?? PAGE_DIAGNOSTIC_CONTENT_DURATION_MS;

  if (!deps.forceGateOn) {
    const envVerdict = validateEnvironment(env);
    if (!envVerdict.ok) {
      return failResult({
        substage: "diagnostic_environment",
        reasonId: envVerdict.reasonId,
        startedMs,
        cleanupStatus: "not_run",
        sink,
      });
    }
  } else {
    const envVerdict = validateEnvironment(env);
    if (!envVerdict.ok && envVerdict.reasonId !== "gate_off") {
      return failResult({
        substage: "diagnostic_environment",
        reasonId: envVerdict.reasonId,
        startedMs,
        cleanupStatus: "not_run",
        sink,
      });
    }
  }

  emitStage(sink, {
    status: "ok",
    diagnosticStage: "diagnostic_environment",
    pageSubstage: "diagnostic_environment",
    reasonId: null,
    filePresentClass: "not_applicable",
    scriptLoadedClass: "not_applicable",
    contractGlobalClass: "not_applicable",
    contractVersionClass: "not_applicable",
    responseClass: "not_reached",
    chromiumExitClass: "not_applicable",
    cleanupStatus: "not_run",
  });

  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    return failResult({
      substage: "binary_preflight",
      reasonId: "chrome_missing",
      startedMs,
      cleanupStatus: "not_run",
      sink,
      chromiumExitClass: "failed",
    });
  }
  const launchArgs = buildHeadlessChromeLaunchArgs();
  if (launchArgs.includes("--no-sandbox")) {
    return failResult({
      substage: "binary_preflight",
      reasonId: "chromium_sandbox_failed",
      startedMs,
      cleanupStatus: "not_run",
      sink,
      chromiumExitClass: "failed",
    });
  }

  emitStage(sink, {
    status: "ok",
    diagnosticStage: "binary_preflight",
    pageSubstage: "binary_preflight",
    reasonId: null,
    filePresentClass: "not_applicable",
    scriptLoadedClass: "not_applicable",
    contractGlobalClass: "not_applicable",
    contractVersionClass: "not_applicable",
    responseClass: "not_reached",
    chromiumExitClass: "not_applicable",
    cleanupStatus: "not_run",
  });

  const workspace = createHeadlessWorkerWorkspace({
    jobId: "page_diagnostic",
    attempt: 1,
  });
  let cleanupStatus: PageDiagnosticRunResult["cleanupStatus"] = "not_run";
  try {
    accessSync(workspace.rootDir, constants.W_OK);
  } catch {
    workspace.cleanup();
    return failResult({
      substage: "workspace_prepare",
      reasonId: "workspace_unwritable",
      startedMs,
      cleanupStatus: "failed",
      sink,
    });
  }

  emitStage(sink, {
    status: "ok",
    diagnosticStage: "workspace_prepare",
    pageSubstage: "workspace_prepare",
    reasonId: null,
    filePresentClass: "not_applicable",
    scriptLoadedClass: "not_applicable",
    contractGlobalClass: "not_applicable",
    contractVersionClass: "not_applicable",
    responseClass: "not_reached",
    chromiumExitClass: "not_applicable",
    cleanupStatus: "not_run",
  });

  const artifact = materializePageArtifact(env);
  if (!artifact.ok) {
    workspace.cleanup();
    return failResult({
      substage: "page_artifact_materialize",
      reasonId: artifact.reasonId,
      startedMs,
      cleanupStatus: "ok",
      sink,
      filePresentClass:
        artifact.reasonId === "page_artifact_absent" ? "absent" : "unreadable",
    });
  }

  emitStage(sink, {
    status: "ok",
    diagnosticStage: "page_artifact_materialize",
    pageSubstage: "page_artifact_materialize",
    reasonId: null,
    filePresentClass: "present_readable",
    scriptLoadedClass: "not_applicable",
    contractGlobalClass: "not_applicable",
    contractVersionClass: "not_applicable",
    responseClass: "not_reached",
    chromiumExitClass: "not_applicable",
    cleanupStatus: "not_run",
  });

  const manifest = buildPageDiagnosticManifestV3();
  const pngBytes = buildPageDiagnosticPngBytes();
  const staged = stagePageDiagnosticAssets({
    workspace,
    manifest,
    pngBytes,
  });
  if (!staged.ok) {
    workspace.cleanup();
    return failResult({
      substage: "page_artifact_materialize",
      reasonId: "index_materialization_failed",
      startedMs,
      cleanupStatus: "ok",
      sink,
      filePresentClass: "present_readable",
      scriptLoadedClass: "missing",
    });
  }

  const target = resolveHeadlessRenderTarget({
    resolution: "720p",
    format: "webm",
    quality: "high",
    fps: 30,
  });
  if (!target.ok) {
    workspace.cleanup();
    return failResult({
      substage: "page_contract_ready",
      reasonId: "contract_global_missing",
      startedMs,
      cleanupStatus: "ok",
      sink,
    });
  }

  const planAll = buildHeadlessFramePlan(manifest, contentDurationMs, target.target);
  if (!planAll.ok) {
    workspace.cleanup();
    return failResult({
      substage: "frame_request",
      reasonId: "frame_request_failed",
      startedMs,
      cleanupStatus: "ok",
      sink,
    });
  }
  const framePlan = {
    ...planAll.plan,
    frames: planAll.plan.frames.slice(0, 1),
  };

  const limits: HeadlessWorkerLimits = {
    ...DEFAULT_HEADLESS_WORKER_LIMITS,
    ...deps.limits,
  };
  const budget = new WorkspaceByteBudget(limits);
  const deadlineMs = Date.now() + limits.jobTimeoutMs;

  const rendered = await renderContract({
    chromeExecutable: chrome.executable,
    workspace,
    manifest,
    stagedAssets: staged.assets,
    framePlan,
    budget,
    limits,
    remainingMs: () => Math.max(1, deadlineMs - Date.now()),
    onPngFrame: async () => ({ ok: true }),
  });

  if (!rendered.ok) {
    const diagSubstage = mapProductionPageSubstageToDiagnostic(
      rendered.executionSubstage,
    );
    const reasonId = mapProductionFailureToDiagnosticReason({
      substage: rendered.executionSubstage,
      pageFailureReason: rendered.pageFailureReason,
      pageResponseClass: rendered.pageResponseClass,
    });
    workspace.cleanup();
    cleanupStatus = "ok";
    return failResult({
      substage: diagSubstage,
      reasonId,
      startedMs,
      cleanupStatus,
      sink,
      filePresentClass: "present_readable",
      scriptLoadedClass:
        diagSubstage === "page_bundle_execute" ? "failed" : "loaded",
      contractGlobalClass:
        reasonId === "contract_global_missing" ? "missing" : "not_applicable",
      contractVersionClass:
        reasonId === "contract_version_mismatch" ? "mismatch" : "not_applicable",
      responseClass:
        reasonId === "png_response_missing"
          ? "missing_payload"
          : reasonId === "png_response_invalid"
            ? "invalid_payload"
            : "runtime_exception",
      chromiumExitClass: reasonId === "page_timeout" ? "timeout" : "failed",
    });
  }

  for (const substage of [
    "browser_context_create",
    "page_create",
    "page_load",
    "page_bundle_execute",
    "page_contract_ready",
    "page_bootstrap",
    "frame_request",
    "png_response_validate",
  ] as const) {
    emitStage(sink, {
      status: "ok",
      diagnosticStage: substage,
      pageSubstage: substage,
      reasonId: null,
      filePresentClass: "present_readable",
      scriptLoadedClass: "loaded",
      contractGlobalClass: "present",
      contractVersionClass: "match_9c",
      responseClass: substage === "png_response_validate" ? "valid_png" : "not_reached",
      chromiumExitClass: "not_applicable",
      cleanupStatus: "not_run",
    });
  }

  workspace.cleanup();
  cleanupStatus = "ok";
  emitStage(sink, {
    status: "ok",
    diagnosticStage: "cleanup",
    pageSubstage: "cleanup",
    reasonId: null,
    filePresentClass: "present_readable",
    scriptLoadedClass: "loaded",
    contractGlobalClass: "present",
    contractVersionClass: "match_9c",
    responseClass: "valid_png",
    chromiumExitClass: "clean",
    cleanupStatus: "ok",
    boundedDurationMs: Date.now() - startedMs,
  });

  return {
    overall: "PASS",
    exitCode: 0,
    failedSubstage: null,
    reasonId: null,
    boundedDurationMs: Date.now() - startedMs,
    cleanupStatus,
  };
}

export type { PageDiagnosticEnvironmentVerdict };
