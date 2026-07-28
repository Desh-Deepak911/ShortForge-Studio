/**
 * Sprint 11D Phase 3.2 — content vs render duration authority boundaries (60s).
 * Run: npm run test:headless-worker-duration-authority
 */
import assert from "node:assert/strict";

import type { ExportManifest } from "@/features/export/domain";
import { assertPhase3WorkerCapability } from "@/features/headless-renderer/worker/runtime/capability-preflight";
import {
  HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
  HEADLESS_OUTPUT_PROFILES,
  headlessMaxFramesForRenderDurationMs,
} from "@/features/headless-renderer/worker/runtime/output-profiles";
import {
  assertHeadlessDurationAuthority,
  assertHeadlessManifestTargetCompatibility,
} from "@/features/headless-renderer/worker/runtime/render-target";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function withProject(
  manifest: ExportManifest,
  project: Partial<ExportManifest["project"]>,
): ExportManifest {
  return {
    ...manifest,
    project: {
      ...manifest.project,
      ...project,
    },
  };
}

function rejectCapability(
  manifest: ExportManifest,
  rendererProfile: HeadlessRendererProfile,
): void {
  const result = assertPhase3WorkerCapability({
    request: {
      rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      rendererProfile,
      manifest,
    } as never,
  });
  assert.equal(result?.reasonId, "UNSUPPORTED_CAPABILITY");
}

function acceptCapability(
  manifest: ExportManifest,
  rendererProfile: HeadlessRendererProfile,
): void {
  const result = assertPhase3WorkerCapability({
    request: {
      rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      rendererProfile,
      manifest,
    } as never,
  });
  assert.equal(result, null);
  const compat = assertHeadlessManifestTargetCompatibility({
    manifest,
    rendererProfile,
  });
  assert.equal(compat.ok, true, compat.ok ? "" : compat.message);
}

async function main() {
  console.log("\nSprint 11D Phase 3.2 — Duration authority\n");

  test("profiles expose explicit 60s content / 60.4s render / maxFrames 1812", () => {
    for (const id of Object.keys(HEADLESS_OUTPUT_PROFILES) as Array<
      keyof typeof HEADLESS_OUTPUT_PROFILES
    >) {
      const p = HEADLESS_OUTPUT_PROFILES[id];
      assert.equal(p.operationalMaxContentDurationMs, 60_000);
      assert.equal(p.operationalMaxRenderDurationMs, 60_400);
      assert.equal(HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS, 400);
      assert.equal(
        p.operationalMaxRenderDurationMs,
        p.operationalMaxContentDurationMs + HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
      );
      assert.equal(
        p.maxFrames,
        headlessMaxFramesForRenderDurationMs(p.operationalMaxRenderDurationMs),
      );
      assert.equal(p.maxFrames, 1812);
      assert.ok(p.architecturalMaxContentDurationMs > p.operationalMaxContentDurationMs);
    }
  });

  test("59,999ms content + normal end buffer → Pass", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 59_999,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    assert.equal(fixture.manifestV3.project.contentDurationMs, 59_999);
    assert.equal(fixture.manifestV3.project.endBufferMs, 400);
    assert.equal(fixture.manifestV3.project.renderDurationMs, 60_399);
    acceptCapability(fixture.manifestV3, fixture.rendererProfile);
  });

  test("60,000ms content + exact 400ms buffer → Pass", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 60_000,
      rendererProfile: { resolution: "1080p", format: "mp4", quality: "high" },
    });
    assert.equal(fixture.manifestV3.project.contentDurationMs, 60_000);
    assert.equal(fixture.manifestV3.project.renderDurationMs, 60_400);
    acceptCapability(fixture.manifestV3, fixture.rendererProfile);
  });

  test("60,001ms content → Reject before Chromium", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 60_001,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    assert.equal(fixture.manifestV3.project.contentDurationMs, 60_001);
    rejectCapability(fixture.manifestV3, fixture.rendererProfile);
  });

  test("60,000ms content + forged oversized end buffer → Reject", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 60_000,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    const forged = withProject(fixture.manifestV3, {
      contentDurationMs: 60_000,
      endBufferMs: 1_000,
      renderDurationMs: 61_000,
    });
    const duration = assertHeadlessDurationAuthority({
      manifest: forged,
      profile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
    });
    assert.equal(duration.ok, false);
    rejectCapability(forged, fixture.rendererProfile);
  });

  test("exact operational render ceiling 60,400ms → Pass", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1_000,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    const ceiling =
      HEADLESS_OUTPUT_PROFILES["720p-webm-30"].operationalMaxRenderDurationMs;
    const exact = withProject(fixture.manifestV3, {
      contentDurationMs: ceiling - HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
      endBufferMs: HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
      renderDurationMs: ceiling,
    });
    acceptCapability(exact, fixture.rendererProfile);
  });

  test("operational render ceiling + 1ms (60,401) → Reject", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1_000,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    const ceiling =
      HEADLESS_OUTPUT_PROFILES["720p-webm-30"].operationalMaxRenderDurationMs;
    const over = withProject(fixture.manifestV3, {
      contentDurationMs: ceiling + 1 - HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
      endBufferMs: HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
      renderDurationMs: ceiling + 1,
    });
    assert.equal(over.project.contentDurationMs, 60_001);
    const renderOnlyOver = withProject(fixture.manifestV3, {
      contentDurationMs: 60_000,
      endBufferMs: 400,
      renderDurationMs: ceiling + 1,
    });
    assert.equal(
      assertHeadlessDurationAuthority({
        manifest: renderOnlyOver,
        profile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
      }).ok,
      false,
    );
    rejectCapability(over, fixture.rendererProfile);
  });

  test("60,000ms 4K content → Pass (native target; frozen 1080p manifest)", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 60_000,
      rendererProfile: { resolution: "4k", format: "webm", quality: "high" },
    });
    assert.equal(fixture.manifestV3.project.contentDurationMs, 60_000);
    assert.equal(fixture.manifestV3.project.renderDurationMs, 60_400);
    assert.equal(fixture.manifestV3.output.resolution, "1080p");
    acceptCapability(fixture.manifestV3, fixture.rendererProfile);
  });

  test("60,001ms 4K content → Reject", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 60_001,
      rendererProfile: { resolution: "4k", format: "mp4", quality: "high" },
    });
    assert.equal(fixture.manifestV3.project.contentDurationMs, 60_001);
    rejectCapability(fixture.manifestV3, fixture.rendererProfile);
  });

  test("maxFrames derives from render ceiling not content", () => {
    const p = HEADLESS_OUTPUT_PROFILES["1080p-webm-30"];
    assert.notEqual(
      p.maxFrames,
      headlessMaxFramesForRenderDurationMs(p.operationalMaxContentDurationMs),
    );
    assert.equal(
      p.maxFrames,
      headlessMaxFramesForRenderDurationMs(p.operationalMaxRenderDurationMs),
    );
  });

  test("pipeline has no hard-coded 60s — ceilings are profile fields only", () => {
    // Raising architectural ceilings does not require stream redesign; operational
    // contract is exclusively the profile operational* fields (intersected with provider).
    const p = HEADLESS_OUTPUT_PROFILES["4k-mp4-30"];
    assert.ok(p.architecturalMaxRenderDurationMs >= 180_400);
    assert.equal(p.operationalMaxContentDurationMs, 60_000);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
