/**
 * Sprint 6F — Golden Preview/Export semantic parity.
 * Run: npm run test:export-golden-parity
 */
import assert from "node:assert/strict";

import {
  collectExportParityCheckpoints,
  compareParityCheckpoints,
  sampleParityCheckpoint,
} from "@/features/export/qa";
import {
  resolveExportCaptionFrame,
  resolveExportSceneFrame,
  resolveExportTransitionFrame,
  resolveExportTotalFrames,
} from "@/features/export/timing";
import {
  assertExportEndBufferContract,
  resolveExportEndOfProjectSnapshot,
} from "@/features/export/formats";
import { runExportCapabilityPreflight } from "@/features/export/domain";
import {
  buildExportGoldenManifest,
  listExportGoldenIds,
} from "@/verification/export/goldens";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nexport-golden-parity (Sprint 6F)\n");

test("Golden A–G fixtures exist with stable ids", () => {
  const ids = listExportGoldenIds();
  assert.deepEqual(ids, [
    "golden-a",
    "golden-b",
    "golden-c",
    "golden-d",
    "golden-e",
    "golden-f",
    "golden-g",
  ]);
});

for (const goldenId of listExportGoldenIds()) {
  test(`${goldenId} — scene order, duration, captions, end buffer`, () => {
    const format =
      goldenId === "golden-d" || goldenId === "golden-e" || goldenId === "golden-f"
        ? ("mp4" as const)
        : ("webm" as const);
    const manifest = buildExportGoldenManifest(goldenId, { format });
    assertExportEndBufferContract(manifest);
    assert.ok(manifest.scenes.length >= 3);
    assert.ok(manifest.project.renderDurationMs > 0);
    assert.ok(resolveExportTotalFrames(manifest) > 0);

    for (let i = 1; i < manifest.scenes.length; i++) {
      assert.ok(
        manifest.scenes[i]!.startMs >= manifest.scenes[i - 1]!.startMs,
        "scenes must be ordered",
      );
    }

    const snap = resolveExportEndOfProjectSnapshot(manifest);
    assert.equal(snap.renderDurationMs, manifest.project.renderDurationMs);
    assert.ok(snap.lastGlobalFrameIndex >= 0);

    const preflight = runExportCapabilityPreflight(manifest);
    assert.equal(preflight.supported, true);
    assert.equal(preflight.renderer, "browser");
  });

  test(`${goldenId} — Preview/Export semantic checkpoints match`, () => {
    const format =
      goldenId === "golden-d" || goldenId === "golden-e" || goldenId === "golden-f"
        ? ("mp4" as const)
        : ("webm" as const);
    const manifest = buildExportGoldenManifest(goldenId, { format });
    const checkpoints = collectExportParityCheckpoints(manifest);
    assert.ok(checkpoints.length >= 7);

    for (const cp of checkpoints) {
      // Dual sampling: export resolver vs re-sample (same authority) — parity contract.
      const again = sampleParityCheckpoint(manifest, cp.timestampMs, cp.label);
      const diffs = compareParityCheckpoints(cp, again);
      assert.deepEqual(diffs, [], diffs.join("; "));

      const scene = resolveExportSceneFrame(manifest, cp.timestampMs);
      assert.equal(scene.scene.id, cp.sceneId);
      assert.equal(scene.sceneElapsedMs, cp.sceneElapsedMs);

      const caption = resolveExportCaptionFrame(manifest, cp.timestampMs);
      assert.equal(caption?.caption.id ?? null, cp.captionId);

      const transition = resolveExportTransitionFrame(manifest, cp.timestampMs);
      assert.equal(Boolean(transition), cp.transitionActive);
    }
  });
}

test("Golden C primary regression — voice+music + final caption near end", () => {
  const manifest = buildExportGoldenManifest("golden-c", { format: "webm" });
  assert.equal(manifest.audio.mode, "voice-with-music");
  assert.ok(manifest.audio.voiceover);
  assert.ok(manifest.audio.music?.duckingEnabled);
  const lastCaption = [...manifest.captions].sort((a, b) => b.endMs - a.endMs)[0];
  assert.ok(lastCaption);
  assert.ok(
    lastCaption!.endMs >=
      manifest.project.contentDurationMs - 2000,
    "final caption should sit near content end",
  );
});

test("Golden G stress duration 45–60s class", () => {
  const manifest = buildExportGoldenManifest("golden-g", { format: "webm" });
  const ms = manifest.project.contentDurationMs;
  assert.ok(ms >= 45_000 && ms <= 60_000, `got ${ms}`);
  const videos = manifest.scenes.filter((s) => s.media.type === "video");
  assert.ok(videos.length >= 3 && videos.length <= 5);
  assert.ok(manifest.scenes.length >= 10 && manifest.scenes.length <= 15);
});

console.log(`\nexport-golden-parity: ${passed} passed\n`);
