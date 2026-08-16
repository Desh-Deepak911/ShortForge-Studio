/**
 * Real rebuilt-Headless decoded certification for centered moving transitions.
 * Run: npm run build:headless-worker && npm run test:smooth-media-transition-cert
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORT_RENDERER_CAPABILITY_CONTINUOUS_INTRA_SCENE_TRANSITIONS,
  isExportManifestV5,
  resolveExportIntraSceneTransitionAtElapsed,
  validateExportManifest,
} from "@/features/export/domain";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildHeadlessVideoMotionReferenceFixture } from "@/features/headless-renderer/worker/testing/build-video-motion-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { probeMedia, runCmd } from "@/verification/video-quality/encodeQualityMeasure";

const PAGE_BUNDLE = join(process.cwd(), "dist/headless-worker/page-render.iife.js");
const OUTPUT_DIR = join(process.cwd(), ".tmp/smooth-media-transition-cert");
const ARTIFACT_PATH = join(OUTPUT_DIR, "headless_720p_centered_fade.mp4");
const EVIDENCE_PATH = join(OUTPUT_DIR, "headless_720p_centered_fade.json");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodedFrameHashes(
  ffmpeg: string,
  videoPath: string,
  startSec: number,
  durationSec: number,
): string[] {
  const output = runCmd(ffmpeg, [
    "-ss",
    startSec.toFixed(3),
    "-t",
    durationSec.toFixed(3),
    "-i",
    videoPath,
    "-map",
    "0:v:0",
    "-f",
    "framemd5",
    "-",
  ]).stdout;
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",").at(-1)?.trim() ?? "")
    .filter(Boolean);
}

function maximumIdenticalRun(values: readonly string[]): number {
  let maximum = values.length > 0 ? 1 : 0;
  let current = maximum;
  for (let index = 1; index < values.length; index += 1) {
    current = values[index] === values[index - 1] ? current + 1 : 1;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

async function main(): Promise<void> {
  console.log("\nsmooth-media-transition decoded certification\n");
  assert.equal(existsSync(PAGE_BUNDLE), true, "run npm run build:headless-worker first");
  const pageBundle = readFileSync(PAGE_BUNDLE);
  const pageText = pageBundle.toString("utf8");
  assert.ok(pageText.includes("continuous-intra-scene-transitions-v1"));
  assert.ok(pageText.includes("centered-continuous-v1"));

  const binaries = resolveNativeFfmpegBinaries();
  assert.equal(binaries.ok, true, binaries.ok ? "" : binaries.message);
  if (!binaries.ok) return;

  const fixture = buildHeadlessVideoMotionReferenceFixture({
    contentDurationMs: 4000,
    rendererProfile: { resolution: "720p", format: "mp4", fps: 30, quality: "high" },
    sourceWidth: 640,
    sourceHeight: 360,
    sourceDurationSec: 8,
    trimStartMs: 0,
    sourcePattern: "testsrc",
    secondSourcePattern: "smptehdbars",
    fitMode: "fill",
    storyTitle: "",
    intraSceneTransition: { effect: "fade", durationMs: 500 },
  });
  const manifest = fixture.manifestV3;
  assert.ok(isExportManifestV5(manifest));
  if (!isExportManifestV5(manifest)) throw new Error("Expected v5 manifest");
  assert.ok(
    manifest.requiredCapabilities.includes(
      EXPORT_RENDERER_CAPABILITY_CONTINUOUS_INTRA_SCENE_TRANSITIONS,
    ),
  );
  assert.equal(validateExportManifest(manifest).ok, true);
  const scene = manifest.scenes[0]!;
  const boundary = scene.mediaTransitions.boundaries[0]!;
  assert.equal(boundary.timingModel, "centered-continuous-v1");
  assert.equal(boundary.overlayStartOffsetMs, 1750);
  assert.equal(boundary.overlayEndOffsetMs, 2250);

  const early = resolveExportIntraSceneTransitionAtElapsed(scene, 1800)!;
  const middle = resolveExportIntraSceneTransitionAtElapsed(scene, 2000)!;
  const late = resolveExportIntraSceneTransitionAtElapsed(scene, 2200)!;
  assert.ok(middle.outgoingItemLocalMs > early.outgoingItemLocalMs);
  assert.ok(late.outgoingItemLocalMs > middle.outgoingItemLocalMs);
  assert.ok(middle.incomingItemLocalMs > early.incomingItemLocalMs);
  assert.ok(late.incomingItemLocalMs > middle.incomingItemLocalMs);

  const seeded = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: "smooth-media-transition-decoded-720p",
  });
  const result = await seeded.worker.processOnce(1);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("Headless render failed");
  assert.equal(result.value.succeeded, 1, JSON.stringify(result));

  const stored = await seeded.stack.jobStore.getByJobIdAndOwner(
    seeded.jobId,
    seeded.ownerId,
  );
  assert.equal(stored.ok, true);
  if (!stored.ok || stored.value.stage !== "canonical") {
    throw new Error("Expected canonical artifact binding");
  }
  const binding = stored.value.artifactObjectBinding;
  assert.ok(binding);
  const opened = await seeded.stack.storage.openOwnedObject(
    binding!.storageLocator,
    seeded.ownerId,
  );
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("Expected rendered artifact bytes");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(ARTIFACT_PATH, opened.value.bytes);
  const probe = probeMedia(binaries.ffprobeExecutable, ARTIFACT_PATH);
  assert.equal(probe.width, 720);
  assert.equal(probe.height, 1280);
  assert.ok(
    Math.abs(
      (probe.durationSec ?? 0) - manifest.project.renderDurationMs / 1000,
    ) <= 1 / 30 + 0.02,
  );
  assert.equal(probe.fps, 30);

  const hashes = decodedFrameHashes(
    binaries.ffmpegExecutable,
    ARTIFACT_PATH,
    1.76,
    0.47,
  );
  const uniqueHashes = new Set(hashes).size;
  const maxIdenticalRun = maximumIdenticalRun(hashes);
  assert.ok(hashes.length >= 14, `expected >=14 decoded frames, got ${hashes.length}`);
  assert.ok(uniqueHashes >= hashes.length - 1, `${uniqueHashes}/${hashes.length} unique`);
  assert.ok(maxIdenticalRun <= 2, `transition froze for ${maxIdenticalRun} decoded frames`);

  const evidence = {
    verdict: "pass",
    artifact: ARTIFACT_PATH,
    artifactSha256: sha256(opened.value.bytes),
    pageBundleSha256: sha256(pageBundle),
    manifestVersion: manifest.version,
    requiredCapability: EXPORT_RENDERER_CAPABILITY_CONTINUOUS_INTRA_SCENE_TRANSITIONS,
    timingModel: boundary.timingModel,
    overlay: {
      startMs: boundary.overlayStartOffsetMs,
      endMs: boundary.overlayEndOffsetMs,
      durationMs: boundary.effectiveDurationMs,
    },
    probe,
    decodedWindow: {
      startSec: 1.76,
      durationSec: 0.47,
      frameCount: hashes.length,
      uniqueHashes,
      maxIdenticalRun,
    },
  };
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  console.log(`  ✓ real rebuilt Headless MP4: ${probe.width}x${probe.height} @ ${probe.fps}fps`);
  console.log(`  ✓ transition window: ${uniqueHashes}/${hashes.length} unique decoded frames`);
  console.log(`  ✓ maximum identical run: ${maxIdenticalRun} frames`);
  console.log(`\nartifact: ${ARTIFACT_PATH}\nevidence: ${EVIDENCE_PATH}\n`);
}

void main();
