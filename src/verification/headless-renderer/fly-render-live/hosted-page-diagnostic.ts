/**
 * Sprint 11E Phase 2E.2D.8F.2 — gated no-provider hosted page diagnostic.
 * Suitable for temporary Fly Machine or execution probe extension; not run by default.
 */

import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";

import { runHeadlessPageContractHarness } from "./page-contract-harness";

export const HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE =
  "HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC" as const;

export function isHostedPageDiagnosticGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return (
    (env as Record<string, unknown>)[HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC_GATE] ===
    "1"
  );
}

export type HostedPageDiagnosticResult = {
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly exitCode: number;
  readonly frameCount: number | null;
  readonly executionSubstage: string | null;
  readonly pageFailureReason: string | null;
  readonly pageResponseClass: string | null;
};

export async function runHostedPageDiagnostic(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): Promise<HostedPageDiagnosticResult> {
  if (!isHostedPageDiagnosticGateOn(env)) {
    return {
      overall: "NOT_TESTED",
      exitCode: 0,
      frameCount: null,
      executionSubstage: null,
      pageFailureReason: null,
      pageResponseClass: null,
    };
  }

  const fixture = buildHeadlessReferenceFixture({
    durationMs: 2000,
    rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
  });
  const result = await runHeadlessPageContractHarness({
    fixture,
    contentDurationMs: 2000,
  });

  if (result.ok) {
    return {
      overall: "PASS",
      exitCode: 0,
      frameCount: result.frameCount,
      executionSubstage: null,
      pageFailureReason: null,
      pageResponseClass: null,
    };
  }

  return {
    overall: "FAIL",
    exitCode: 1,
    frameCount: null,
    executionSubstage: result.executionSubstage,
    pageFailureReason: result.pageFailureReason,
    pageResponseClass: result.pageResponseClass,
  };
}
