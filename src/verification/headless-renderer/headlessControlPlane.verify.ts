/**
 * Sprint 11C.1A — Dispatch + production isolation coherence.
 * Run: npm run test:headless-control-plane
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildExportManifest,
  buildExportManifestFingerprint,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_V2,
  EXPORT_RENDERER_CONTRACT_VERSION,
  type ExportEnvironmentSnapshot,
  type ExportManifest,
  type ExportManifestV2,
  type ExportManifestV4,
  isExportManifestV4,
  isExportSceneManifestV3,
  validateExportManifest,
} from "@/features/export/domain";
import type { HeadlessRenderJobV1 } from "@/features/headless-renderer/domain";
import {
  composeProductionHeadlessControlPlane,
  HEADLESS_JOB_REQUEST_MAX_BYTES,
  HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS,
  headlessMinExpiryDeadline,
  isAssetsMaterializeRouteHeadlessAuthority,
  parseHeadlessCreateJobTransport,
  rejectMediaPayloadInTransportBody,
  rejectUnrestrictedRemoteFetchAuthority,
  stableHeadlessDeliveryId,
  type HeadlessCreateJobTransportV1,
  type HeadlessPublicJobViewV1,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  memoryStorageLocatorKey,
  seedOwnedJsonObject,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

let passed = 0;
const clock = 1_700_000_000_000;

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

function fixStory(imageUrl = "https://example.com/a.jpg"): FootieScript {
  return syncFootieScript({
    title: "11C.1 Control Plane",
    narration: "Hello world narration for export.",
    totalDuration: 6,
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 6000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        subtitle: "Hello",
        captionMode: "generated",
        media: {
          type: "image",
          url: imageUrl,
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
      {
        id: "scene-2",
        start: 3,
        end: 6,
        duration: 3,
        startMs: 3000,
        endMs: 6000,
        durationMs: 3000,
        subtitle: "World",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/b.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  });
}

function buildProductionManifest(story?: FootieScript): ExportManifestV4 {
  const manifest = buildExportManifest({
    story: story ?? fixStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
    multiImageScenesEnabled: true,
  });
  assert.ok(
    isExportManifestV4(manifest),
    "buildExportManifest must emit production ExportManifest v4 / renderer 9D",
  );
  assert.equal(manifest.version, EXPORT_MANIFEST_VERSION);
  assert.equal(manifest.rendererContractVersion, EXPORT_RENDERER_CONTRACT_VERSION);
  const validation = validateExportManifest(manifest);
  assert.equal(
    validation.ok,
    true,
    validation.ok ? "" : validation.issues.map((issue) => issue.code).join(", "),
  );
  assert.ok(
    manifest.scenes.every(
      (scene) =>
        isExportSceneManifestV3(scene) && scene.mediaTimeline.items.length >= 1,
    ),
    "production v4 manifests must carry scene mediaTimeline and mediaTransitions authority",
  );
  assert.ok(manifest.fingerprint.length > 0);
  assert.ok(manifest.audio.voiceover != null);
  return manifest;
}

function freezeAsV2(manifest: ExportManifestV4): ExportManifestV2 {
  const scenes = manifest.scenes.map((scene) => {
    const rest = { ...scene };
    delete (rest as { mediaTransitions?: unknown }).mediaTransitions;
    return rest;
  });
  const draft = {
    ...manifest,
    version: EXPORT_MANIFEST_V2_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_V2,
    scenes,
  } as unknown as Omit<ExportManifestV2, "fingerprint">;
  return { ...draft, fingerprint: buildExportManifestFingerprint(draft) };
}

function assertSafeView(view: HeadlessPublicJobViewV1) {
  const json = JSON.stringify(view);
  assert.equal(json.includes("object_storage"), false);
  assert.equal(json.includes("sha256:"), false);
  assert.equal(json.includes("capability"), false);
  assert.ok(view.jobId.length > 0);
}

async function seedAndCreate(opts?: {
  manifest?: ExportManifest;
  idempotencyKey?: string;
  ownerId?: string;
  projectId?: string;
  principalProjectIds?: string[];
  workerMode?: "succeed" | "fail" | "noop";
  forgeOwnerInBody?: boolean;
  wrongDigest?: boolean;
  expireManifest?: boolean;
  insufficientLease?: boolean;
  maxVerifiedAssetBytes?: number;
  mutateLastAsset?: boolean;
  failEnqueue?: boolean;
}) {
  const manifest = opts?.manifest ?? buildProductionManifest();
  const projectId = opts?.projectId ?? manifest.project.projectId;
  const ownerId = opts?.ownerId ?? "owner-server-1";
  const stack = composeTestHeadlessControlPlane({
    principal: {ownerId,
      sessionId: "sess-1",
    },
    authorizedProjectIds: opts?.principalProjectIds ?? [projectId],
    allowProjectMutate: true,
    nowMs: () => clock,
    workerMode: opts?.workerMode ?? "succeed",
    maxVerifiedAssetBytes: opts?.maxVerifiedAssetBytes,
  });

  const leaseMs = opts?.expireManifest
    ? -1
    : opts?.insufficientLease
      ? HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS - 1
      : HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2;

  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId,
    manifest,
    nowMs: clock,
    leaseMs,
  });
  assert.equal(seeded.ok, true, "seed must succeed for happy-path helpers");
  if (!seeded.ok) throw new Error("seed failed");

  if (opts?.mutateLastAsset) {
    const last = seeded.value.assetLocators[seeded.value.assetLocators.length - 1]!;
    assert.ok(
      stack.storage.testingMutateStoredBytes(last, (b) => {
        b[0] = (b[0] ?? 0) ^ 0xff;
      }),
    );
  }

  if (opts?.failEnqueue) {
    stack.queue.testingFailNextEnqueue();
  }

  const transport: HeadlessCreateJobTransportV1 & { ownerId?: string } = {
    version: 1,
    projectId,
    manifestObject: seeded.value.manifestLocator,
    manifestPayloadDigest: opts?.wrongDigest
      ? "sha256:" + "11".repeat(32)
      : seeded.value.manifestPayloadDigest,
    assetBundleObject: seeded.value.bundleLocator,
    assetBundleFingerprint: seeded.value.bundle.fingerprint,
    rendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30 as const,
      quality: manifest.output.quality,
    },
    rendererBuildId: "renderer-build-1",
    idempotencyKey: opts?.idempotencyKey ?? "idem-1",
  };
  if (opts?.forgeOwnerInBody) transport.ownerId = "forged-owner";

  const bodyText = JSON.stringify(transport);
  const created = await stack.service.createJob({
    requestContext: {},
    rawBodyText: bodyText,
    body: transport,
  });

  return { stack, manifest, seeded, transport, created, ownerId, projectId };
}

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) collectTsFiles(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function assertProductionImportGraphClean() {
  const root = process.cwd();
  const seeds = [
    path.join(
      root,
      "src/features/headless-renderer/control-plane/runtime/compose-production-control-plane.ts",
    ),
    path.join(root, "src/features/headless-renderer/control-plane/index.ts"),
    path.join(root, "src/app/api/headless-render/jobs/route.ts"),
    path.join(root, "src/app/api/headless-render/jobs/[jobId]/route.ts"),
    path.join(root, "src/app/api/headless-render/jobs/[jobId]/cancel/route.ts"),
  ];
  const forbidden = [
    "control-plane/testing",
    "memory-storage.adapter",
    "memory-job-store.adapter",
    "memory-queue.adapter",
    "TestHeadlessPrincipalAdapter",
    "TestHeadlessProjectAuthorizationAdapter",
    "HeadlessFakeWorker",
    "composeTestHeadlessControlPlane",
  ];
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    const importLines = text
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line) || /^\s*export\b.*\bfrom\b/.test(line));
    const importBlob = importLines.join("\n");
    for (const needle of forbidden) {
      assert.equal(
        importBlob.includes(needle),
        false,
        `${path.relative(root, file)} must not import ${needle}`,
      );
    }
    // Compose/runtime seeds must also avoid embedding QA symbols in source body.
    if (file.includes("compose-production-control-plane") || file.includes("/api/headless-render/")) {
      for (const needle of forbidden) {
        assert.equal(
          text.includes(needle),
          false,
          `${path.relative(root, file)} must not reference ${needle}`,
        );
      }
    }
    const importRe =
      /from\s+["']((?:\.\.?\/)[^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(text)) !== null) {
      let rel = m[1]!;
      if (rel.endsWith(".js")) rel = rel.slice(0, -3);
      const base = path.resolve(path.dirname(file), rel);
      const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
      for (const c of candidates) {
        try {
          if (statSync(c).isFile()) queue.push(c);
        } catch {
          /* miss */
        }
      }
    }
  }
  assert.ok(seen.size >= seeds.length);
}

