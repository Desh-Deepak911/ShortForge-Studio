/**
 * Production-bundle Fit-with-background smoke (uses rebuilt dist/headless-worker).
 * Run: npm run test:fit-with-background-production-bundle
 *
 * Does not contact providers. Requires prior `npm run build:headless-worker`.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
  isExportManifestV5,
  validateExportManifest,
} from "@/features/export/domain";
import { prepareExportFromManifest } from "@/features/export/runtime/prepare-export-from-manifest";
import { HEADLESS_WORKER_PHASE3_SUPPORTED } from "@/features/headless-renderer/worker/runtime/worker-types";
import { assertPhase3WorkerCapability } from "@/features/headless-renderer/worker/runtime/capability-preflight";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessVideoMotionReferenceFixture } from "@/features/headless-renderer/worker/testing/build-video-motion-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";

const PAGE_BUNDLE = "dist/headless-worker/page-render.iife.js";
const HOSTED_WORKER = "dist/headless-worker/hosted-worker.js";
const BUILD_INFO = "dist/headless-worker/BUILD_INFO.json";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function sha256File(relativePath: string): string {
  const full = join(process.cwd(), relativePath);
  assert.equal(existsSync(full), true, `missing ${relativePath} — run npm run build:headless-worker`);
  return createHash("sha256").update(readFileSync(full)).digest("hex");
}

function readBundle(): string {
  return readFileSync(join(process.cwd(), PAGE_BUNDLE), "utf8");
}

function unsupportedRequiredCapabilities(
  required: readonly string[],
  supported: readonly string[],
): boolean {
  return required.some((capability) => !supported.includes(capability));
}

async function main(): Promise<void> {
  console.log("\nFit-with-background production-bundle smoke\n");

  await test("dist/headless-worker artifacts exist (gitignored, CI-built)", () => {
    assert.ok(existsSync(join(process.cwd(), PAGE_BUNDLE)));
    assert.ok(existsSync(join(process.cwd(), HOSTED_WORKER)));
    assert.ok(existsSync(join(process.cwd(), BUILD_INFO)));
    const pageSha = sha256File(PAGE_BUNDLE);
    const info = JSON.parse(readFileSync(join(process.cwd(), BUILD_INFO), "utf8")) as {
      pageArtifact?: string;
      imageClass?: string;
    };
    assert.equal(info.pageArtifact, "page-render.iife.js");
    assert.equal(info.imageClass, "deployable_worker");
    assert.equal(pageSha.length, 64);
  });

  await test("rebuilt page IIFE contains v5 Fit-with-background surface", () => {
    const bundle = readBundle();
    for (const needle of [
      "media-background-treatment-blurred-fill-v1",
      "blurred_fill",
      "fitWithBlurredBackgroundEnabled",
      "backgroundTreatment",
      "drawFitWithBlurredBackgroundLayers",
      "FIT_BACKGROUND_OFFSCREEN_MAX_WIDTH",
      "fit-with-background: blur unavailable",
      "EXPORT_MANIFEST_V5_VERSION",
    ] as const) {
      assert.ok(bundle.includes(needle), `missing in page IIFE: ${needle}`);
    }
  });

  await test("capable worker advertises blurred-fill capability", () => {
    assert.ok(
      (HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities as readonly string[]).includes(
        EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
      ),
    );
  });

  const fixture = buildHeadlessVideoMotionReferenceFixture({
    contentDurationMs: 600,
    rendererProfile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceDurationSec: 1,
    trimStartMs: 0,
    sourcePattern: "smptehdbars",
    fitMode: "fit",
    zoom: 1,
    backgroundTreatment: "blurred_fill",
  });

  await test("Fit-with-background freezes v5 + required capability", () => {
    assert.ok(isExportManifestV5(fixture.manifestV3));
    assert.deepEqual(fixture.manifestV3.requiredCapabilities, [
      EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
    ]);
    const media = fixture.manifestV3.scenes[0]?.media;
    assert.ok(media && media.type !== "placeholder");
    if (media && media.type !== "placeholder") {
      assert.equal(media.backgroundTreatment, "blurred_fill");
      assert.equal(media.fitMode, "fit");
    }
    assert.equal(validateExportManifest(fixture.manifestV3).ok, true);
  });

  await test("prepare hydrates treatment only when capability present", () => {
    const plan = prepareExportFromManifest(fixture.manifestV3);
    assert.equal(plan.fitWithBlurredBackgroundEnabled, true);
    const media = plan.scenes[0]?.media;
    assert.ok(media && media.type !== "placeholder");
    if (media && media.type !== "placeholder") {
      assert.equal(media.backgroundTreatment, "blurred_fill");
    }
  });

  await test("intentionally incapable supported-set rejects blurred-fill requirement", () => {
    const required = [
      EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
    ];
    const capable = HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities as readonly string[];
    const incapable = capable.filter(
      (capability) =>
        capability !== EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
    );
    assert.equal(unsupportedRequiredCapabilities(required, capable), false);
    assert.equal(unsupportedRequiredCapabilities(required, incapable), true);
  });

  await test("worker capability preflight accepts Fit-with-background v5 job", () => {
    const failure = assertPhase3WorkerCapability({
      request: {
        version: 1,
        ownership: { ownerId: "owner-bundle", projectId: "project-bundle" },
        manifest: fixture.manifestV3,
        rendererProfile: fixture.rendererProfile,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        assetBundleFingerprint: "hab:sha256:0",
        requestFingerprint: "hrr:sha256:0",
        renderJobFingerprint: "hrj:sha256:0",
        manifestFingerprint: fixture.manifestV3.fingerprint,
        idempotencyKey: "bundle-cap",
        createdAtMs: 1,
      } as never,
    });
    assert.equal(failure, null);
  });

  await test("rebuilt production page path renders short 1080p Fit-with-background MP4", async () => {
    const seeded = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "fit-bg-production-bundle-1080",
    });
    const result = await seeded.worker.processOnce(1);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) throw new Error("worker processOnce failed");
    assert.equal(result.value.succeeded, 1, JSON.stringify(result));
    assert.ok(result.value.lastEvidence);
    assert.equal(result.value.lastEvidence?.width, 1080);
    assert.equal(result.value.lastEvidence?.height, 1920);
    assert.equal(result.value.lastEvidence?.videoCodec, "h264");

    const evidenceDir = join(process.cwd(), ".tmp/fit-with-background-cert");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      join(evidenceDir, "production-bundle-1080-fit-with-background.json"),
      JSON.stringify(
        {
          kind: "production-bundle-smoke",
          pageBundleSha256: sha256File(PAGE_BUNDLE),
          buildInfoSha256: sha256File(BUILD_INFO),
          evidence: result.value.lastEvidence,
        },
        null,
        2,
      ),
    );
  });

  console.log(`\nFit-with-background production-bundle smoke: ${passed} PASS\n`);
}

void main();
