/**
 * Sprint 11E Phase 2E.2D.8A — Fly render live readiness authority.
 * Run: npm run test:headless-fly-render-live-readiness-authority
 */

import assert from "node:assert/strict";

import {
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";

import {
  FLY_RENDER_LIVE_READINESS_MAX_LATEST_HEARTBEAT_AGE_MS,
  classifyFlyRenderLiveMachineReadiness,
  classifyFlyRenderLiveOperationalHeartbeat,
} from "../fly-render-live/fly-render-live-readiness";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8A — Fly render live readiness authority\n",
  );

  test("verify=1 render=1 iad spec passes machine readiness", () => {
    const cls = classifyFlyRenderLiveMachineReadiness({
      verifyCount: 1,
      renderCount: 1,
      otherCount: 0,
      verifyRegion: "iad",
      renderRegion: "iad",
      verifyCpuKind: "shared",
      verifyCpus: 1,
      verifyMemoryMb: 2048,
      renderCpuKind: "performance",
      renderCpus: 4,
      renderMemoryMb: 8192,
      verifyImageDigestSha256: resolveCurrentFlyStagingAcceptedImageDigestSha256(),
      renderImageDigestSha256: resolveCurrentFlyStagingAcceptedImageDigestSha256(),
      verifyMachineId: "abcd1234abcd1234",
      renderMachineId: "efgh5678efgh5678",
      verifyMachineState: "started",
      renderMachineState: "started",
    });
    assert.equal(cls.ok, true);
  });

  test("image mismatch rejected", () => {
    const cls = classifyFlyRenderLiveMachineReadiness({
      verifyCount: 1,
      renderCount: 1,
      otherCount: 0,
      verifyRegion: "iad",
      renderRegion: "iad",
      verifyCpuKind: "shared",
      verifyCpus: 1,
      verifyMemoryMb: 2048,
      renderCpuKind: "performance",
      renderCpus: 4,
      renderMemoryMb: 8192,
      verifyImageDigestSha256: "a".repeat(64),
      renderImageDigestSha256: "b".repeat(64),
      verifyMachineId: "abcd1234abcd1234",
      renderMachineId: "efgh5678efgh5678",
      verifyMachineState: "started",
      renderMachineState: "started",
    });
    assert.equal(cls.ok, false);
    if (!cls.ok) assert.equal(cls.failClass, "image_mismatch");
  });

  test("operational heartbeat accepted when startup logs expired", () => {
    const now = 1_700_000_000_000;
    const cls = classifyFlyRenderLiveOperationalHeartbeat({
      nowMs: now,
      startupLogRetention: "expired",
      verifyMachineId: "abcd1234abcd1234",
      renderMachineId: "efgh5678efgh5678",
      events: [
        {
          name: "hosted.loop.heartbeat",
          atMs: now - 10_000,
          action: "dispatch_sweep",
        },
      ],
    });
    assert.equal(cls.ok, true);
    if (cls.ok) assert.equal(cls.path, "operational_heartbeat");
  });

  test("stale heartbeat rejected", () => {
    const now = 1_700_000_000_000;
    const cls = classifyFlyRenderLiveOperationalHeartbeat({
      nowMs: now,
      startupLogRetention: "expired",
      verifyMachineId: "abcd1234abcd1234",
      renderMachineId: "efgh5678efgh5678",
      events: [
        {
          name: "hosted.loop.heartbeat",
          atMs: now - FLY_RENDER_LIVE_READINESS_MAX_LATEST_HEARTBEAT_AGE_MS - 1,
          action: "render_complete",
        },
      ],
    });
    assert.equal(cls.ok, false);
    if (!cls.ok) assert.equal(cls.failClass, "stale_heartbeat");
  });

  test("startup direct path when hosted.loop.started present", () => {
    const now = 1_700_000_000_000;
    const cls = classifyFlyRenderLiveOperationalHeartbeat({
      nowMs: now,
      startupLogRetention: "present",
      verifyMachineId: "abcd1234abcd1234",
      renderMachineId: "efgh5678efgh5678",
      events: [
        { name: "hosted.loop.started", atMs: now - 1000, action: null },
      ],
    });
    assert.equal(cls.ok, true);
    if (cls.ok) assert.equal(cls.path, "startup_direct");
  });

  console.log(`\n${passed} passed\n`);
}

main();
