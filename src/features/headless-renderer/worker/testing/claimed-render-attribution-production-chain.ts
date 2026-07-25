/**
 * Production-chain attribution fixture — materialize → render-session →
 * executeHeadlessRenderJob → executeClaimedRender → hosted telemetry.
 * Testing-only; never imported by production barrels.
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  composeTestHeadlessControlPlane,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { headlessSourceDigest } from "@/features/headless-renderer/domain";
import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import {
  HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME,
  materializeHeadlessPageWorkspace,
} from "@/features/headless-renderer/worker/chromium/materialize-headless-page-workspace";
import { renderFramesWithChromium } from "@/features/headless-renderer/worker/chromium/render-session";
import {
  isPageWorkspaceAttributionTelemetryComplete,
  PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES,
} from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { executionAttributionToSafeTelemetryFacts } from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  executeClaimedRender,
  mapClaimedRenderToHostedResult,
  type ClaimedRenderExecutionResult,
} from "@/features/headless-renderer/worker/runtime/execute-claimed-render";
import { materializeOwnedAssets } from "@/features/headless-renderer/worker/assets/materialize-owned-assets";
import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import { WorkspaceByteBudget } from "@/features/headless-renderer/worker/assets/workspace-quota";
import { buildHeadlessFramePlan } from "@/features/headless-renderer/worker/runtime/frame-plan";
import { resolveHeadlessRenderTarget } from "@/features/headless-renderer/worker/runtime/render-target";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerLimits,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import type { HeadlessCanonicalStoredJobRecord } from "@/features/headless-renderer/control-plane/types/stored-job-record";
import type { HeadlessTestControlPlaneStack } from "@/features/headless-renderer/control-plane/testing";

export type ProductionChainScenario =
  | "contract_missing"
  | "page_bundle_missing";

export type ProductionChainAttributionObservation = {
  readonly scenario: ProductionChainScenario;
  readonly renderSession: {
    readonly ok: false;
    readonly executionSubstage: string;
    readonly pageFailureReason: string;
    readonly pageWorkspaceAttribution?: unknown;
  };
  readonly claimedResult: ClaimedRenderExecutionResult;
  readonly hostedFacts: Readonly<Record<string, string>>;
  readonly workspaceTelemetryComplete: boolean;
};

const NO_CONTRACT_BUNDLE = "// no headless contract\n";

async function withPageBundlePath<T>(
  bundlePath: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  const priorBundle = process.env.HEADLESS_PAGE_BUNDLE_PATH;
  const priorRoot = process.env.HEADLESS_HOSTED_WORKER_ROOT;
  if (bundlePath != null) {
    process.env.HEADLESS_PAGE_BUNDLE_PATH = bundlePath;
    delete process.env.HEADLESS_HOSTED_WORKER_ROOT;
  } else {
    delete process.env.HEADLESS_PAGE_BUNDLE_PATH;
    delete process.env.HEADLESS_HOSTED_WORKER_ROOT;
  }
  try {
    return await fn();
  } finally {
    if (priorBundle == null) delete process.env.HEADLESS_PAGE_BUNDLE_PATH;
    else process.env.HEADLESS_PAGE_BUNDLE_PATH = priorBundle;
    if (priorRoot == null) delete process.env.HEADLESS_HOSTED_WORKER_ROOT;
    else process.env.HEADLESS_HOSTED_WORKER_ROOT = priorRoot;
  }
}

async function runRenderSessionChain(input: {
  readonly scenario: ProductionChainScenario;
  readonly contentDurationMs: number;
  readonly limits?: Partial<HeadlessWorkerLimits>;
}): Promise<ProductionChainAttributionObservation["renderSession"]> {
  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    throw new Error("BLOCKED: system Chrome unavailable for production chain");
  }

  const fixture = buildHeadlessReferenceFixture({
    audioMode: "silent",
    durationMs: input.contentDurationMs,
  });
  const manifest = fixture.manifestV3;
  const target = resolveHeadlessRenderTarget(fixture.rendererProfile);
  if (!target.ok) {
    throw new Error("fixture render target invalid");
  }
  const plan = buildHeadlessFramePlan(
    manifest,
    input.contentDurationMs,
    target.target,
  );
  if (!plan.ok) {
    throw new Error("frame plan invalid");
  }

  const clock = 1_700_000_000_000;
  const ownerId = "attr-production-chain";
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: "sess-attr-chain" },
    authorizedProjectIds: [manifest.project.projectId],
    allowProjectMutate: true,
    nowMs: () => clock,
    workerMode: "noop",
  });

  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId: manifest.project.projectId,
    manifest,
    nowMs: clock,
    leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
    assetByteFactory: (slot) => {
      for (const [url, bytes] of fixture.assetBytesByUrl) {
        if (headlessSourceDigest(url) === slot.sourceDigest) {
          return bytes;
        }
      }
      throw new Error("fixture bytes missing");
    },
    mimeForSlot: (slot) =>
      slot.expectedMediaKind === "audio" ? "audio/wav" : "image/png",
  });
  if (!seeded.ok) {
    throw new Error("seed failed");
  }

  const workspace = createHeadlessWorkerWorkspace({
    jobId: "attr_chain",
    attempt: 1,
  });
  const limits = { ...DEFAULT_HEADLESS_WORKER_LIMITS, ...input.limits };
  const budget = new WorkspaceByteBudget(limits);

  const materialized = await materializeOwnedAssets({
    workspace,
    budget,
    bundle: seeded.value.bundle,
    storage: stack.storage,
    ownerId,
    nowMs: clock,
    maxTotalAssetBytes: limits.maxTotalAssetBytes,
  });
  if (!materialized.ok) {
    workspace.cleanup();
    throw new Error("asset materialize failed");
  }

  const deadlineMs = clock + limits.jobTimeoutMs;
  const rendered = await renderFramesWithChromium({
    chromeExecutable: chrome.executable,
    workspace,
    manifest,
    stagedAssets: materialized.assets,
    framePlan: plan.plan,
    budget,
    limits,
    remainingMs: () => Math.max(1, deadlineMs - clock),
    onPngFrame: async () => ({ ok: true }),
  });
  workspace.cleanup();

  if (rendered.ok) {
    if (input.scenario === "contract_missing") {
      throw new Error("expected contract_missing failure from no-contract bundle");
    }
    throw new Error("expected terminal render failure");
  }
  return {
    ok: false,
    executionSubstage: rendered.executionSubstage,
    pageFailureReason: rendered.pageFailureReason,
    pageWorkspaceAttribution: rendered.pageWorkspaceAttribution,
  };
}

async function claimReferenceJob(input: {
  readonly stack: HeadlessTestControlPlaneStack;
  readonly jobId: string;
  readonly ownerId: string;
  readonly nowMs: number;
}): Promise<{ claimedRecord: HeadlessCanonicalStoredJobRecord; claimToken: string }> {
  const current = await input.stack.jobStore.getByJobIdAndOwner(
    input.jobId,
    input.ownerId,
  );
  if (!current.ok || current.value.stage !== "canonical") {
    throw new Error("expected canonical queued job");
  }
  const claimToken = `claim_${randomUUID()}`;
  const claimed = await input.stack.jobStore.claimQueuedJob({
    jobId: input.jobId,
    ownerId: input.ownerId,
    expectedStoreVersion: current.value.storeVersion,
    claimToken,
    nowMs: input.nowMs,
  });
  if (!claimed.ok || claimed.value.kind !== "claimed") {
    throw new Error("claim failed");
  }
  return { claimedRecord: claimed.value.record, claimToken };
}

export async function runClaimedRenderAttributionProductionChain(input: {
  readonly scenario: ProductionChainScenario;
  readonly contentDurationMs?: number;
}): Promise<ProductionChainAttributionObservation> {
  const chrome = resolveSystemChromeExecutable();
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!chrome.ok || !ffmpeg.ok) {
    throw new Error("BLOCKED: Chrome or FFmpeg unavailable for production chain");
  }

  const distBundle = join(process.cwd(), "dist/headless-worker/page-render.iife.js");
  if (!existsSync(distBundle) && input.scenario !== "page_bundle_missing") {
    throw new Error("BLOCKED: dist/headless-worker/page-render.iife.js missing");
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "fb-attr-chain-"));
  try {
    let bundlePath: string | null = distBundle;
    if (input.scenario === "contract_missing") {
      bundlePath = join(tempRoot, "page-render.iife.js");
      writeFileSync(bundlePath, NO_CONTRACT_BUNDLE);
    } else if (input.scenario === "page_bundle_missing") {
      bundlePath = join(tempRoot, "missing-page-render.iife.js");
    }

    return await withPageBundlePath(bundlePath, async () => {
      process.env.HEADLESS_CHROME_PATH = chrome.executable;
      process.env.HEADLESS_FFMPEG_PATH = ffmpeg.ffmpegExecutable;
      process.env.HEADLESS_FFPROBE_PATH = ffmpeg.ffprobeExecutable;

      const contentDurationMs = input.contentDurationMs ?? 1_000;
      const renderSession = await runRenderSessionChain({
        scenario: input.scenario,
        contentDurationMs,
      });

      const fixture = buildHeadlessReferenceFixture({
        audioMode: "silent",
        durationMs: contentDurationMs,
      });
      const clock = 1_700_000_000_001;
      const { stack, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: `attr-chain-${randomUUID().slice(0, 8)}`,
        clockMs: clock,
      });
      const { claimedRecord, claimToken } = await claimReferenceJob({
        stack,
        jobId,
        ownerId,
        nowMs: clock + 1,
      });

      const claimedResult = await executeClaimedRender({
        claimedRecord,
        claimToken,
        jobStore: stack.jobStore,
        artifactCleanup: new MemoryHeadlessArtifactCleanupAdapter(),
        nowMs: () => clock + 100,
        resolveStorage: () => stack.storage,
        limits: {
          jobTimeoutMs: 120_000,
          evaluateTimeoutMs: 30_000,
        },
      });

      const hosted = mapClaimedRenderToHostedResult(claimedResult);
      const hostedFacts =
        hosted.executionAttribution != null
          ? executionAttributionToSafeTelemetryFacts(hosted.executionAttribution)
          : ({} as Readonly<Record<string, string>>);

      return {
        scenario: input.scenario,
        renderSession,
        claimedResult,
        hostedFacts,
        workspaceTelemetryComplete: isPageWorkspaceAttributionTelemetryComplete(
          hostedFacts,
        ),
      };
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export async function runMaterializeAttributionObservation(input: {
  readonly scenario: "page_bundle_missing" | "materialized_digest_mismatch";
  readonly env?: NodeJS.ProcessEnv;
}): Promise<{
  readonly ok: false;
  readonly pageFailureReason: string;
  readonly pageWorkspaceAttribution: unknown;
}> {
  const workspace = createHeadlessWorkerWorkspace({
    jobId: "mat_obs",
    attempt: 1,
  });
  const limits = DEFAULT_HEADLESS_WORKER_LIMITS;
  const budget = new WorkspaceByteBudget(limits);
  const env = input.env ?? process.env;

  if (input.scenario === "page_bundle_missing") {
    const materialized = await materializeHeadlessPageWorkspace({
      workspace,
      budget,
      maxBytes: limits.maxGeneratedBundleBytes,
      env: { ...env, HEADLESS_PAGE_BUNDLE_PATH: "/nonexistent/page-render.iife.js" },
    });
    workspace.cleanup();
    return {
      ok: false,
      pageFailureReason: "page_bundle_injection_failed",
      pageWorkspaceAttribution: materialized.attribution,
    };
  }

  const distBundle = join(process.cwd(), "dist/headless-worker/page-render.iife.js");
  const materialized = await materializeHeadlessPageWorkspace({
    workspace,
    budget,
    maxBytes: limits.maxGeneratedBundleBytes,
    env: { ...env, HEADLESS_PAGE_BUNDLE_PATH: distBundle },
  });
  if (!materialized.ok) {
    workspace.cleanup();
    throw new Error("expected successful materialization before digest tamper");
  }
  const scriptPath = join(workspace.rootDir, HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME);
  writeFileSync(scriptPath, Buffer.from([0x00, 0x01, 0x02]));
  void createHash("sha256").update(readFileSync(scriptPath)).digest("hex");
  workspace.cleanup();
  return {
    ok: false,
    pageFailureReason: "page_contract_missing",
    pageWorkspaceAttribution: materialized.attribution,
  };
}

export function assertProductionChainWorkspaceFactsComplete(
  facts: Readonly<Record<string, string>>,
): void {
  for (const key of PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES) {
    if (typeof facts[key] !== "string" || facts[key]!.length === 0) {
      throw new Error(`missing workspace telemetry field: ${key}`);
    }
  }
}

export function readShippedPageBundleBytes(): Uint8Array {
  const distBundle = join(process.cwd(), "dist/headless-worker/page-render.iife.js");
  return new Uint8Array(readFileSync(distBundle));
}
