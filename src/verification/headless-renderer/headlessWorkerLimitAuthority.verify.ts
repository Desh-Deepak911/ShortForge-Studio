/**
 * Sprint 11D Phase 3.1B — provider/profile worker-limit precedence.
 * Run: npm run test:headless-worker-limit-authority
 */
import assert from "node:assert/strict";

import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import {
  HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS,
  HEADLESS_PROVIDER_CAPACITY_DEFAULTS,
  HEADLESS_PROVIDER_OWNED_LIMIT_KEYS,
  assertProviderCapacityForProfile,
  intersectProfileAndProviderLimits,
  mergeValidatedDefaultsAndOverrides,
  resolveEffectiveWorkerLimits,
} from "@/features/headless-renderer/worker/runtime/resolve-worker-limits";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  HEADLESS_WORKER_RENDERER_BUILD_ID,
  type HeadlessWorkerLimits,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const PROFILE_4K = HEADLESS_OUTPUT_PROFILES["4k-webm-30"];
const PROFILE_720 = HEADLESS_OUTPUT_PROFILES["720p-webm-30"];
const PROFILE_1080 = HEADLESS_OUTPUT_PROFILES["1080p-webm-30"];

function providerAtLeast(
  profile: (typeof HEADLESS_OUTPUT_PROFILES)[keyof typeof HEADLESS_OUTPUT_PROFILES],
): HeadlessWorkerLimits {
  return {
    ...HEADLESS_PROVIDER_CAPACITY_DEFAULTS,
    maxFrames: profile.maxFrames,
    maxSingleFrameBytes: profile.maxSingleFrameBytes,
    maxAggregateFrameBytes: profile.maxAggregateFrameBytes,
    maxWorkspaceBytes: profile.maxWorkspaceBytes,
    maxArtifactBytes: profile.maxArtifactBytes,
  };
}

