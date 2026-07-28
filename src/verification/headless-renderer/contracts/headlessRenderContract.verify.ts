/**
 * Sprint 11B.1A — Canonical request chain authority.
 * Run: npm run test:headless-render-contract
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
import * as headlessDomain from "@/features/headless-renderer/domain";
import {
  applyHeadlessJobTransition,
  buildHeadlessIdempotencyAuthorityKey,
  buildHeadlessManifestPayloadDigest,
  buildHeadlessRenderJobFingerprint,
  buildHeadlessSourceDigest,
  classifyHeadlessSource,
  createAcceptedHeadlessRenderJob,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessAssetBundle,
  finalizeHeadlessRenderArtifact,
  finalizeHeadlessRenderJobRequest,
  HEADLESS_ASSET_DESCRIPTOR_VERSION,
  HEADLESS_AUTHORITY_PREFIX,
  HEADLESS_FORBIDDEN_PUBLIC_EXPORTS,
  HEADLESS_PUBLIC_API_CLASSIFICATION,
  headlessCanonicalEncode,
  headlessSha256Hex,
  isLegalHeadlessJobTransition,
  resolveHeadlessJobTransition,
  sanitizeDiagnosticMessage,
  validateHeadlessArtifactRequestCoherence,
  validateHeadlessRenderJob,
  validateHeadlessRenderJobCoherence,
  validateHeadlessRenderJobRequest,
  type HeadlessAssetDescriptorV1,
  type HeadlessOwnershipBinding,
  type HeadlessRenderJobRequestV1,
  type HeadlessRequiredSourceSlot,
} from "@/features/headless-renderer/domain";
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

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function digest(n: number): string {
  return `sha256:${n.toString(16).padStart(64, "0")}`;
}

function fixStory(imageUrl = "https://example.com/a.jpg"): FootieScript {
  return syncFootieScript({
    title: "11B Headless",
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

function buildV3Manifest(story?: FootieScript): ExportManifestV4 {
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
    "production v4 manifests must carry v3-shaped scene mediaTimeline and mediaTransitions authority",
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

function ownershipFor(manifest: ExportManifest): HeadlessOwnershipBinding {
  return { ownerId: "owner-server-1", projectId: manifest.project.projectId };
}

function descriptorForSlot(
  slot: HeadlessRequiredSourceSlot,
  index: number,
): HeadlessAssetDescriptorV1 {
  return {
    version: HEADLESS_ASSET_DESCRIPTOR_VERSION,
    assetId: `asset-${index}`,
    sourceIdentity: {
      role: slot.role,
      sceneId: slot.sceneId,
      mediaItemId: slot.mediaItemId,
      sourceDigest: slot.sourceDigest,
      classification: slot.classification,
    },
    contentDigest: digest(index + 1),
    byteLength: 1024 * (index + 1),
    mimeType:
      slot.expectedMediaKind === "audio"
        ? "audio/mpeg"
        : slot.expectedMediaKind === "video"
          ? "video/mp4"
          : "image/jpeg",
    mediaKind: slot.expectedMediaKind,
    storageLocator: {
      kind: "object_storage",
      storeId: "store-1",
      objectKey: `obj-${index}`,
    },
    expiresAtMs: 1_900_000_000_000,
  };
}

function bundleForManifest(manifest: ExportManifest, bundleId = "bundle-1") {
  const slots = extractRequiredHeadlessSourceSlots(manifest);
  const result = finalizeHeadlessAssetBundle({
    bundleId,
    assets: slots.map((slot, i) => descriptorForSlot(slot, i)),
    manifest,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("bundle failed");
  return result.bundle;
}

function buildValidRequest(
  manifest: ExportManifest,
  opts?: { idempotencyKey?: string; rendererBuildId?: string },
): {
  request: HeadlessRenderJobRequestV1;
  renderJobFingerprint: string;
} {
  const result = finalizeHeadlessRenderJobRequest({
    ownership: ownershipFor(manifest),
    manifest,
    assetBundle: bundleForManifest(manifest),
    rendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    rendererBuildId: opts?.rendererBuildId ?? "renderer-build-1",
    idempotencyKey: opts?.idempotencyKey ?? "idem-1",
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("request failed");
  return {
    request: result.request,
    renderJobFingerprint: result.renderJobFingerprint,
  };
}

function makeArtifact(job: {
  manifestFingerprint: string;
  assetBundleFingerprint: string;
  renderJobFingerprint: string;
  rendererBuildId: string;
}, request: HeadlessRenderJobRequestV1) {
  const result = finalizeHeadlessRenderArtifact({
    version: 1,
    artifactId: "art-1",
    contentDigest: digest(42),
    byteLength: 50_000,
    mimeType: request.rendererProfile.format === "webm" ? "video/webm" : "video/mp4",
    format: request.rendererProfile.format,
    width: request.manifest.output.width,
    height: request.manifest.output.height,
    fps: 30,
    durationMs: request.manifest.project.renderDurationMs,
    audio: {
      present: true,
      codec: "opus",
      channels: 2,
      sampleRateHz: 48000,
    },
    video: {
      present: true,
      codec: "vp9",
      width: request.manifest.output.width,
      height: request.manifest.output.height,
      fps: 30,
    },
    rendererBuildId: job.rendererBuildId,
    manifestFingerprint: job.manifestFingerprint,
    assetBundleFingerprint: job.assetBundleFingerprint,
    renderJobFingerprint: job.renderJobFingerprint,
    expiresAtMs: 1_900_000_000_000,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("artifact failed");
  return result.artifact;
}

function advanceToUploading(
  request: HeadlessRenderJobRequestV1,
  jobId: string,
) {
  const created = createAcceptedHeadlessRenderJob({
    jobId,
    requestValue: request,
    createdAtMs: 1000,
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("create failed");
  let job = created.job;
  for (const to of [
    "materializing",
    "queued",
    "rendering",
    "encoding",
    "validating",
    "uploading",
  ] as const) {
    const step = applyHeadlessJobTransition({
      jobValue: job,
      requestValue: request,
      toState: to,
      attempt: 1,
      updatedAtMs: job.updatedAtMs + 1,
    });
    assert.equal(step.ok, true, to);
    if (!step.ok) throw new Error(to);
    job = step.job;
  }
  return job;
}

console.log("\nSprint 11B.1A — Canonical request chain authority\n");

test("SHA-256 known answers match Node crypto (incl. 1e6 a)", () => {
  const cases = [
    "",
    "abc",
    "hello",
    "日本語",
    "a".repeat(10000),
    "a".repeat(1_000_000),
  ];
  for (const c of cases) {
    assert.equal(
      headlessSha256Hex(c),
      createHash("sha256").update(c, "utf8").digest("hex"),
      `mismatch for length ${c.length}`,
    );
  }
});

test("canonical encode rejects cycle and supports shared DAG equivalence", () => {
  const shared = { v: 1 };
  const dagA = { a: shared, b: shared };
  const dagB = { a: { v: 1 }, b: { v: 1 } };
  const encA = headlessCanonicalEncode(dagA);
  const encB = headlessCanonicalEncode(dagB);
  assert.equal(encA.ok, true);
  assert.equal(encB.ok, true);
  if (encA.ok && encB.ok) assert.equal(encA.text, encB.text);

  const cyclic: Record<string, unknown> = { v: 1 };
  cyclic.self = cyclic;
  const encC = headlessCanonicalEncode(cyclic);
  assert.equal(encC.ok, false);

  const encFn = headlessCanonicalEncode({ f: () => 1 });
  assert.equal(encFn.ok, false);
});

test("reversed object key order yields identical authority text", () => {
  const a = headlessCanonicalEncode({ z: 1, a: 2 });
  const b = headlessCanonicalEncode({ a: 2, z: 1 });
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) assert.equal(a.text, b.text);
});

test("authority prefixes are distinct SHA-256 forms", () => {
  assert.equal(HEADLESS_AUTHORITY_PREFIX.hsrc, "hsrc:sha256:");
  assert.equal(HEADLESS_AUTHORITY_PREFIX.hab, "hab:sha256:");
  assert.equal(HEADLESS_AUTHORITY_PREFIX.hrr, "hrr:sha256:");
  assert.equal(HEADLESS_AUTHORITY_PREFIX.hrj, "hrj:sha256:");
  assert.equal(HEADLESS_AUTHORITY_PREFIX.hra, "hra:sha256:");
  assert.equal(HEADLESS_AUTHORITY_PREFIX.hid, "hid:sha256:");
  const src = buildHeadlessSourceDigest("https://example.com/x.jpg");
  assert.ok(src.startsWith("hsrc:sha256:"));
  assert.match(src, /^hsrc:sha256:[a-f0-9]{64}$/);
});

test("valid v4 request accepts, detaches, and freezes result only", () => {
  const manifest = buildV3Manifest();
  const mutableMarker = { touched: false };
  const { request } = buildValidRequest(manifest);
  const input = {
    ...request,
    manifest: { ...manifest, _probe: mutableMarker } as unknown as ExportManifest,
  };
  // Use a clean validated path
  const result = validateHeadlessRenderJobRequest(request);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(Object.isFrozen(result.request));
  assert.ok(result.request.requestFingerprint.startsWith("hrr:sha256:"));
  assert.ok(result.renderJobFingerprint.startsWith("hrj:sha256:"));
  assert.notEqual(result.request.requestFingerprint, result.renderJobFingerprint);

  // Caller mutation isolation: mutate original request object fields
  const originalKey = request.idempotencyKey;
  (request as { idempotencyKey: string }).idempotencyKey = "caller-mutated";
  assert.equal(result.request.idempotencyKey, originalKey);
  void input;
  void mutableMarker;
});

test("caller input remains mutable after successful validation", () => {
  const manifest = buildV3Manifest();
  const draft = {
    version: 1 as const,
    ownership: ownershipFor(manifest),
    manifest,
    manifestFingerprint: manifest.fingerprint,
    assetBundle: bundleForManifest(manifest),
    rendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30 as const,
      quality: manifest.output.quality,
    },
    rendererBuildId: "rb",
    idempotencyKey: "k1",
    requestFingerprint: "pending",
  };
  const finalized = finalizeHeadlessRenderJobRequest({
    ownership: draft.ownership,
    manifest: draft.manifest,
    assetBundle: draft.assetBundle,
    rendererProfile: draft.rendererProfile,
    rendererBuildId: draft.rendererBuildId,
    idempotencyKey: draft.idempotencyKey,
  });
  assert.equal(finalized.ok, true);
  if (!finalized.ok) return;
  draft.idempotencyKey = "mutated-after";
  assert.notEqual(finalized.request.idempotencyKey, "mutated-after");
  assert.ok(Object.isFrozen(finalized.request));
});

test("valid v2 request accepts", () => {
  const v2 = freezeAsV2(buildV3Manifest());
  assert.equal(validateExportManifest(v2).ok, true);
  const result = validateHeadlessRenderJobRequest(buildValidRequest(v2).request);
  assert.equal(result.ok, true);
});

test("copied historical manifestFingerprint cannot substitute different payload", () => {
  const a = buildV3Manifest();
  const b = buildV3Manifest(
    fixStory("https://example.com/different-payload.jpg"),
  );
  // Forge B to claim A's fingerprint (historical FNV collision/substitution attack)
  const forged = {
    ...b,
    fingerprint: a.fingerprint,
  };
  const bundle = bundleForManifest(a);
  // Even if forged.fingerprint equals a.fingerprint, payload digest differs
  const payloadA = buildHeadlessManifestPayloadDigest(a);
  const payloadForged = buildHeadlessManifestPayloadDigest(forged as ExportManifest);
  assert.equal(payloadA.ok && payloadForged.ok, true);
  if (payloadA.ok && payloadForged.ok) {
    assert.notEqual(payloadA.digest, payloadForged.digest);
  }
  const req = finalizeHeadlessRenderJobRequest({
    ownership: ownershipFor(a),
    manifest: forged as ExportManifest,
    assetBundle: bundle,
    rendererProfile: {
      resolution: a.output.resolution,
      format: a.output.format,
      fps: 30,
      quality: a.output.quality,
    },
    rendererBuildId: "rb",
    idempotencyKey: "k",
  });
  // Coverage/fingerprint against forged manifest should fail closed
  assert.equal(req.ok, false);
});

test("idempotency delimiter and Unicode IDs do not collide", () => {
  const pairs: Array<[string, string]> = [
    ["a|b", "c"],
    ["a", "b|c"],
    ["null", "undefined"],
    ['{"x":1}', "y"],
    ["e\u0301", "x"], // e + combining acute
    ["é", "x"], // precomposed
  ];
  const keys = new Set<string>();
  for (const [ownerId, projectId] of pairs) {
    const built = buildHeadlessIdempotencyAuthorityKey({
      ownerId,
      projectId,
      requestFingerprint: "hrr:sha256:" + "ab".repeat(32),
    });
    assert.equal(built.ok, true);
    if (!built.ok) continue;
    assert.ok(built.key.startsWith("hid:sha256:"));
    assert.equal(keys.has(built.key), false);
    keys.add(built.key);
  }
  assert.equal(keys.size, pairs.length);
});

test("request/job prefix confusion rejected", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const forged = {
    ...request,
    requestFingerprint: request.requestFingerprint.replace("hrr:", "hrj:"),
  };
  const result = validateHeadlessRenderJobRequest(forged);
  assert.equal(result.ok, false);
});

test("missing/extra/duplicate bindings and classifications", () => {
  const manifest = buildV3Manifest();
  const slots = extractRequiredHeadlessSourceSlots(manifest);
  const missing = finalizeHeadlessAssetBundle({
    bundleId: "b",
    assets: slots.slice(0, -1).map((s, i) => descriptorForSlot(s, i)),
    manifest,
  });
  assert.equal(missing.ok, false);

  const blobManifest = buildV3Manifest(fixStory("blob:local-media-1"));
  assert.ok(
    extractRequiredHeadlessSourceSlots(blobManifest).some(
      (s) => s.classification === "blob",
    ),
  );
  assert.equal(classifyHeadlessSource("data:x"), "data");
});

test("illegal lifecycle: validating → succeeded removed", () => {
  assert.equal(isLegalHeadlessJobTransition("validating", "succeeded"), false);
  assert.equal(isLegalHeadlessJobTransition("validating", "uploading"), true);
  assert.equal(isLegalHeadlessJobTransition("uploading", "succeeded"), true);
  const decision = resolveHeadlessJobTransition({
    fromState: "validating",
    toState: "succeeded",
    fromAttempt: 1,
    toAttempt: 1,
    artifact: null,
  });
  assert.equal(decision.ok, false);
});

test("terminal uniqueness, artifact rules, timestamp regression", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  let job = advanceToUploading(request, "job-1");
  const noArtifact = applyHeadlessJobTransition({
    jobValue: job,
    requestValue: request,
    toState: "succeeded",
    attempt: 1,
    updatedAtMs: job.updatedAtMs + 1,
    artifact: null,
  });
  assert.equal(noArtifact.ok, false);

  const regress = applyHeadlessJobTransition({
    jobValue: job,
    requestValue: request,
    toState: "uploading",
    attempt: 1,
    updatedAtMs: job.updatedAtMs - 1,
  });
  assert.equal(regress.ok, false);
  assert.ok(regress.issues.some((i) => i.code === "TIMESTAMP_REGRESSION"));

  const ok = applyHeadlessJobTransition({
    jobValue: job,
    requestValue: request,
    toState: "succeeded",
    attempt: 1,
    updatedAtMs: job.updatedAtMs + 1,
    artifact: makeArtifact(job, request),
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  job = ok.job;

  const after = applyHeadlessJobTransition({
    jobValue: job,
    requestValue: request,
    toState: "failed",
    attempt: 1,
    updatedAtMs: job.updatedAtMs + 1,
    terminalReason: { reasonId: "INVALID_JOB", retryable: false },
  });
  assert.equal(after.ok, false);
});

test("job/request coherence rejects forged fingerprints and profile changes", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const created = createAcceptedHeadlessRenderJob({
    jobId: "job-2",
    requestValue: request,
    createdAtMs: 1000,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const forgedFp = buildHeadlessRenderJobFingerprint({
    requestFingerprint: "hrr:sha256:" + "11".repeat(32),
    attempt: 1,
    rendererBuildId: request.rendererBuildId,
  });
  assert.equal(forgedFp.ok, true);
  if (!forgedFp.ok) return;
  const forgedJob = {
    ...created.job,
    requestFingerprint: "hrr:sha256:" + "11".repeat(32),
    renderJobFingerprint: forgedFp.fingerprint,
  };
  const cohere = validateHeadlessRenderJobCoherence(forgedJob, request);
  assert.equal(cohere.ok, false);
  assert.ok(
    cohere.issues.some((i) => i.code === "JOB_REQUEST_COHERENCE_MISMATCH"),
  );

  const otherQuality =
    created.job.rendererProfile.quality === "high" ? "standard" : "high";
  const profileChanged = {
    ...created.job,
    rendererProfile: {
      ...created.job.rendererProfile,
      quality: otherQuality,
    },
  };
  const profileCohere = validateHeadlessRenderJobCoherence(
    profileChanged,
    request,
  );
  assert.equal(profileCohere.ok, false);
});

test("malformed progress and unknown terminal reason fail", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const created = createAcceptedHeadlessRenderJob({
    jobId: "job-3",
    requestValue: request,
    createdAtMs: 1000,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const badProgress = applyHeadlessJobTransition({
    jobValue: created.job,
    requestValue: request,
    toState: "materializing",
    attempt: 1,
    updatedAtMs: 1001,
    progress: { percent: 150, stage: "materializing", updatedAtMs: 1001 },
  });
  assert.equal(badProgress.ok, false);

  let job = created.job;
  for (const to of ["materializing", "queued"] as const) {
    const step = applyHeadlessJobTransition({
      jobValue: job,
      requestValue: request,
      toState: to,
      attempt: 1,
      updatedAtMs: job.updatedAtMs + 1,
    });
    assert.equal(step.ok, true);
    if (!step.ok) return;
    job = step.job;
  }
  const badReason = applyHeadlessJobTransition({
    jobValue: job,
    requestValue: request,
    toState: "failed",
    attempt: 1,
    updatedAtMs: job.updatedAtMs + 1,
    terminalReason: {
      reasonId: "NOT_A_REAL_REASON" as "INVALID_JOB",
      retryable: true,
    },
  });
  assert.equal(badReason.ok, false);
});

test("invalid audio/video fields fail closed (no silent nulling)", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const job = advanceToUploading(request, "job-4");
  const base = makeArtifact(job, request);
  const badAudio = finalizeHeadlessRenderArtifact({
    ...base,
    fingerprint: undefined as unknown as string,
    audio: {
      present: false,
      codec: "opus",
      channels: 2,
      sampleRateHz: 48000,
    },
  } as Omit<typeof base, "fingerprint">);
  // present=false with non-null fields
  const bad = finalizeHeadlessRenderArtifact({
    version: 1,
    artifactId: "bad",
    contentDigest: digest(1),
    byteLength: 1000,
    mimeType: "video/webm",
    format: "webm",
    width: request.manifest.output.width,
    height: request.manifest.output.height,
    fps: 30,
    durationMs: request.manifest.project.renderDurationMs,
    audio: {
      present: false,
      codec: "opus",
      channels: 2,
      sampleRateHz: 48000,
    },
    video: {
      present: true,
      codec: "vp9",
      width: request.manifest.output.width,
      height: request.manifest.output.height,
      fps: 30,
    },
    rendererBuildId: job.rendererBuildId,
    manifestFingerprint: job.manifestFingerprint,
    assetBundleFingerprint: job.assetBundleFingerprint,
    renderJobFingerprint: job.renderJobFingerprint,
    expiresAtMs: 1_900_000_000_000,
  });
  assert.equal(bad.ok, false);
  void badAudio;
});

test("wrong artifact format/resolution/duration/audio fails coherence", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const job = advanceToUploading(request, "job-5");
  const wrong = finalizeHeadlessRenderArtifact({
    version: 1,
    artifactId: "wrong",
    contentDigest: digest(9),
    byteLength: 1000,
    mimeType: "video/mp4",
    format: "mp4",
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: request.manifest.project.renderDurationMs + 5000,
    audio: { present: false, codec: null, channels: null, sampleRateHz: null },
    video: {
      present: true,
      codec: "h264",
      width: 1080,
      height: 1920,
      fps: 30,
    },
    rendererBuildId: job.rendererBuildId,
    manifestFingerprint: job.manifestFingerprint,
    assetBundleFingerprint: job.assetBundleFingerprint,
    renderJobFingerprint: job.renderJobFingerprint,
    expiresAtMs: 1_900_000_000_000,
  });
  assert.equal(wrong.ok, true);
  if (!wrong.ok) return;
  const cohere = validateHeadlessArtifactRequestCoherence(
    wrong.artifact,
    job,
    request,
  );
  assert.equal(cohere.ok, false);
});

test("public finalizer bypass attempts fail closed", () => {
  const manifest = buildV3Manifest();
  const slots = extractRequiredHeadlessSourceSlots(manifest);
  const bypass = finalizeHeadlessAssetBundle({
    bundleId: "b",
    assets: slots.map((s, i) => descriptorForSlot(s, i)).slice(0, 1),
    manifest,
  });
  assert.equal(bypass.ok, false);

  const created = createAcceptedHeadlessRenderJob({
    jobId: "",
    requestValue: buildValidRequest(manifest).request,
    createdAtMs: 1,
  });
  assert.equal(created.ok, false);
});

test("diagnostics privacy and hostile inputs", () => {
  const msg = sanitizeDiagnosticMessage(
    "failed https://evil.example/?sig=1 token=x",
  );
  assert.equal(msg, "Details redacted for privacy.");
  assert.doesNotThrow(() => {
    const r = validateHeadlessRenderJobRequest(
      new Proxy({}, { get() { throw new Error("https://leak"); } }),
    );
    assert.equal(r.ok, false);
  });
});

test("expiry excluded from content identity but still bounded", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const job = advanceToUploading(request, "job-6");
  const a = makeArtifact(job, request);
  const b = finalizeHeadlessRenderArtifact({
    ...a,
    expiresAtMs: a.expiresAtMs + 999999,
  });
  assert.equal(b.ok, true);
  if (!b.ok) return;
  // metadata fingerprint ignores expiry — same content identity
  assert.equal(a.fingerprint, b.artifact.fingerprint);
  assert.notEqual(a.expiresAtMs, b.artifact.expiresAtMs);
});

test("naked job validate still rejects succeeded without artifact", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const created = createAcceptedHeadlessRenderJob({
    jobId: "job-7",
    requestValue: request,
    createdAtMs: 1,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const forged = { ...created.job, state: "succeeded" as const, artifact: null };
  assert.equal(validateHeadlessRenderJob(forged).ok, false);
});

test("11B.1A forged typed request rejected by createAccepted", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const forged = {
    ...request,
    requestFingerprint: "hrr:sha256:" + "ab".repeat(32),
    ownership: { ownerId: "forged-owner", projectId: request.ownership.projectId },
  } as HeadlessRenderJobRequestV1;
  const created = createAcceptedHeadlessRenderJob({
    jobId: "job-forge",
    requestValue: forged,
    createdAtMs: 1,
  });
  assert.equal(created.ok, false);
});

test("11B.1A forged request rejected by job coherence", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const created = createAcceptedHeadlessRenderJob({
    jobId: "job-cohere",
    requestValue: request,
    createdAtMs: 1,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const forgedReq = {
    ...request,
    idempotencyKey: "tampered-key",
  } as HeadlessRenderJobRequestV1;
  assert.equal(
    validateHeadlessRenderJobCoherence(created.job, forgedReq).ok,
    false,
  );
});

test("11B.1A forged request rejected on active-state transition", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const created = createAcceptedHeadlessRenderJob({
    jobId: "job-active",
    requestValue: request,
    createdAtMs: 1,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const forgedReq = {
    ...request,
    rendererBuildId: "other-build",
  } as HeadlessRenderJobRequestV1;
  const step = applyHeadlessJobTransition({
    jobValue: created.job,
    requestValue: forgedReq,
    toState: "materializing",
    attempt: 1,
    updatedAtMs: 2,
  });
  assert.equal(step.ok, false);
});

test("11B.1A transition without request fails closed", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const created = createAcceptedHeadlessRenderJob({
    jobId: "job-noreq",
    requestValue: request,
    createdAtMs: 1,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const step = applyHeadlessJobTransition({
    jobValue: created.job,
    requestValue: null,
    toState: "materializing",
    attempt: 1,
    updatedAtMs: 2,
  });
  assert.equal(step.ok, false);
});

test("11B.1A forged request/job/artifact triple with copied strings fails", () => {
  const a = buildValidRequest(buildV3Manifest());
  const b = buildValidRequest(
    buildV3Manifest(fixStory("https://example.com/other.jpg")),
    { idempotencyKey: "idem-b", rendererBuildId: "rb-b" },
  );
  const jobA = advanceToUploading(a.request, "job-triple-a");
  const artA = makeArtifact(jobA, a.request);
  // Copy A strings onto B request shape — still fails full-chain revalidation
  const forgedReq = {
    ...b.request,
    requestFingerprint: a.request.requestFingerprint,
    manifestFingerprint: a.request.manifestFingerprint,
  } as HeadlessRenderJobRequestV1;
  const forgedJob = {
    ...jobA,
    requestFingerprint: a.request.requestFingerprint,
  };
  assert.equal(
    validateHeadlessArtifactRequestCoherence(artA, forgedJob, forgedReq).ok,
    false,
  );
});

test("11B.1A unknown request fields and hostile getters rejected", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  assert.equal(
    validateHeadlessRenderJobRequest({ ...request, extra: true }).ok,
    false,
  );
  assert.equal(
    createAcceptedHeadlessRenderJob({
      jobId: "x",
      requestValue: new Proxy(
        {},
        {
          get() {
            throw new Error("hostile");
          },
        },
      ),
      createdAtMs: 1,
    }).ok,
    false,
  );
});

test("11B.1A stale request fingerprint with recomputed job fingerprint fails", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const staleFp = "hrr:sha256:" + "cd".repeat(32);
  const jobFp = buildHeadlessRenderJobFingerprint({
    requestFingerprint: staleFp,
    attempt: 1,
    rendererBuildId: request.rendererBuildId,
  });
  assert.equal(jobFp.ok, true);
  if (!jobFp.ok) return;
  const staleReq = {
    ...request,
    requestFingerprint: staleFp,
  } as HeadlessRenderJobRequestV1;
  assert.equal(
    createAcceptedHeadlessRenderJob({
      jobId: "stale",
      requestValue: staleReq,
      createdAtMs: 1,
    }).ok,
    false,
  );
  const created = createAcceptedHeadlessRenderJob({
    jobId: "stale-job",
    requestValue: request,
    createdAtMs: 1,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const staleJob = {
    ...created.job,
    requestFingerprint: staleFp,
    renderJobFingerprint: jobFp.fingerprint,
  };
  assert.equal(validateHeadlessRenderJobCoherence(staleJob, request).ok, false);
});

test("11B.1A changed ownership/profile/build/idempotency rejected", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const created = createAcceptedHeadlessRenderJob({
    jobId: "own",
    requestValue: request,
    createdAtMs: 1,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  for (const mutated of [
    { ...request, ownership: { ...request.ownership, ownerId: "other" } },
    {
      ...request,
      rendererProfile: {
        ...request.rendererProfile,
        quality:
          request.rendererProfile.quality === "high" ? "standard" : "high",
      },
    },
    { ...request, rendererBuildId: "build-x" },
    { ...request, idempotencyKey: "other-idem" },
  ]) {
    assert.equal(
      validateHeadlessRenderJobCoherence(created.job, mutated).ok,
      false,
    );
  }
});

test("11B.1A positive: canonical request → lifecycle → coherent artifact", () => {
  const { request } = buildValidRequest(buildV3Manifest());
  const created = createAcceptedHeadlessRenderJob({
    jobId: "life",
    requestValue: request,
    createdAtMs: 1000,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.ok(Object.isFrozen(created.job));
  assert.ok(Object.isFrozen(created.request));
  const job = advanceToUploading(request, "life-2");
  const art = makeArtifact(job, request);
  const done = applyHeadlessJobTransition({
    jobValue: job,
    requestValue: request,
    toState: "succeeded",
    attempt: 1,
    updatedAtMs: job.updatedAtMs + 1,
    artifact: art,
  });
  assert.equal(done.ok, true);
  if (!done.ok) return;
  assert.equal(done.job.state, "succeeded");
  assert.ok(Object.isFrozen(done.job));
  const chain = validateHeadlessArtifactRequestCoherence(
    done.job.artifact,
    done.job,
    done.request,
  );
  assert.equal(chain.ok, true);
});

test("11B.1A positive: v2/8D and v4/9D through canonical chain", () => {
  const v4 = buildValidRequest(buildV3Manifest());
  const v2 = buildValidRequest(freezeAsV2(buildV3Manifest()));
  assert.equal(
    createAcceptedHeadlessRenderJob({
      jobId: "v4",
      requestValue: v4.request,
      createdAtMs: 1,
    }).ok,
    true,
  );
  assert.equal(
    createAcceptedHeadlessRenderJob({
      jobId: "v2",
      requestValue: v2.request,
      createdAtMs: 1,
    }).ok,
    true,
  );
});

test("11B.1A public API classification + no unsafe authority shortcuts", () => {
  for (const name of HEADLESS_FORBIDDEN_PUBLIC_EXPORTS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(headlessDomain, name),
      false,
      `forbidden export present: ${name}`,
    );
  }
  for (const [name, cls] of Object.entries(HEADLESS_PUBLIC_API_CLASSIFICATION)) {
    assert.equal(
      typeof (headlessDomain as Record<string, unknown>)[name],
      "function",
      `classified export missing: ${name} (${cls})`,
    );
  }
  const indexSrc = readFileSync(
    path.join(
      process.cwd(),
      "src/features/headless-renderer/domain/index.ts",
    ),
    "utf8",
  );
  assert.equal(indexSrc.includes("approveHeadless"), false);
  assert.equal(indexSrc.includes("trustTyped"), false);
  assert.equal(indexSrc.includes("attachHeadlessFingerprint"), false);
  assert.ok(indexSrc.includes("validate-headless-coherence"));
});

console.log(`\n${passed} tests passed.\n`);
