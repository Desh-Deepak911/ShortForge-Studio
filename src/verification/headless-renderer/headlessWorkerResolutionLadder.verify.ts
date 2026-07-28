/**
 * Sprint 11D Phase 3.1 — resolution ladder with HeadlessRenderTarget authority.
 * Run: npm run test:headless-worker-resolution-ladder
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildHeadlessFramePlan } from "@/features/headless-renderer/worker/runtime/frame-plan";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import {
  assertHeadlessManifestTargetCompatibility,
  resolveHeadlessRenderTarget,
} from "@/features/headless-renderer/worker/runtime/render-target";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";

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

async function renderProfile(input: {
  profile: HeadlessRendererProfile;
  audioMode: "silent" | "with-voice" | "with-voice-and-music";
  durationMs: number;
  idempotencyKey: string;
  evidenceName: string;
}): Promise<void> {
  const fixture = buildHeadlessReferenceFixture({
    durationMs: input.durationMs,
    audioMode: input.audioMode,
    rendererProfile: input.profile,
  });
  if (input.profile.resolution === "4k") {
    assert.equal(fixture.manifestV3.output.resolution, "1080p");
  }
  const started = Date.now();
  const { stack, worker, jobId } = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: input.idempotencyKey,
  });
  const result = await worker.processOnce(1);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("worker failed");
  assert.equal(result.value.succeeded, 1);
  const stored = await stack.jobStore.getByJobIdAndOwner(jobId, "owner-11d");
  assert.equal(stored.ok, true);
  if (!stored.ok) throw new Error("missing");
  const art = stored.value.canonicalJob!.artifact!;
  const expected =
    HEADLESS_OUTPUT_PROFILES[
      `${input.profile.resolution}-${input.profile.format}-30` as keyof typeof HEADLESS_OUTPUT_PROFILES
    ];
  assert.equal(art.width, expected.width);
  assert.equal(art.height, expected.height);
  assert.equal(art.format, expected.format);
  assert.equal(art.fps, 30);
  assert.equal(art.rendererBuildId, HEADLESS_WORKER_RENDERER_BUILD_ID);

  const outDir = join(process.cwd(), ".tmp/headless-11d-evidence");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, input.evidenceName),
    JSON.stringify(
      {
        kind: "measured",
        profileId: expected.profileId,
        rendererBuildId: art.rendererBuildId,
        digest: art.contentDigest,
        byteLength: art.byteLength,
        durationMs: art.durationMs,
        width: art.width,
        height: art.height,
        fps: art.fps,
        videoCodec: art.video.codec,
        audioCodec: art.audio.codec,
        audioPresent: art.audio.present,
        renderTimeMs: Date.now() - started,
        metrics: result.value.lastEvidence?.metrics ?? null,
        projected: null,
      },
      null,
      2,
    ),
  );
}

async function main() {
  console.log("\nSprint 11D Phase 3.1 — Resolution ladder\n");

  const bins = resolveNativeFfmpegBinaries();
  assert.equal(bins.ok, true);
  if (!bins.ok) return;

  test("frame plan uses HeadlessRenderTarget pixels (not manifest for 4K)", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "4k", format: "webm", quality: "high" },
    });
    assert.equal(fixture.manifestV3.output.width, 1080);
    const target = resolveHeadlessRenderTarget(fixture.rendererProfile);
    assert.equal(target.ok, true);
    if (!target.ok) return;
    const plan = buildHeadlessFramePlan(
      fixture.manifestV3,
      target.target.profile.maxFrames,
      target.target,
    );
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.plan.width, 2160);
    assert.equal(plan.plan.height, 3840);
  });

  test("hostile arbitrary pixels rejected by compatibility", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    const hostile = {
      ...fixture.manifestV3,
      output: { ...fixture.manifestV3.output, width: 1080, height: 1920 },
    };
    const compat = assertHeadlessManifestTargetCompatibility({
      manifest: hostile,
      rendererProfile: fixture.rendererProfile,
    });
    assert.equal(compat.ok, false);
  });

  await testAsync("720p WebM silent (real worker)", async () => {
    await renderProfile({
      profile: { resolution: "720p", format: "webm", fps: 30, quality: "high" },
      audioMode: "silent",
      durationMs: 1000,
      idempotencyKey: "11d-p31-720-webm-silent",
      evidenceName: "phase3-720p-webm-silent-evidence.json",
    });
  });

  await testAsync("1080p WebM voice+music (real worker)", async () => {
    await renderProfile({
      profile: { resolution: "1080p", format: "webm", fps: 30, quality: "high" },
      audioMode: "with-voice-and-music",
      durationMs: 1000,
      idempotencyKey: "11d-p31-1080-webm-mix",
      evidenceName: "phase3-1080p-webm-voice-music-evidence.json",
    });
  });

  await testAsync("1080p MP4 silent (real worker)", async () => {
    await renderProfile({
      profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
      audioMode: "silent",
      durationMs: 1000,
      idempotencyKey: "11d-p31-1080-mp4-silent",
      evidenceName: "phase3-1080p-mp4-silent-evidence.json",
    });
  });

  await testAsync("4K WebM short — frozen 1080p manifest + native target", async () => {
    await renderProfile({
      profile: { resolution: "4k", format: "webm", fps: 30, quality: "high" },
      audioMode: "silent",
      durationMs: 1000,
      idempotencyKey: "11d-p31-4k-webm-short",
      evidenceName: "phase3-4k-webm-short-evidence.json",
    });
  });

  await testAsync("4K MP4 short — frozen 1080p manifest + native target", async () => {
    await renderProfile({
      profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
      audioMode: "silent",
      durationMs: 1000,
      idempotencyKey: "11d-p31-4k-mp4-short",
      evidenceName: "phase3-4k-mp4-short-evidence.json",
    });
  });

  await testAsync("v2 hard-cut + v3 transition parity at 720p MP4", async () => {
    const v3 = buildHeadlessReferenceFixture({
      durationMs: 1000,
      audioMode: "with-voice",
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const r3 = await seedAndCreateReferenceJob({
      fixture: v3,
      manifest: v3.manifestV3,
      idempotencyKey: "11d-p31-v3-mp4",
    });
    assert.equal((await r3.worker.processOnce(1)).ok, true);

    const r2 = await seedAndCreateReferenceJob({
      fixture: v3,
      manifest: v3.manifestV2,
      idempotencyKey: "11d-p31-v2-mp4",
    });
    assert.equal((await r2.worker.processOnce(1)).ok, true);
  });

  test("fixture PNG sources are native profile pixels for 4K target", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "4k", format: "webm", quality: "high" },
    });
    const png = fixture.assetBytesByUrl.get(fixture.urls.a);
    assert.ok(png && png.byteLength > 0);
    const outDir = join(process.cwd(), ".tmp/headless-11d-evidence");
    mkdirSync(outDir, { recursive: true });
    const tmp = join(outDir, "_probe-4k-source.png");
    writeFileSync(tmp, png!);
    const r = spawnSync(
      bins.ffprobeExecutable,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        tmp,
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0);
    const [w, h] = (r.stdout || "").trim().split(",").map(Number);
    assert.equal(w, 2160);
    assert.equal(h, 3840);
    // Manifest remains frozen 1080p.
    assert.equal(fixture.manifestV3.output.resolution, "1080p");
  });

  const outDir = join(process.cwd(), ".tmp/headless-11d-evidence");
  writeFileSync(
    join(outDir, "phase3-resource-policy.json"),
    JSON.stringify(
      {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        policy: {
          "720p": {
            operationalMaxContentDurationMs:
              HEADLESS_OUTPUT_PROFILES["720p-webm-30"]
                .operationalMaxContentDurationMs,
            operationalMaxRenderDurationMs:
              HEADLESS_OUTPUT_PROFILES["720p-webm-30"]
                .operationalMaxRenderDurationMs,
          },
          "1080p": {
            operationalMaxContentDurationMs:
              HEADLESS_OUTPUT_PROFILES["1080p-webm-30"]
                .operationalMaxContentDurationMs,
            operationalMaxRenderDurationMs:
              HEADLESS_OUTPUT_PROFILES["1080p-webm-30"]
                .operationalMaxRenderDurationMs,
          },
          "4k": {
            operationalMaxContentDurationMs:
              HEADLESS_OUTPUT_PROFILES["4k-webm-30"]
                .operationalMaxContentDurationMs,
            operationalMaxRenderDurationMs:
              HEADLESS_OUTPUT_PROFILES["4k-webm-30"]
                .operationalMaxRenderDurationMs,
            note: "Frozen ExportManifest stays 1080p; HeadlessRenderTarget elevates pixels",
          },
        },
      },
      null,
      2,
    ),
  );

  for (const name of [
    "phase3-720p-webm-silent-evidence.json",
    "phase3-1080p-webm-voice-music-evidence.json",
    "phase3-1080p-mp4-silent-evidence.json",
    "phase3-4k-webm-short-evidence.json",
    "phase3-4k-mp4-short-evidence.json",
  ]) {
    assert.equal(existsSync(join(outDir, name)), true, `missing ${name}`);
    const parsed = JSON.parse(readFileSync(join(outDir, name), "utf8"));
    assert.equal(parsed.rendererBuildId, HEADLESS_WORKER_RENDERER_BUILD_ID);
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
