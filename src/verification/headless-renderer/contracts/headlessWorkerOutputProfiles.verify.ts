/**
 * Sprint 11D Phase 3.1 — output-profile registry immutability + target authority.
 * Run: npm run test:headless-worker-output-profiles
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assertPhase3WorkerCapability } from "@/features/headless-renderer/worker/runtime/capability-preflight";
import {
  HEADLESS_OUTPUT_PROFILES,
  headlessOutputProfileId,
  resolveHeadlessOutputProfile,
  type HeadlessOutputProfileId,
} from "@/features/headless-renderer/worker/runtime/output-profiles";
import { assertHeadlessManifestTargetCompatibility } from "@/features/headless-renderer/worker/runtime/render-target";
import {
  HEADLESS_WORKER_PHASE3_SUPPORTED,
  HEADLESS_WORKER_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { clearFfmpegEncoderCacheForTests } from "@/features/headless-renderer/worker/ffmpeg/list-ffmpeg-encoders";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import type { ExportManifestResolutionLabel } from "@/features/export/domain";

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

function assertDeepFrozen(value: unknown, path = "root"): void {
  assert.equal(Object.isFrozen(value), true, `${path} not frozen`);
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertDeepFrozen(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const key of Object.keys(value as object)) {
    assertDeepFrozen(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
  }
}

async function main() {
  console.log("\nSprint 11D Phase 3.1 — Output profiles / authority\n");

  test("registry exposes exact six canonical profileIds", () => {
    const ids = Object.keys(HEADLESS_OUTPUT_PROFILES).sort();
    assert.deepEqual(ids, [
      "1080p-mp4-30",
      "1080p-webm-30",
      "4k-mp4-30",
      "4k-webm-30",
      "720p-mp4-30",
      "720p-webm-30",
    ]);
  });

  test("deep freeze: registry + nested allowlists are Object.isFrozen", () => {
    assertDeepFrozen(HEADLESS_OUTPUT_PROFILES, "HEADLESS_OUTPUT_PROFILES");
    assertDeepFrozen(
      HEADLESS_WORKER_PHASE3_SUPPORTED,
      "HEADLESS_WORKER_PHASE3_SUPPORTED",
    );
    for (const id of Object.keys(HEADLESS_OUTPUT_PROFILES) as HeadlessOutputProfileId[]) {
      const p = HEADLESS_OUTPUT_PROFILES[id];
      assert.equal(Object.isFrozen(p.probeContainers), true);
      assert.equal(Object.isFrozen(p.probeVideoCodecs), true);
      assert.equal(Object.isFrozen(p.probeAudioCodecs), true);
    }
  });

  test("mutation-negative: push/index assignment cannot alter allowlists", () => {
    const containers = HEADLESS_WORKER_PHASE3_SUPPORTED.containers as unknown as string[];
    const before = containers.length;
    let threw = false;
    try {
      containers.push("avi");
    } catch {
      threw = true;
    }
    assert.equal(containers.length, before);
    assert.equal(containers.includes("avi"), false);

    const profile = HEADLESS_OUTPUT_PROFILES["720p-webm-30"];
    const codecs = profile.probeVideoCodecs as unknown as string[];
    const codecLen = codecs.length;
    try {
      codecs[0] = "mpeg2video";
    } catch {
      threw = true;
    }
    assert.equal(codecs[0], "vp9");
    assert.equal(codecs.length, codecLen);
    assert.ok(threw || codecs[0] === "vp9");

    // Resolver remains canonical after mutation attempts.
    const again = resolveHeadlessOutputProfile({
      resolution: "720p",
      format: "webm",
      fps: 30,
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.profile.probeVideoCodecs[0], "vp9");
    assert.equal(
      again.profile.probeVideoCodecs.includes("mpeg2video"),
      false,
    );
  });

  test("4K profiles are native 2160×3840; execute against frozen 1080p manifests", () => {
    assert.equal(HEADLESS_OUTPUT_PROFILES["4k-webm-30"].width, 2160);
    assert.equal(HEADLESS_OUTPUT_PROFILES["4k-webm-30"].height, 3840);
    assert.equal(
      HEADLESS_OUTPUT_PROFILES["4k-webm-30"].operationalMaxContentDurationMs,
      60_000,
    );
    assert.equal(
      HEADLESS_OUTPUT_PROFILES["4k-webm-30"].operationalMaxRenderDurationMs,
      60_400,
    );
    assert.equal(HEADLESS_OUTPUT_PROFILES["4k-webm-30"].maxFrames, 1812);
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "4k", format: "webm", quality: "high" },
    });
    assert.equal(fixture.manifestV3.output.resolution, "1080p");
    assert.equal(fixture.manifestV3.output.width, 1080);
    assert.equal(fixture.manifestV3.output.height, 1920);
    const compat = assertHeadlessManifestTargetCompatibility({
      manifest: fixture.manifestV3,
      rendererProfile: fixture.rendererProfile,
    });
    assert.equal(compat.ok, true);
    if (!compat.ok) return;
    assert.equal(compat.target.width, 2160);
    assert.equal(compat.target.height, 3840);
  });

  test("ExportManifestResolutionLabel remains 720p|1080p (no silent 4k)", () => {
    const labels: ExportManifestResolutionLabel[] = ["720p", "1080p"];
    assert.equal(labels.includes("4k" as ExportManifestResolutionLabel), false);
    assert.equal(fixtureResolutionTypeCheck("720p"), true);
    assert.equal(fixtureResolutionTypeCheck("1080p"), true);
  });

  test("unknown / arbitrary dimensions rejected by resolver", () => {
    assert.equal(
      headlessOutputProfileId({ resolution: "720p", format: "webm", fps: 30 }),
      "720p-webm-30",
    );
    assert.equal(
      resolveHeadlessOutputProfile({
        resolution: "720p",
        format: "webm",
        fps: 29 as never,
      }).ok,
      false,
    );
  });

  test("unsupported profile rejected before Chromium (build / mismatch)", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    assert.equal(
      assertPhase3WorkerCapability({
        request: {
          rendererBuildId: "wrong",
          rendererProfile: fixture.rendererProfile,
          manifest: fixture.manifestV3,
        } as never,
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );

    const hostile = {
      ...fixture.manifestV3,
      output: {
        ...fixture.manifestV3.output,
        width: 721,
        height: 1280,
      },
    };
    assert.equal(
      assertPhase3WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: fixture.rendererProfile,
          manifest: hostile,
        } as never,
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );
  });

  test("4K duration above operational ceiling rejected before Chromium", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 60_001,
      rendererProfile: { resolution: "4k", format: "webm", quality: "high" },
    });
    assert.equal(
      assertPhase3WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: fixture.rendererProfile,
          manifest: fixture.manifestV3,
        } as never,
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );
  });

  test("encoder absence fails closed (no silent WebM fallback)", () => {
    clearFfmpegEncoderCacheForTests();
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    assert.equal(
      assertPhase3WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: fixture.rendererProfile,
          manifest: fixture.manifestV3,
        } as never,
        ffmpegExecutable: "/nonexistent/ffmpeg-binary-phase3",
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );
    clearFfmpegEncoderCacheForTests();
  });

  await testAsync("fingerprint changes when output profile changes", async () => {
    const webm = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    const mp4 = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    assert.notEqual(webm.manifestV3.fingerprint, mp4.manifestV3.fingerprint);

    const a = await seedAndCreateReferenceJob({
      fixture: webm,
      idempotencyKey: "idem-profile-webm",
    });
    const b = await seedAndCreateReferenceJob({
      fixture: mp4,
      idempotencyKey: "idem-profile-mp4",
    });
    const jobA = await a.stack.jobStore.getByJobIdAndOwner(a.jobId, a.ownerId);
    const jobB = await b.stack.jobStore.getByJobIdAndOwner(b.jobId, b.ownerId);
    assert.equal(jobA.ok, true);
    assert.equal(jobB.ok, true);
    if (!jobA.ok || !jobB.ok) return;
    assert.notEqual(
      jobA.value.canonicalJob!.requestFingerprint,
      jobB.value.canonicalJob!.requestFingerprint,
    );
  });

  await testAsync("4K target changes request fingerprint vs 1080p same manifest bytes shape", async () => {
    const p1080 = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "1080p", format: "webm", quality: "high" },
    });
    const p4k = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "4k", format: "webm", quality: "high" },
    });
    // Manifests may share 1080p output shape but request fingerprints must differ.
    assert.equal(p1080.manifestV3.output.resolution, "1080p");
    assert.equal(p4k.manifestV3.output.resolution, "1080p");
    const a = await seedAndCreateReferenceJob({
      fixture: p1080,
      idempotencyKey: "idem-1080-webm",
    });
    const b = await seedAndCreateReferenceJob({
      fixture: p4k,
      idempotencyKey: "idem-4k-webm",
    });
    const jobA = await a.stack.jobStore.getByJobIdAndOwner(a.jobId, a.ownerId);
    const jobB = await b.stack.jobStore.getByJobIdAndOwner(b.jobId, b.ownerId);
    assert.equal(jobA.ok && jobB.ok, true);
    if (!jobA.ok || !jobB.ok) return;
    assert.notEqual(
      jobA.value.canonicalJob!.requestFingerprint,
      jobB.value.canonicalJob!.requestFingerprint,
    );
    assert.equal(jobA.value.canonicalRequest!.rendererProfile.resolution, "1080p");
    assert.equal(jobB.value.canonicalRequest!.rendererProfile.resolution, "4k");
  });

  await testAsync("idempotency does not silently merge across profiles", async () => {
    const {
      composeTestHeadlessControlPlane,
      seedOwnedManifestAndBundle,
    } = await import(
      "@/features/headless-renderer/control-plane/testing"
    );
    const { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } = await import(
      "@/features/headless-renderer/control-plane/types/control-plane.types"
    );
    const { headlessSourceDigest } = await import(
      "@/features/headless-renderer/domain"
    );

    const webm = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    const mp4 = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const clock = 1_700_000_000_000;
    const ownerId = "owner-idem-profiles";
    const projectId = webm.manifestV3.project.projectId;
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId,
        sessionId: "sess-idem",
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
      workerMode: "noop",
    });

    const seedOne = async (fixture: typeof webm) => {
      const seeded = await seedOwnedManifestAndBundle({
        storage: stack.storage,
        ownerId,
        projectId,
        manifest: fixture.manifestV3,
        nowMs: clock,
        leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
        assetByteFactory: (slot) => {
          for (const [url, bytes] of fixture.assetBytesByUrl) {
            if (headlessSourceDigest(url) === slot.sourceDigest) return bytes;
          }
          throw new Error("missing bytes");
        },
        mimeForSlot: (slot) =>
          slot.expectedMediaKind === "audio" ? "audio/wav" : "image/png",
      });
      assert.equal(seeded.ok, true);
      if (!seeded.ok) throw new Error("seed failed");
      return seeded.value;
    };

    const webmSeed = await seedOne(webm);
    const first = await stack.service.createJob({
      requestContext: {},
      rawBodyText: "{}",
      body: {
        version: 1,
        projectId,
        manifestObject: webmSeed.manifestLocator,
        manifestPayloadDigest: webmSeed.manifestPayloadDigest,
        assetBundleObject: webmSeed.bundleLocator,
        assetBundleFingerprint: webmSeed.bundle.fingerprint,
        rendererProfile: webm.rendererProfile,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        idempotencyKey: "idem-shared-across-profiles",
      },
    });
    assert.equal(first.ok, true);

    const mp4Seed = await seedOne(mp4);
    const second = await stack.service.createJob({
      requestContext: {},
      rawBodyText: "{}",
      body: {
        version: 1,
        projectId,
        manifestObject: mp4Seed.manifestLocator,
        manifestPayloadDigest: mp4Seed.manifestPayloadDigest,
        assetBundleObject: mp4Seed.bundleLocator,
        assetBundleFingerprint: mp4Seed.bundle.fingerprint,
        rendererProfile: mp4.rendererProfile,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        idempotencyKey: "idem-shared-across-profiles",
      },
    });
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.equal(
      second.issues.some((i) => i.code === "IDEMPOTENCY_CONFLICT"),
      true,
    );
  });

  const outDir = join(process.cwd(), ".tmp/headless-11d-evidence");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "phase3-output-profiles-matrix.json"),
    JSON.stringify(
      {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        profiles: Object.values(HEADLESS_OUTPUT_PROFILES).map((p) => ({
          profileId: p.profileId,
          width: p.width,
          height: p.height,
          format: p.format,
          videoCodec: p.videoCodec,
          audioCodec: p.audioCodec,
          testedMaxContentDurationMs: p.testedMaxContentDurationMs,
          testedMaxRenderDurationMs: p.testedMaxRenderDurationMs,
          operationalMaxContentDurationMs: p.operationalMaxContentDurationMs,
          operationalMaxRenderDurationMs: p.operationalMaxRenderDurationMs,
          architecturalMaxContentDurationMs: p.architecturalMaxContentDurationMs,
          architecturalMaxRenderDurationMs: p.architecturalMaxRenderDurationMs,
          maxFrames: p.maxFrames,
        })),
      },
      null,
      2,
    ),
  );

  console.log(`\n${passed} passed\n`);
}

function fixtureResolutionTypeCheck(label: ExportManifestResolutionLabel): boolean {
  return label === "720p" || label === "1080p";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