async function main() {
  console.log("\nSprint 11D Phase 3.1B — Worker limit authority\n");

  test("ownership map: profile-bounded vs provider-owned keys are disjoint", () => {
    const bounded = new Set<string>(HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS);
    const owned = new Set<string>(HEADLESS_PROVIDER_OWNED_LIMIT_KEYS);
    for (const k of bounded) assert.equal(owned.has(k), false);
    assert.equal(bounded.size, 5);
    assert.ok(owned.has("jobTimeoutMs"));
    assert.ok(owned.has("claimLeaseMs"));
    assert.ok(owned.has("processGraceMs"));
    assert.ok(owned.has("evaluateTimeoutMs"));
  });

  test("provider defaults host maximum canonical local profiles", () => {
    for (const profile of Object.values(HEADLESS_OUTPUT_PROFILES)) {
      const ok = assertProviderCapacityForProfile({
        profile,
        providerCapacity: HEADLESS_PROVIDER_CAPACITY_DEFAULTS,
      });
      assert.equal(ok.ok, true, profile.profileId);
    }
    assert.equal(
      DEFAULT_HEADLESS_WORKER_LIMITS.maxWorkspaceBytes,
      HEADLESS_PROVIDER_CAPACITY_DEFAULTS.maxWorkspaceBytes,
    );
  });

  test("1. provider workspace below 4K requirement is not widened", () => {
    const provider = {
      ...providerAtLeast(PROFILE_4K),
      maxWorkspaceBytes: PROFILE_4K.maxWorkspaceBytes - 1,
    };
    assert.equal(
      resolveEffectiveWorkerLimits({
        profile: PROFILE_4K,
        overrides: provider,
        defaults: provider,
      }).ok,
      false,
    );
    const intersected = intersectProfileAndProviderLimits(PROFILE_4K, provider);
    assert.equal(intersected.ok, true);
    if (!intersected.ok) return;
    assert.equal(
      intersected.limits.maxWorkspaceBytes,
      PROFILE_4K.maxWorkspaceBytes - 1,
    );
  });

  test("2. provider frame aggregate below profile is not widened", () => {
    const provider = {
      ...providerAtLeast(PROFILE_1080),
      maxAggregateFrameBytes: PROFILE_1080.maxAggregateFrameBytes - 1,
    };
    assert.equal(
      resolveEffectiveWorkerLimits({
        profile: PROFILE_1080,
        overrides: provider,
        defaults: provider,
      }).ok,
      false,
    );
    const intersected = intersectProfileAndProviderLimits(PROFILE_1080, provider);
    assert.equal(intersected.ok, true);
    if (!intersected.ok) return;
    assert.equal(
      intersected.limits.maxAggregateFrameBytes,
      PROFILE_1080.maxAggregateFrameBytes - 1,
    );
  });

  test("3. provider maxFrames below profile is not widened", () => {
    const provider = {
      ...providerAtLeast(PROFILE_720),
      maxFrames: PROFILE_720.maxFrames - 1,
    };
    assert.equal(
      resolveEffectiveWorkerLimits({
        profile: PROFILE_720,
        overrides: provider,
        defaults: provider,
      }).ok,
      false,
    );
    const intersected = intersectProfileAndProviderLimits(PROFILE_720, provider);
    assert.equal(intersected.ok, true);
    if (!intersected.ok) return;
    assert.equal(intersected.limits.maxFrames, PROFILE_720.maxFrames - 1);
  });

  test("4. provider artifact cap below profile is not widened", () => {
    const provider = {
      ...providerAtLeast(PROFILE_1080),
      maxArtifactBytes: PROFILE_1080.maxArtifactBytes - 1,
    };
    assert.equal(
      resolveEffectiveWorkerLimits({
        profile: PROFILE_1080,
        overrides: provider,
        defaults: provider,
      }).ok,
      false,
    );
  });

  test("5. provider limits above profile are narrowed to profile ceilings", () => {
    const provider = {
      ...HEADLESS_PROVIDER_CAPACITY_DEFAULTS,
      maxFrames: 10_000,
      maxSingleFrameBytes: 64 * 1024 * 1024,
      maxAggregateFrameBytes: 64 * 1024 * 1024 * 1024,
      maxWorkspaceBytes: 8 * 1024 * 1024 * 1024,
      maxArtifactBytes: 2 * 1024 * 1024 * 1024,
    };
    const resolved = resolveEffectiveWorkerLimits({
      profile: PROFILE_720,
      overrides: provider,
      defaults: provider,
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.limits.maxFrames, PROFILE_720.maxFrames);
    assert.equal(
      resolved.limits.maxSingleFrameBytes,
      PROFILE_720.maxSingleFrameBytes,
    );
    assert.equal(
      resolved.limits.maxAggregateFrameBytes,
      PROFILE_720.maxAggregateFrameBytes,
    );
    assert.equal(
      resolved.limits.maxWorkspaceBytes,
      PROFILE_720.maxWorkspaceBytes,
    );
    assert.equal(resolved.limits.maxArtifactBytes, PROFILE_720.maxArtifactBytes);
  });

  test("6. exact matching limits pass", () => {
    const provider = providerAtLeast(PROFILE_4K);
    const resolved = resolveEffectiveWorkerLimits({
      profile: PROFILE_4K,
      overrides: provider,
      defaults: provider,
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    for (const key of HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS) {
      assert.equal(resolved.limits[key], PROFILE_4K[key]);
    }
  });

  test("7. invalid/zero/non-integer/overflow limits fail closed", () => {
    assert.equal(
      mergeValidatedDefaultsAndOverrides({
        overrides: { maxWorkspaceBytes: 0 },
      }).ok,
      false,
    );
    assert.equal(
      mergeValidatedDefaultsAndOverrides({
        overrides: { maxFrames: -1 },
      }).ok,
      false,
    );
    assert.equal(
      mergeValidatedDefaultsAndOverrides({
        overrides: { maxArtifactBytes: 1.5 as never },
      }).ok,
      false,
    );
    assert.equal(
      mergeValidatedDefaultsAndOverrides({
        overrides: { jobTimeoutMs: Number.MAX_SAFE_INTEGER + 1 },
      }).ok,
      false,
    );
    assert.equal(
      mergeValidatedDefaultsAndOverrides({
        overrides: { maxStderrBytes: NaN as never },
      }).ok,
      false,
    );
  });

  test("8–10. 720p / 1080p / 4K sufficient capacity pass", () => {
    for (const profile of [PROFILE_720, PROFILE_1080, PROFILE_4K]) {
      const resolved = resolveEffectiveWorkerLimits({
        profile,
        overrides: {},
      });
      assert.equal(resolved.ok, true, profile.profileId);
      if (!resolved.ok) continue;
      for (const key of HEADLESS_PROFILE_BOUNDED_LIMIT_KEYS) {
        assert.equal(resolved.limits[key], profile[key]);
      }
    }
  });

  test("12. custom timeout/claim/evaluate/process-grace remain provider-owned", () => {
    const resolved = resolveEffectiveWorkerLimits({
      profile: PROFILE_720,
      overrides: {
        jobTimeoutMs: 123_456,
        claimLeaseMs: 77_777,
        evaluateTimeoutMs: 9_001,
        processGraceMs: 2_222,
        maxStderrBytes: 12_345,
      },
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.limits.jobTimeoutMs, 123_456);
    assert.equal(resolved.limits.claimLeaseMs, 77_777);
    assert.equal(resolved.limits.evaluateTimeoutMs, 9_001);
    assert.equal(resolved.limits.processGraceMs, 2_222);
    assert.equal(resolved.limits.maxStderrBytes, 12_345);
    assert.equal(resolved.limits.maxFrames, PROFILE_720.maxFrames);
  });

  test("13–14. effective limits are detached+frozen; caller mutation isolated", () => {
    const overrides: Partial<HeadlessWorkerLimits> = {
      jobTimeoutMs: 99_000,
    };
    const resolved = resolveEffectiveWorkerLimits({
      profile: PROFILE_720,
      overrides,
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(Object.isFrozen(resolved.limits), true);
    assert.equal(Object.isFrozen(resolved.providerCapacity), true);
    const beforeFrames = resolved.limits.maxFrames;
    try {
      (resolved.limits as { maxFrames: number }).maxFrames = 1;
    } catch {
      /* strict freeze may throw */
    }
    assert.equal(resolved.limits.maxFrames, beforeFrames);
    overrides.jobTimeoutMs = 1;
    assert.equal(resolved.limits.jobTimeoutMs, 99_000);
    const again = resolveEffectiveWorkerLimits({
      profile: PROFILE_720,
      overrides: { jobTimeoutMs: 55_000 },
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.limits.jobTimeoutMs, 55_000);
    assert.equal(resolved.limits.jobTimeoutMs, 99_000);
  });

  await testAsync(
    "11. insufficient capacity rejects before Chromium (no artifact)",
    async () => {
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        rendererProfile: { resolution: "4k", format: "webm", quality: "high" },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: `p31b-capacity-reject-4k-${Date.now()}`,
        workerLimits: {
          maxWorkspaceBytes: 16 * 1024 * 1024,
        },
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 0);
      assert.equal(result.value.failed, 1);
      assert.equal(result.value.lastEvidence, null);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.canonicalJob.state, "failed");
      assert.equal(stored.value.canonicalJob.artifact, null);
      assert.equal(
        stored.value.canonicalJob.terminalReason?.reasonId,
        "UNSUPPORTED_CAPABILITY",
      );
    },
  );

  await testAsync(
    "insufficient aggregate capacity rejects 4K without artifact",
    async () => {
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        rendererProfile: { resolution: "4k", format: "mp4", quality: "high" },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: `p31b-agg-reject-${Date.now()}`,
        workerLimits: {
          maxAggregateFrameBytes: 1024 * 1024,
        },
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 0);
      assert.equal(result.value.failed, 1);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.canonicalJob.artifact, null);
      assert.equal(
        stored.value.canonicalJob.terminalReason?.reasonId,
        "UNSUPPORTED_CAPABILITY",
      );
    },
  );

  await testAsync("720p sufficient capacity still renders", async () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    const { worker } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: `p31b-720-pass-${Date.now()}`,
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);
    assert.equal(
      result.value.lastEvidence?.rendererBuildId,
      HEADLESS_WORKER_RENDERER_BUILD_ID,
    );
  });

  await testAsync("1080p sufficient capacity still renders", async () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "1080p", format: "mp4", quality: "high" },
    });
    const { worker } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: `p31b-1080-pass-${Date.now()}`,
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);
  });

  await testAsync("4K sufficient capacity still renders", async () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      audioMode: "silent",
      rendererProfile: { resolution: "4k", format: "webm", quality: "high" },
    });
    const { worker } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: `p31b-4k-pass-${Date.now()}`,
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);
    assert.equal(result.value.lastEvidence?.width, 2160);
    assert.equal(result.value.lastEvidence?.height, 3840);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
