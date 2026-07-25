/**
 * Sprint 11E Phase 2E.2D.8B.1 — Fly render job-create probe authority (deterministic).
 * Run: npm run test:headless-fly-render-job-create-probe-authority
 */

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

import {
  classifyJobCreateProbeConsumerTopology,
  jobCreateProbeRequiresMutationBlock,
} from "./fly-render-live/job-create-probe-consumer-safety";
import {
  createNotTestedFlyRenderJobCreateProbeEvidence,
  jobCreateProbeCannotFalsePass,
  preserveOrInitializeFlyRenderJobCreateProbeEvidence,
  renderFlyRenderJobCreateProbeEvidenceMarkdown,
} from "./fly-render-live/job-create-probe-evidence";
import { runFlyRenderJobCreateProbe } from "./fly-render-live/job-create-probe";
import { createCanonicalFlyVerifyLiveQaConfiguredEnv } from "./fly-verify-live/qa-secret-contract";
import {
  HEADLESS_FLY_STAGING_PRIMARY_REGION,
  HEADLESS_FLY_STAGING_RENDER_VM,
  HEADLESS_FLY_STAGING_VERIFY_VM,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-topology";

const ACTIVE_STAGING_CONSUMER_FIXTURE = Object.freeze({
  verifyCount: 1,
  renderCount: 1,
  otherCount: 0,
  verifyMachineState: "started",
  renderMachineState: "started",
  verifyRegion: HEADLESS_FLY_STAGING_PRIMARY_REGION,
  renderRegion: HEADLESS_FLY_STAGING_PRIMARY_REGION,
  verifyCpuKind: HEADLESS_FLY_STAGING_VERIFY_VM.cpuKind,
  renderCpuKind: HEADLESS_FLY_STAGING_RENDER_VM.cpuKind,
  verifyCpus: HEADLESS_FLY_STAGING_VERIFY_VM.cpus,
  renderCpus: HEADLESS_FLY_STAGING_RENDER_VM.cpus,
  verifyMemoryMb: HEADLESS_FLY_STAGING_VERIFY_VM.memoryMb,
  renderMemoryMb: HEADLESS_FLY_STAGING_RENDER_VM.memoryMb,
  verifyMachineId: "2867595a922d78",
  renderMachineId: "784e671b331228",
});

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8B.1 — Fly render job-create probe authority\n",
  );

  await test("gate-off preserves evidence with zero connections", async () => {
    const path = `/tmp/fly-render-jc-probe-${Date.now()}.md`;
    const result = await runFlyRenderJobCreateProbe({
      env: {},
      evidencePath: path,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(result.providerMutationCalls, 0);
  });

  await test("active staging consumers block mutation before Neon/R2", async () => {
    const path = `/tmp/fly-render-jc-block-${Date.now()}.md`;
    const result = await runFlyRenderJobCreateProbe({
      forceGateOn: true,
      evidencePath: path,
      env: {
        ...createCanonicalFlyVerifyLiveQaConfiguredEnv(),
        HEADLESS_FLY_RENDER_QA_JOB_CREATE_PROBE: "1",
      },
      readConsumerTopology: async () =>
        classifyJobCreateProbeConsumerTopology(
          ACTIVE_STAGING_CONSUMER_FIXTURE,
        ) as never,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.overall, "FAIL");
    assert.equal(result.providerMutationCalls, 0);
    const md = renderFlyRenderJobCreateProbeEvidenceMarkdown({
      ...createNotTestedFlyRenderJobCreateProbeEvidence(),
      overall: "FAIL",
      eligibilityVerdict: "blocked",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:00:01.000Z",
      failureStage: "consumer_safety_precheck",
      failureReasonId: "active_staging_consumers_block_mutation",
      stages: [
        {
          stage: "consumer_safety_precheck",
          status: "failed",
          reasonId: "active_staging_consumers_block_mutation",
        },
      ],
      cleanupStatus: "not_run",
      consumerSafetyMode: "blocked_active_consumers",
    });
    assert.ok(md.includes("blocked_active_consumers"));
    assert.ok(md.includes("consumer_safety_precheck"));
  });

  await test("zero-consumer precondition required for PASS authority", () => {
    const doc = {
      ...createNotTestedFlyRenderJobCreateProbeEvidence(),
      overall: "PASS" as const,
      cleanupStatus: "ok" as const,
      consumerSafetyMode: "blocked_active_consumers" as const,
      failureStage: null,
      failureReasonId: null,
      stages: [
        { stage: "queued_state_assertion" as const, status: "ok" as const },
        {
          stage: "dispatch_outbox_intent_reread" as const,
          status: "ok" as const,
        },
      ],
    };
    assert.equal(jobCreateProbeCannotFalsePass(doc).ok, false);
  });

  await test("dispatch race cannot manufacture pending-outbox PASS", () => {
    const doc = {
      ...createNotTestedFlyRenderJobCreateProbeEvidence(),
      overall: "PASS" as const,
      cleanupStatus: "ok" as const,
      consumerSafetyMode: "zero_consumer" as const,
      failureStage: null,
      failureReasonId: null,
      stages: [{ stage: "queued_state_assertion" as const, status: "ok" as const }],
    };
    const authority = jobCreateProbeCannotFalsePass(doc);
    assert.equal(authority.ok, false);
    if (!authority.ok) {
      assert.ok(authority.message.includes("dispatch_outbox_intent_reread"));
    }
  });

  await test("preserveOrInitialize preserves PASS marker", () => {
    const path = `/tmp/fly-render-jc-preserve-pass-${Date.now()}.md`;
    writeFileSync(path, "**Overall:** PASS\n", "utf8");
    const preserved = preserveOrInitializeFlyRenderJobCreateProbeEvidence(path);
    assert.equal(preserved.overall, "PASS");
    assert.equal(preserved.action, "preserved");
  });

  await test("false PASS rejected when failed stage present", () => {
    const doc = {
      ...createNotTestedFlyRenderJobCreateProbeEvidence(),
      overall: "PASS" as const,
      cleanupStatus: "ok" as const,
      consumerSafetyMode: "zero_consumer" as const,
      failureStage: "provisional_job_create",
      failureReasonId: null,
      stages: [{ stage: "cleanup" as const, status: "ok" as const }],
    };
    const authority = jobCreateProbeCannotFalsePass(doc);
    assert.equal(authority.ok, false);
  });

  await test("valid PASS authority accepts zero-consumer queued+outbox stages", () => {
    const doc = {
      ...createNotTestedFlyRenderJobCreateProbeEvidence(),
      overall: "PASS" as const,
      cleanupStatus: "ok" as const,
      consumerSafetyMode: "zero_consumer" as const,
      failureStage: null,
      failureReasonId: null,
      stages: [
        { stage: "queued_state_assertion" as const, status: "ok" as const },
        {
          stage: "dispatch_outbox_intent_reread" as const,
          status: "ok" as const,
        },
        { stage: "cleanup" as const, status: "ok" as const },
      ],
    };
    const authority = jobCreateProbeCannotFalsePass(doc);
    assert.equal(authority.ok, true);
  });

  await test("consumer topology classifier blocks active verify+render", () => {
    const assessment = classifyJobCreateProbeConsumerTopology(
      ACTIVE_STAGING_CONSUMER_FIXTURE,
    );
    assert.ok("mode" in assessment);
    if ("mode" in assessment) {
      assert.equal(assessment.mode, "active_staging_consumers");
      assert.equal(jobCreateProbeRequiresMutationBlock(assessment), true);
    }
  });

  await test("rendered markdown documents official evidence is not overwritten", () => {
    const md = renderFlyRenderJobCreateProbeEvidenceMarkdown(
      createNotTestedFlyRenderJobCreateProbeEvidence(),
    );
    assert.ok(md.includes("Does not overwrite"));
    assert.ok(
      md.includes("HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE") ||
        md.includes("official render-live evidence"),
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
