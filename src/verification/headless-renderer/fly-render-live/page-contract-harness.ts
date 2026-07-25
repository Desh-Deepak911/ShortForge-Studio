/**
 * Offline headless page contract harness — no Neon/R2/Upstash/Fly.
 * Mirrors execute-render-job → renderFramesWithChromium with reference fixture bytes.
 */

import {
  composeTestHeadlessControlPlane,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { headlessSourceDigest } from "@/features/headless-renderer/domain";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { renderFramesWithChromium } from "@/features/headless-renderer/worker/chromium/render-session";
import { materializeOwnedAssets } from "@/features/headless-renderer/worker/assets/materialize-owned-assets";
import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import { WorkspaceByteBudget } from "@/features/headless-renderer/worker/assets/workspace-quota";
import { buildHeadlessFramePlan } from "@/features/headless-renderer/worker/runtime/frame-plan";
import { resolveHeadlessRenderTarget } from "@/features/headless-renderer/worker/runtime/render-target";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerLimits,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import type { HeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";

export type HeadlessPageContractHarnessResult =
  | {
      readonly ok: true;
      readonly frameCount: number;
      readonly executionSubstage: null;
      readonly pageFailureReason: null;
    }
  | {
      readonly ok: false;
      readonly executionSubstage: string;
      readonly pageFailureReason: string;
      readonly pageResponseClass: string;
    };

export async function runHeadlessPageContractHarness(input: {
  readonly fixture: HeadlessReferenceFixture;
  readonly contentDurationMs: number;
  readonly limits?: Partial<HeadlessWorkerLimits>;
}): Promise<HeadlessPageContractHarnessResult> {
  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    return {
      ok: false,
      executionSubstage: "browser_context_create",
      pageFailureReason: "browser_context_failed",
      pageResponseClass: "runtime_exception",
    };
  }

  const profile = input.fixture.rendererProfile;
  const target = resolveHeadlessRenderTarget(profile);
  if (!target.ok) {
    return {
      ok: false,
      executionSubstage: "page_contract_ready",
      pageFailureReason: "page_contract_missing",
      pageResponseClass: "missing_api",
    };
  }

  const plan = buildHeadlessFramePlan(
    input.fixture.manifestV3,
    input.contentDurationMs,
    target.target,
  );
  if (!plan.ok) {
    return {
      ok: false,
      executionSubstage: "page_request_submit",
      pageFailureReason: "page_request_rejected",
      pageResponseClass: "rejected",
    };
  }

  const clock = 1_700_000_000_000;
  const manifest = input.fixture.manifestV3;
  const ownerId = "page-contract-harness";
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: "sess-page-contract" },
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
      for (const [url, bytes] of input.fixture.assetBytesByUrl) {
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
    return {
      ok: false,
      executionSubstage: "page_navigation_or_content_load",
      pageFailureReason: "page_load_failed",
      pageResponseClass: "runtime_exception",
    };
  }

  const workspace = createHeadlessWorkerWorkspace({
    jobId: "page_contract_harness",
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
    return {
      ok: false,
      executionSubstage: "page_navigation_or_content_load",
      pageFailureReason: "page_load_failed",
      pageResponseClass: "runtime_exception",
    };
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

  if (!rendered.ok) {
    return {
      ok: false,
      executionSubstage: rendered.executionSubstage,
      pageFailureReason: rendered.pageFailureReason,
      pageResponseClass: rendered.pageResponseClass,
    };
  }

  return {
    ok: true,
    frameCount: rendered.result.frameCount,
    executionSubstage: null,
    pageFailureReason: null,
  };
}