async function main() {
  console.log("\nSprint 11C.1A — Dispatch + production isolation coherence\n");

  await testAsync("production composition remains configuration-blocked", async () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
    assert.equal(prod.canCreateJob, false);
    assert.equal(prod.reason, "CONFIGURATION_UNAVAILABLE");
    assert.equal("service" in prod, false);
    // Durable adapters may be constructed when Clerk+Neon are configured, but
    // create remains blocked — never open a DB connection from this assertion.
    assert.equal(prod.canCreateJob, false);
    if (!prod.neonDatabaseConfigured || !prod.stagingSessionConfigured) {
      assert.equal(prod.jobStore, null);
      const denied = await prod.projectAuthorization.assertProjectAccess(
        { ownerId: "user_x", sessionId: null },
        "project_any",
      );
      assert.equal(denied.ok, false);
      if (!denied.ok) {
        assert.equal(denied.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
      }
    }
  });

  test("UTF-8 transport ceiling: char count below limit, bytes above fails", () => {
    // Each "€" is 3 UTF-8 bytes. 12_000 chars → 36_000 bytes > 32 KiB.
    const euroPad = "€".repeat(12_000);
    const body = `{"pad":"${euroPad}"}`;
    assert.ok(body.length < HEADLESS_JOB_REQUEST_MAX_BYTES);
    assert.ok(new TextEncoder().encode(body).byteLength > HEADLESS_JOB_REQUEST_MAX_BYTES);
    const rejectResult = rejectMediaPayloadInTransportBody(body);
    assert.equal(rejectResult.ok, false);
    if (!rejectResult.ok) {
      assert.equal(rejectResult.issues[0]?.code, "BODY_TOO_LARGE");
    }

    const asciiOk = "a".repeat(1000);
    assert.equal(rejectMediaPayloadInTransportBody(asciiOk).ok, true);
    assert.equal(
      rejectMediaPayloadInTransportBody(
        JSON.stringify({ previewUrl: "https://x", data: "data:image/png;base64,xx" }),
      ).ok,
      false,
    );
  });

  test("transport rejects client ownership; remote fetch not binder", () => {
    assert.equal(
      parseHeadlessCreateJobTransport({
        version: 1,
        projectId: "p",
        ownerId: "client",
        manifestObject: { kind: "object_storage", storeId: "s", objectKey: "k" },
        manifestPayloadDigest: "sha256:" + "aa".repeat(32),
        assetBundleObject: { kind: "object_storage", storeId: "s", objectKey: "b" },
        assetBundleFingerprint: "hab:sha256:" + "bb".repeat(32),
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "high",
        },
        rendererBuildId: "rb",
        idempotencyKey: "k",
      }).ok,
      false,
    );
    assert.equal(
      rejectUnrestrictedRemoteFetchAuthority("https://cdn.example/a.jpg").ok,
      false,
    );
    assert.equal(isAssetsMaterializeRouteHeadlessAuthority(), false);
  });

  await testAsync("seeded owned assets: create + lifecycle succeed", async () => {
    const { created, stack } = await seedAndCreate({ idempotencyKey: "ok-1" });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.value.state, "queued");
    assertSafeView(created.value);
    await stack.fakeWorker.processOnce(5);
    const status = await stack.service.getJob({
      requestContext: {},
      jobId: created.value.jobId,
    });
    assert.equal(status.ok, true);
    if (!status.ok) return;
    assert.equal(status.value.state, "succeeded");
  });

  await testAsync("invented store-1/obj-N descriptors cannot accept a job", async () => {
    const manifest = buildProductionManifest();
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId: "o",
        sessionId: null,
      },
    authorizedProjectIds: [manifest.project.projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    // Manifest + empty-ish forged bundle with fake locators (old fixture style)
    const manifestSeed = await seedOwnedJsonObject({
      storage: stack.storage,
      ownerId: "o",
      projectId: manifest.project.projectId,
      purpose: "manifest",
      json: manifest,
      mimeType: "application/json",
      expiresAtMs: clock + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
    });
    assert.equal(manifestSeed.ok, true);
    if (!manifestSeed.ok) return;
    const forgedBundle = {
      version: 1,
      bundleId: "b",
      fingerprint: "hab:sha256:" + "00".repeat(32),
      assets: [
        {
          version: 1,
          assetId: "a0",
          sourceIdentity: {
            role: "voiceover",
            sceneId: null,
            mediaItemId: null,
            sourceDigest: "hsrc:sha256:" + "11".repeat(32),
            classification: "https",
          },
          contentDigest: "sha256:" + "22".repeat(32),
          byteLength: 10,
          mimeType: "audio/mpeg",
          mediaKind: "audio",
          storageLocator: {
            kind: "object_storage",
            storeId: "store-1",
            objectKey: "obj-0",
          },
          expiresAtMs: clock + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
        },
      ],
    };
    const bundleSeed = await seedOwnedJsonObject({
      storage: stack.storage,
      ownerId: "o",
      projectId: manifest.project.projectId,
      purpose: "asset_bundle_record",
      json: forgedBundle,
      mimeType: "application/json",
      expiresAtMs: clock + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
    });
    assert.equal(bundleSeed.ok, true);
    if (!bundleSeed.ok) return;
    const transport = {
      version: 1 as const,
      projectId: manifest.project.projectId,
      manifestObject: manifestSeed.value.locator,
      manifestPayloadDigest: manifestSeed.value.contentDigest,
      assetBundleObject: bundleSeed.value.locator,
      assetBundleFingerprint: forgedBundle.fingerprint,
      rendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: 30 as const,
        quality: manifest.output.quality,
      },
      rendererBuildId: "rb",
      idempotencyKey: "forged-loc",
    };
    const created = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transport),
      body: transport,
    });
    assert.equal(created.ok, false);
  });

  await testAsync("negative: nonexistent / wrong purpose / digest / lease / expired", async () => {
    const digest = await seedAndCreate({ wrongDigest: true });
    assert.equal(digest.created.ok, false);

    const expired = await seedAndCreate({ expireManifest: true });
    assert.equal(expired.created.ok, false);

    const lease = await seedAndCreate({ insufficientLease: true });
    assert.equal(lease.created.ok, false);
    if (!lease.created.ok) {
      assert.equal(lease.created.issues[0]?.code, "ASSET_LEASE_INSUFFICIENT");
    }

    const mutated = await seedAndCreate({
      mutateLastAsset: true,
      idempotencyKey: "mut",
    });
    assert.equal(mutated.created.ok, false);
    if (!mutated.created.ok) {
      assert.equal(mutated.created.issues[0]?.code, "OBJECT_INTEGRITY_FAILED");
    }
  });

  await testAsync("negative: cross-owner, wrong project, forged owner, overflow", async () => {
    const manifest = buildProductionManifest();
    const projectId = manifest.project.projectId;
    // Seed as owner-a, try create as owner-b
    const stackA = composeTestHeadlessControlPlane({
      principal: {ownerId: "owner-a",
        sessionId: null,
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stackA.storage,
      ownerId: "owner-a",
      projectId,
      manifest,
      nowMs: clock,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;

    const stackB = composeTestHeadlessControlPlane({
      principal: {ownerId: "owner-b",
        sessionId: null,
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    // Point B's service at A's storage by reusing locators on B's empty store → not found
    const transport = {
      version: 1 as const,
      projectId,
      manifestObject: seeded.value.manifestLocator,
      manifestPayloadDigest: seeded.value.manifestPayloadDigest,
      assetBundleObject: seeded.value.bundleLocator,
      assetBundleFingerprint: seeded.value.bundle.fingerprint,
      rendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: 30 as const,
        quality: manifest.output.quality,
      },
      rendererBuildId: "rb",
      idempotencyKey: "xo",
    };
    const cross = await stackB.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transport),
      body: transport,
    });
    assert.equal(cross.ok, false);

    const forbidden = await seedAndCreate({
      principalProjectIds: ["other"],
      idempotencyKey: "forbid",
    });
    assert.equal(forbidden.created.ok, false);

    const forged = await seedAndCreate({
      forgeOwnerInBody: true,
      idempotencyKey: "forge",
    });
    assert.equal(forged.created.ok, false);

    const overflow = await seedAndCreate({
      maxVerifiedAssetBytes: 1,
      idempotencyKey: "ovf",
    });
    assert.equal(overflow.created.ok, false);
    if (!overflow.created.ok) {
      assert.equal(overflow.created.issues[0]?.code, "ASSET_BYTES_OVERFLOW");
    }
  });

  await testAsync("negative: MIME / length / purpose mismatch via custom seeds", async () => {
    const manifest = buildProductionManifest();
    const projectId = manifest.project.projectId;
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId: "o",
        sessionId: null,
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "o",
      projectId,
      manifest,
      nowMs: clock,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;

    // Rebuild bundle with wrong MIME on first asset while keeping locators
    const badAssets = seeded.value.bundle.assets.map((a, i) =>
      i === 0 ? { ...a, mimeType: "application/octet-stream" } : a,
    );
    const { finalizeHeadlessAssetBundle } = await import(
      "@/features/headless-renderer/domain"
    );
    const badBundle = finalizeHeadlessAssetBundle({
      bundleId: "bad-mime",
      assets: badAssets,
      manifest,
    });
    // finalize may fail on mime validation — if so that also proves fail-closed
    if (!badBundle.ok) {
      assert.equal(badBundle.ok, false);
      return;
    }
    const bundleSeed = await seedOwnedJsonObject({
      storage: stack.storage,
      ownerId: "o",
      projectId,
      purpose: "asset_bundle_record",
      json: badBundle.bundle,
      mimeType: "application/json",
      expiresAtMs: clock + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
    });
    assert.equal(bundleSeed.ok, true);
    if (!bundleSeed.ok) return;
    const transport = {
      version: 1 as const,
      projectId,
      manifestObject: seeded.value.manifestLocator,
      manifestPayloadDigest: seeded.value.manifestPayloadDigest,
      assetBundleObject: bundleSeed.value.locator,
      assetBundleFingerprint: badBundle.bundle.fingerprint,
      rendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: 30 as const,
        quality: manifest.output.quality,
      },
      rendererBuildId: "rb",
      idempotencyKey: "mime",
    };
    const created = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transport),
      body: transport,
    });
    assert.equal(created.ok, false);
  });

  await testAsync("storage: locator collision safety + caller mutation isolation", async () => {
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId: "o",
        sessionId: null,
      },
    authorizedProjectIds: ["p"],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    const a = memoryStorageLocatorKey({
      kind: "object_storage",
      storeId: "a/b",
      objectKey: "c",
    });
    const b = memoryStorageLocatorKey({
      kind: "object_storage",
      storeId: "a",
      objectKey: "b/c",
    });
    assert.notEqual(a, b);

    const seeded = await seedOwnedJsonObject({
      storage: stack.storage,
      ownerId: "o",
      projectId: "p",
      purpose: "asset_bytes",
      bytes: new Uint8Array([1, 2, 3, 4]),
      mimeType: "image/jpeg",
      expiresAtMs: clock + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const opened = await stack.storage.openOwnedObject(
      seeded.value.locator,
      "o",
      clock,
    );
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    opened.value.bytes[0] = 99;
    const opened2 = await stack.storage.openOwnedObject(
      seeded.value.locator,
      "o",
      clock,
    );
    assert.equal(opened2.ok, true);
    if (!opened2.ok) return;
    assert.equal(opened2.value.bytes[0], 1);
  });

  await testAsync("job-store: forged next / stale CAS / terminal / mutation", async () => {
    const { stack, created, ownerId } = await seedAndCreate({
      workerMode: "noop",
      idempotencyKey: "cas-1",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const record = await stack.jobStore.getByJobIdAndOwner(
      created.value.jobId,
      ownerId,
    );
    assert.equal(record.ok, true);
    if (!record.ok) return;
    assert.notEqual(record.value.canonicalJob, null);
    assert.notEqual(record.value.canonicalRequest, null);
    const canonicalJob = record.value.canonicalJob!;
    const canonicalRequest = record.value.canonicalRequest!;

    const forged = await stack.jobStore.compareAndSetTransition({
      jobId: created.value.jobId,
      ownerId,
      expectedStoreVersion: record.value.storeVersion,
      next: {
        job: {
          ...canonicalJob,
          ownership: {
            ownerId: "hijack",
            projectId: canonicalJob.ownership.projectId,
          },
        },
        request: canonicalRequest,
        idempotencyAuthorityKey: record.value.idempotencyAuthorityKey,
        operationId: record.value.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(forged.ok, false);

    const stale = await stack.jobStore.compareAndSetTransition({
      jobId: created.value.jobId,
      ownerId,
      expectedStoreVersion: record.value.storeVersion - 1,
      next: {
        job: canonicalJob,
        request: canonicalRequest,
        idempotencyAuthorityKey: record.value.idempotencyAuthorityKey,
        operationId: record.value.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(stale.ok, true);
    if (!stale.ok) return;
    assert.equal(stale.value.kind, "stale");

    // Caller mutation of returned record must not alter store
    try {
      (record.value.canonicalJob as { state: string }).state = "succeeded";
    } catch {
      // deep-frozen records throw on mutation — also acceptable
    }
    const again = await stack.jobStore.getByJobIdAndOwner(
      created.value.jobId,
      ownerId,
    );
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.notEqual(again.value.canonicalJob, null);
    assert.equal(again.value.canonicalJob!.state, "queued");

    const cancelled = await stack.service.cancelJob({
      requestContext: {},
      jobId: created.value.jobId,
    });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    const term = await stack.jobStore.compareAndSetTransition({
      jobId: created.value.jobId,
      ownerId,
      expectedStoreVersion: again.value.storeVersion + 1,
      next: {
        job: {
          ...(cancelled.value as unknown as HeadlessRenderJobV1),
          state: "succeeded",
        } as unknown as HeadlessRenderJobV1,
        request: again.value.canonicalRequest!,
        idempotencyAuthorityKey: again.value.idempotencyAuthorityKey,
        operationId: again.value.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    const afterCancel = await stack.jobStore.getByJobIdAndOwner(
      created.value.jobId,
      ownerId,
    );
    assert.equal(afterCancel.ok, true);
    if (!afterCancel.ok) return;
    assert.notEqual(afterCancel.value.canonicalJob, null);
    assert.notEqual(afterCancel.value.canonicalRequest, null);
    const overwrite = await stack.jobStore.compareAndSetTransition({
      jobId: created.value.jobId,
      ownerId,
      expectedStoreVersion: afterCancel.value.storeVersion,
      next: {
        job: afterCancel.value.canonicalJob!,
        request: afterCancel.value.canonicalRequest!,
        idempotencyAuthorityKey: afterCancel.value.idempotencyAuthorityKey,
        operationId: afterCancel.value.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(overwrite.ok, true);
    if (!overwrite.ok) return;
    assert.equal(overwrite.value.kind, "terminal_locked");
    void term;
  });

  await testAsync("queue enqueue failure → failed terminal + recoverDispatch", async () => {
    const { created, stack, transport } = await seedAndCreate({
      failEnqueue: true,
      idempotencyKey: "enq-fail",
    });
    assert.equal(created.ok, false);
    if (created.ok) return;
    const failedCreate = created;
    assert.equal(failedCreate.issues[0]?.code, "QUEUE_ENQUEUE_FAILED");
    assert.ok(failedCreate.recoverableJob);
    assert.equal(failedCreate.recoverableJob?.state, "failed");
    assert.equal(failedCreate.recoverableJob?.reasonId, "QUEUE_ENQUEUE_FAILED");
    assert.equal(failedCreate.recoverableJob?.retryable, true);
    assert.notEqual(failedCreate.recoverableJob?.state, "materializing");
    assert.notEqual(failedCreate.recoverableJob?.state, "queued");
    if (!failedCreate.recoverableJob) return;
    const recoverableJob = failedCreate.recoverableJob;

    // Idempotent create replay returns truthful terminal job (not stuck materializing).
    const replay = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transport),
      body: transport,
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.value.jobId, recoverableJob.jobId);
    assert.equal(replay.value.state, "failed");
    assert.equal(replay.value.reasonId, "QUEUE_ENQUEUE_FAILED");

    const recovered = await stack.service.recoverDispatch({
      requestContext: {},
      jobId: recoverableJob.jobId,
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.notEqual(recovered.value.jobId, recoverableJob.jobId);
    assert.equal(recovered.value.state, "queued");
  });

  await testAsync("stable delivery id is jobId+attempt; duplicates harmless", async () => {
    const { created, stack, ownerId } = await seedAndCreate({
      idempotencyKey: "stable-dlv",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expected = stableHeadlessDeliveryId(created.value.jobId, 1);
    const drained = await stack.queue.drain(10);
    assert.equal(drained.length, 1);
    assert.equal(drained[0]?.deliveryId, expected);
    // Re-enqueue same stable delivery (uncertain-outcome recovery).
    await stack.queue.enqueue(drained[0]!);
    await stack.queue.enqueue({
      ...drained[0]!,
      enqueuedAtMs: clock + 99,
    });
    const again = await stack.service.recoverDispatch({
      requestContext: {},
      jobId: created.value.jobId,
    });
    assert.equal(again.ok, true);
    await stack.fakeWorker.processOnce(20);
    const status = await stack.service.getJob({
      requestContext: {},
      jobId: created.value.jobId,
    });
    assert.equal(status.ok, true);
    if (!status.ok) return;
    assert.equal(status.value.state, "succeeded");
    void ownerId;
  });

  await testAsync("immediate delivery after queued persist claims successfully", async () => {
    const manifest = buildProductionManifest();
    const projectId = manifest.project.projectId;
    const ownerId = "owner-immediate";
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId,
        sessionId: null,
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId,
      projectId,
      manifest,
      nowMs: clock,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    stack.queue.testingAfterEnqueue(async () => {
      await stack.fakeWorker.processOnce(5);
    });
    const transport: HeadlessCreateJobTransportV1 = {
      version: 1,
      projectId,
      manifestObject: seeded.value.manifestLocator,
      manifestPayloadDigest: seeded.value.manifestPayloadDigest,
      assetBundleObject: seeded.value.bundleLocator,
      assetBundleFingerprint: seeded.value.bundle.fingerprint,
      rendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: 30,
        quality: manifest.output.quality,
      },
      rendererBuildId: "renderer-build-1",
      idempotencyKey: "immediate-dlv",
    };
    const created = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transport),
      body: transport,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    // Worker already ran during enqueue; create response may see progressed/terminal job.
    const status = await stack.service.getJob({
      requestContext: {},
      jobId: created.value.jobId,
    });
    assert.equal(status.ok, true);
    if (!status.ok) return;
    assert.ok(
      status.value.state === "succeeded" ||
        status.value.state === "queued" ||
        status.value.state === "rendering" ||
        status.value.state === "validating" ||
        status.value.state === "uploading",
    );
    if (status.value.state !== "succeeded") {
      await stack.fakeWorker.processOnce(10);
      const done = await stack.service.getJob({
        requestContext: {},
        jobId: created.value.jobId,
      });
      assert.equal(done.ok, true);
      if (!done.ok) return;
      assert.equal(done.value.state, "succeeded");
    }
  });

  await testAsync("worker claim racing enqueue-failure preserves claim", async () => {
    const manifest = buildProductionManifest();
    const projectId = manifest.project.projectId;
    const ownerId = "owner-claim-race";
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId,
        sessionId: null,
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId,
      projectId,
      manifest,
      nowMs: clock,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    stack.queue.testingFailNextEnqueue(async (message) => {
      const rec = await stack.jobStore.getByJobIdAndOwner(
        message.jobId,
        message.ownerId,
      );
      assert.equal(rec.ok, true);
      if (!rec.ok) return;
      assert.notEqual(rec.value.canonicalJob, null);
      assert.equal(rec.value.canonicalJob!.state, "queued");
      const claimed = await stack.jobStore.claimQueuedJob({
        jobId: message.jobId,
        ownerId: message.ownerId,
        expectedStoreVersion: rec.value.storeVersion,
        claimToken: "claim_race_token",
        nowMs: clock + 10,
      });
      assert.equal(claimed.ok, true);
      if (!claimed.ok) return;
      assert.equal(claimed.value.kind, "claimed");
    });
    const transport: HeadlessCreateJobTransportV1 = {
      version: 1,
      projectId,
      manifestObject: seeded.value.manifestLocator,
      manifestPayloadDigest: seeded.value.manifestPayloadDigest,
      assetBundleObject: seeded.value.bundleLocator,
      assetBundleFingerprint: seeded.value.bundle.fingerprint,
      rendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: 30,
        quality: manifest.output.quality,
      },
      rendererBuildId: "renderer-build-1",
      idempotencyKey: "claim-race",
    };
    const created = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transport),
      body: transport,
    });
    // Enqueue failed but claim won — return truthful worker-owned job (not fake failed).
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.value.state, "queued");
    const stored = await stack.jobStore.getByJobIdAndOwner(
      created.value.jobId,
      ownerId,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.notEqual(stored.value.canonicalJob, null);
    assert.equal(stored.value.claimToken, "claim_race_token");
    assert.notEqual(stored.value.canonicalJob!.state, "failed");
  });

  await testAsync("cancel during dispatch recovery returns terminal cancelled", async () => {
    const { created, stack } = await seedAndCreate({
      failEnqueue: true,
      idempotencyKey: "cancel-dispatch",
    });
    assert.equal(created.ok, false);
    if (created.ok) return;
    if (!created.recoverableJob) return;
    const recoverableJob = created.recoverableJob;
    // Force cancel is illegal from failed — recover then cancel, or cancel a queued job.
    const recovered = await stack.service.recoverDispatch({
      requestContext: {},
      jobId: recoverableJob.jobId,
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    const cancelled = await stack.service.cancelJob({
      requestContext: {},
      jobId: recovered.value.jobId,
    });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    assert.equal(cancelled.value.state, "cancelled");
    const again = await stack.service.recoverDispatch({
      requestContext: {},
      jobId: recovered.value.jobId,
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.value.state, "cancelled");
  });

  await testAsync("finalized storage drift fails closed without rewriting metadata", async () => {
    const { seeded, stack, ownerId } = await seedAndCreate({
      idempotencyKey: "drift-closed",
    });
    const locator = seeded.value.assetLocators[0]!;
    const before = stack.storage.testingPeekStoredObject(locator);
    assert.ok(before);
    const metaBefore = JSON.stringify(before!.metadata);
    assert.ok(
      stack.storage.testingMutateStoredBytes(locator, (b) => {
        b[0] = (b[0] ?? 0) ^ 0xff;
      }),
    );
    const corrupted = stack.storage.testingPeekStoredObject(locator);
    assert.ok(corrupted);
    const bytesAfterCorrupt = Buffer.from(corrupted!.bytes).toString("hex");
    assert.notEqual(bytesAfterCorrupt, Buffer.from(before!.bytes).toString("hex"));
    const read = await stack.storage.readObjectMetadata(locator, ownerId);
    assert.equal(read.ok, false);
    if (!read.ok) {
      assert.equal(read.issues[0]?.code, "OBJECT_INTEGRITY_FAILED");
    }
    const after = stack.storage.testingPeekStoredObject(locator);
    assert.ok(after);
    // Reject path must not rewrite metadata to match corrupted bytes, nor alter bytes further.
    assert.equal(JSON.stringify(after!.metadata), metaBefore);
    assert.equal(Buffer.from(after!.bytes).toString("hex"), bytesAfterCorrupt);
  });

  await testAsync("descriptor/storage expiry coherence fixtures", async () => {
    // Exact boundary lease passes.
    const exact = await seedAndCreate({
      idempotencyKey: "lease-exact",
      insufficientLease: false,
    });
    // Override: re-seed with exact lease via custom path
    const manifest = buildProductionManifest();
    const projectId = manifest.project.projectId;
    const ownerId = "owner-expiry";
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId,
        sessionId: null,
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    const exactSeed = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId,
      projectId,
      manifest,
      nowMs: clock,
      leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS,
    });
    assert.equal(exactSeed.ok, true);
    if (!exactSeed.ok) return;
    const transportExact: HeadlessCreateJobTransportV1 = {
      version: 1,
      projectId,
      manifestObject: exactSeed.value.manifestLocator,
      manifestPayloadDigest: exactSeed.value.manifestPayloadDigest,
      assetBundleObject: exactSeed.value.bundleLocator,
      assetBundleFingerprint: exactSeed.value.bundle.fingerprint,
      rendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: 30,
        quality: manifest.output.quality,
      },
      rendererBuildId: "renderer-build-1",
      idempotencyKey: "lease-exact-boundary",
    };
    const createdExact = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transportExact),
      body: transportExact,
    });
    assert.equal(createdExact.ok, true);

    // One ms short fails.
    const short = await seedAndCreate({
      insufficientLease: true,
      idempotencyKey: "lease-short",
    });
    assert.equal(short.created.ok, false);
    if (!short.created.ok) {
      assert.equal(short.created.issues[0]?.code, "ASSET_LEASE_INSUFFICIENT");
    }

    // Overflow nowMs + lease.
    const overflow = headlessMinExpiryDeadline(
      Number.MAX_SAFE_INTEGER - HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS + 1,
    );
    assert.equal(overflow.ok, false);
    if (!overflow.ok) {
      assert.equal(overflow.issues[0]?.code, "ASSET_LEASE_OVERFLOW");
    }
    assert.equal(headlessMinExpiryDeadline(Number.NaN).ok, false);
    assert.equal(headlessMinExpiryDeadline(-1).ok, false);

    // Expiry mismatch: rewrite metadata after seed.
    const mismatchStack = composeTestHeadlessControlPlane({
      principal: {ownerId: "owner-mismatch",
        sessionId: null,
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    const mismatchSeed = await seedOwnedManifestAndBundle({
      storage: mismatchStack.storage,
      ownerId: "owner-mismatch",
      projectId,
      manifest,
      nowMs: clock,
    });
    assert.equal(mismatchSeed.ok, true);
    if (!mismatchSeed.ok) return;
    const assetLoc = mismatchSeed.value.assetLocators[0]!;
    assert.ok(
      mismatchStack.storage.testingRewriteFinalizedExpiresAt(
        assetLoc,
        clock + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2 + 999,
      ),
    );
    const transportMismatch: HeadlessCreateJobTransportV1 = {
      version: 1,
      projectId,
      manifestObject: mismatchSeed.value.manifestLocator,
      manifestPayloadDigest: mismatchSeed.value.manifestPayloadDigest,
      assetBundleObject: mismatchSeed.value.bundleLocator,
      assetBundleFingerprint: mismatchSeed.value.bundle.fingerprint,
      rendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: 30,
        quality: manifest.output.quality,
      },
      rendererBuildId: "renderer-build-1",
      idempotencyKey: "expiry-mismatch",
    };
    const createdMismatch = await mismatchStack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transportMismatch),
      body: transportMismatch,
    });
    assert.equal(createdMismatch.ok, false);
    if (!createdMismatch.ok) {
      assert.equal(createdMismatch.issues[0]?.code, "ASSET_EXPIRY_MISMATCH");
    }

    // Unsafe metadata timestamp.
    const unsafeStack = composeTestHeadlessControlPlane({
      principal: {ownerId: "owner-unsafe",
        sessionId: null,
      },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
    });
    const unsafeSeed = await seedOwnedManifestAndBundle({
      storage: unsafeStack.storage,
      ownerId: "owner-unsafe",
      projectId,
      manifest,
      nowMs: clock,
    });
    assert.equal(unsafeSeed.ok, true);
    if (!unsafeSeed.ok) return;
    assert.ok(
      unsafeStack.storage.testingRewriteFinalizedExpiresAt(
        unsafeSeed.value.assetLocators[0]!,
        Number.MAX_SAFE_INTEGER + 1,
      ),
    );
    // Also force descriptor to the same unsafe value so mismatch isn't hit first —
    // domain validation rejects unsafe descriptor; rewrite only metadata and keep
    // descriptor coherent via equal unsafe values by rebuilding is hard. Expect
    // ASSET_EXPIRY_MISMATCH (descriptor still safe) OR ASSET_EXPIRY_UNSAFE.
    const transportUnsafe: HeadlessCreateJobTransportV1 = {
      version: 1,
      projectId,
      manifestObject: unsafeSeed.value.manifestLocator,
      manifestPayloadDigest: unsafeSeed.value.manifestPayloadDigest,
      assetBundleObject: unsafeSeed.value.bundleLocator,
      assetBundleFingerprint: unsafeSeed.value.bundle.fingerprint,
      rendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: 30,
        quality: manifest.output.quality,
      },
      rendererBuildId: "renderer-build-1",
      idempotencyKey: "expiry-unsafe",
    };
    const createdUnsafe = await unsafeStack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(transportUnsafe),
      body: transportUnsafe,
    });
    assert.equal(createdUnsafe.ok, false);
    if (!createdUnsafe.ok) {
      assert.ok(
        createdUnsafe.issues[0]?.code === "ASSET_EXPIRY_MISMATCH" ||
          createdUnsafe.issues[0]?.code === "ASSET_EXPIRY_UNSAFE",
      );
    }
    void exact;
  });

  await testAsync("idempotent replay + semantic conflict + cancel", async () => {
    const first = await seedAndCreate({ idempotencyKey: "same-key" });
    assert.equal(first.created.ok, true);
    if (!first.created.ok) return;
    const replay = await first.stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(first.transport),
      body: first.transport,
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.value.jobId, first.created.value.jobId);

    const conflict = await seedAndCreate({ idempotencyKey: "c-key" });
    assert.equal(conflict.created.ok, true);
    if (!conflict.created.ok) return;
    const alt = {
      ...conflict.transport,
      rendererBuildId: "different-build",
    };
    const conflict2 = await conflict.stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify(alt),
      body: alt,
    });
    assert.equal(conflict2.ok, false);
  });

  await testAsync("v2/v3 + refresh status + worker failure", async () => {
    const v3 = await seedAndCreate({ idempotencyKey: "v3" });
    assert.equal(v3.created.ok, true);
    const v2m = freezeAsV2(buildProductionManifest());
    assert.equal(validateExportManifest(v2m).ok, true);
    const v2 = await seedAndCreate({ manifest: v2m, idempotencyKey: "v2" });
    assert.equal(v2.created.ok, true);

    const { stack, created } = await seedAndCreate({
      idempotencyKey: "refresh",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await stack.fakeWorker.processOnce(5);
    const refreshed = await stack.service.getJob({
      requestContext: { client: "new-tab" },
      jobId: created.value.jobId,
    });
    assert.equal(refreshed.ok, true);
    if (!refreshed.ok) return;
    assert.equal(refreshed.value.state, "succeeded");

    const fail = await seedAndCreate({
      idempotencyKey: "fail",
      workerMode: "fail",
    });
    assert.equal(fail.created.ok, true);
    if (!fail.created.ok) return;
    await fail.stack.fakeWorker.processOnce(5);
    const st = await fail.stack.service.getJob({
      requestContext: {},
      jobId: fail.created.value.jobId,
    });
    assert.equal(st.ok, true);
    if (!st.ok) return;
    assert.equal(st.value.state, "failed");
  });

  test("test-only surface is separated from production barrel", () => {
    const prodIndex = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/index.ts",
      ),
      "utf8",
    );
    assert.equal(prodIndex.includes("seedOwnedJsonObject"), false);
    assert.equal(prodIndex.includes("composeTestHeadlessControlPlane"), false);
    assert.equal(prodIndex.includes("uploadOwnedJsonObject"), false);
    assert.ok(prodIndex.includes("composeProductionHeadlessControlPlane"));
    assert.ok(
      prodIndex.includes("compose-production-control-plane"),
    );
    assert.equal(prodIndex.includes("compose-control-plane"), false);
    const route = readFileSync(
      path.join(process.cwd(), "src/app/api/headless-render/jobs/route.ts"),
      "utf8",
    );
    assert.ok(route.includes("evaluateHeadlessRouteAuth"));
    assert.equal(route.includes("composeTest"), false);
    assert.equal(route.includes("control-plane/testing"), false);
  });

  test("production import graph contains no QA adapters", () => {
    assertProductionImportGraphClean();
    // Sanity: testing module itself still owns memory adapters.
    const testingFiles = collectTsFiles(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/testing",
      ),
    );
    assert.ok(
      testingFiles.some((f) =>
        readFileSync(f, "utf8").includes("composeTestHeadlessControlPlane"),
      ),
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
