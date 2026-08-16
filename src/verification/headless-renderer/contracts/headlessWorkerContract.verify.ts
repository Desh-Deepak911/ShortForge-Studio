/**
 * Sprint 11D Phase 1A — Worker contract / frame-plan / spawn / authority gates.
 * Run: npm run test:headless-worker-contract
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { buildHeadlessFramePlan } from "@/features/headless-renderer/worker/runtime/frame-plan";
import { resolveHeadlessRenderTarget } from "@/features/headless-renderer/worker/runtime/render-target";
import { assertClaimedWorkerJob } from "@/features/headless-renderer/worker/runtime/claim-gate";
import type { ExportManifest } from "@/features/export/domain";
import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";
import {
  redactSpawnDiagnostics,
  spawnFixedArgv,
  terminateProcessTree,
} from "@/features/headless-renderer/worker/ffmpeg/spawn-process";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import { WorkspaceByteBudget } from "@/features/headless-renderer/worker/assets/workspace-quota";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { isExportManifestV5 } from "@/features/export/domain";
import {
  buildHeadlessChromeLaunchArgs,
  chromeLaunchArgsContainNoSandbox,
} from "@/features/headless-renderer/worker/chromium/chrome-launch-args";
import { isAllowedHeadlessPageRequest } from "@/features/headless-renderer/worker/chromium/network-policy";
import { startHeadlessAssetServer } from "@/features/headless-renderer/worker/chromium/asset-server";
import { rewriteManifestMediaToLocalAssets } from "@/features/headless-renderer/worker/assets/rewrite-manifest-urls";
import { assertPhase1WorkerCapability } from "@/features/headless-renderer/worker/runtime/capability-preflight";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  HEADLESS_WORKER_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import { scrubWorkerMessage } from "@/features/headless-renderer/worker/diagnostics/scrub-worker-message";
import {
  applyHeadlessJobTransition,
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  headlessSourceDigest,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { buildValidatedHeadlessArtifact } from "@/features/headless-renderer/worker/artifact/build-validated-artifact";
import {
  isCanonicalHeadlessFps30,
  parseFfprobeFrameRate,
} from "@/features/headless-renderer/worker/ffmpeg/canonical-fps";
import { isOutputAtOrOverCeiling } from "@/features/headless-renderer/worker/ffmpeg/output-ceiling";

function digestOfBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

let passed = 0;

function targetFor(
  manifest: ExportManifest,
  profile: HeadlessRendererProfile,
) {
  const resolved = resolveHeadlessRenderTarget(profile);
  assert.equal(resolved.ok, true);
  if (!resolved.ok) {
    throw new Error(
      String((resolved as { message?: unknown }).message ?? "target failed"),
    );
  }
  return resolved.target;
}

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

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("\nSprint 11D Phase 1A — Worker contract\n");

  test("preflight: system Chrome + native ffmpeg/ffprobe available", () => {
    const chrome = resolveSystemChromeExecutable();
    assert.equal(chrome.ok, true, chrome.ok ? "" : chrome.message);
    const ffmpeg = resolveNativeFfmpegBinaries();
    assert.equal(ffmpeg.ok, true, ffmpeg.ok ? "" : ffmpeg.message);
  });

  test("frame plan: frame-zero and final-frame boundaries", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 2000 });
    assert.equal(isExportManifestV5(fixture.manifestV3), true);
    const plan = buildHeadlessFramePlan(
      fixture.manifestV3,
      10_000,
      targetFor(fixture.manifestV3, fixture.rendererProfile),
    );
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.plan.frames[0]?.frameIndex, 0);
    assert.equal(plan.plan.frames[0]?.timestampMs, Math.round(1000 / 30 / 2));
    const last = plan.plan.frames[plan.plan.totalFrames - 1]!;
    assert.equal(last.frameIndex, plan.plan.totalFrames - 1);
    assert.ok(last.timestampMs >= 0);
  });

  test("frame plan: v3 intra-scene mid-frame present; v2 hard-cut has none", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 2000 });
    const target = targetFor(fixture.manifestV3, fixture.rendererProfile);
    const v3 = buildHeadlessFramePlan(fixture.manifestV3, 10_000, target);
    assert.equal(v3.ok, true);
    if (!v3.ok) return;
    assert.ok(v3.plan.frames.some((f) => f.hasIntraSceneTransition));

    const v2 = buildHeadlessFramePlan(fixture.manifestV2, 10_000, target);
    assert.equal(v2.ok, true);
    if (!v2.ok) return;
    assert.equal(
      v2.plan.frames.every((f) => !f.hasIntraSceneTransition),
      true,
    );
  });

  test("frame plan: captions appear on some frames", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 2000 });
    const plan = buildHeadlessFramePlan(
      fixture.manifestV3,
      10_000,
      targetFor(fixture.manifestV3, fixture.rendererProfile),
    );
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.ok(plan.plan.frames.some((f) => f.captionCount > 0));
  });

  test("frame plan: maxFrames comes from profile∩provider (streaming-bounded)", () => {
    assert.ok(DEFAULT_HEADLESS_WORKER_LIMITS.maxFrames >= 1812);
    assert.ok(DEFAULT_HEADLESS_WORKER_LIMITS.maxFrames < 30 * 600);
  });

  test("claim gate rejects mismatched claim token", () => {
    const rejection = assertClaimedWorkerJob({
      record: {
        version: 1,
        stage: "canonical",
        storeVersion: 1,
        jobId: "job_claim_gate",
        ownerId: "o",
        projectId: "p",
        createdAtMs: 1,
        updatedAtMs: 1,
        claimToken: "claim_a",
        claimedAtMs: 1,
        artifactObjectBinding: null,
        idempotencyAuthorityKey: "hid:sha256:" + "ab".repeat(32),
        canonicalRequest: {
          ownership: { ownerId: "o", projectId: "p" },
          assetBundle: { assets: [] },
        },
        canonicalJob: {
          ownership: { ownerId: "o", projectId: "p" },
          state: "queued",
          updatedAtMs: 1,
        },
      } as never,
      claimToken: "claim_b",
      ownerId: "o",
      nowMs: 2,
    });
    assert.ok(rejection);
    assert.equal(rejection?.reasonId, "STALE_ATTEMPT");
  });

  test("sandbox: default Chrome argv contains no --no-sandbox", () => {
    const args = buildHeadlessChromeLaunchArgs();
    assert.equal(chromeLaunchArgsContainNoSandbox(args), false);
    const opted = buildHeadlessChromeLaunchArgs({
      allowNoSandboxWithExternalIsolation: true,
    });
    assert.equal(chromeLaunchArgsContainNoSandbox(opted), true);
  });

  test("network: exact origin equality; hostile URLs rejected", () => {
    const allowed = "http://127.0.0.1:34567";
    assert.equal(
      isAllowedHeadlessPageRequest({
        requestUrl: `${allowed}/assets/a.png`,
        allowedOrigin: allowed,
      }),
      true,
    );
    assert.equal(
      isAllowedHeadlessPageRequest({
        requestUrl: "about:blank",
        allowedOrigin: allowed,
      }),
      true,
    );
    // Neighboring loopback port
    assert.equal(
      isAllowedHeadlessPageRequest({
        requestUrl: "http://127.0.0.1:34568/x",
        allowedOrigin: allowed,
      }),
      false,
    );
    // userinfo trick
    assert.equal(
      isAllowedHeadlessPageRequest({
        requestUrl: "http://evil@127.0.0.1:34567/x",
        allowedOrigin: allowed,
      }),
      false,
    );
    // hostname suffix / alternate host
    assert.equal(
      isAllowedHeadlessPageRequest({
        requestUrl: "http://127.0.0.1.evil.example/x",
        allowedOrigin: allowed,
      }),
      false,
    );
    // scheme
    assert.equal(
      isAllowedHeadlessPageRequest({
        requestUrl: "https://127.0.0.1:34567/x",
        allowedOrigin: allowed,
      }),
      false,
    );
    // websocket
    assert.equal(
      isAllowedHeadlessPageRequest({
        requestUrl: "ws://127.0.0.1:34567/x",
        allowedOrigin: allowed,
      }),
      false,
    );
    // data: not allowlisted (canvas toDataURL is not a network request)
    assert.equal(
      isAllowedHeadlessPageRequest({
        requestUrl: "data:image/png;base64,aaa",
        allowedOrigin: allowed,
      }),
      false,
    );
  });

  test("diagnostics: scrubbed messages never contain paths/urls", () => {
    const msg = scrubWorkerMessage("chromium", "/Users/me/secret https://x");
    assert.equal(msg.includes("/Users"), false);
    assert.equal(msg.includes("https://"), false);
  });

  test("capability: accept silent/voice/voice+music; reject profile/manifest mismatch / build mismatch", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    const baseReq = {
      rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      rendererProfile: {
        resolution: "720p" as const,
        format: "webm" as const,
        fps: 30 as const,
        quality: fixture.manifestV3.output.quality,
      },
      manifest: fixture.manifestV3,
    };

    assert.equal(assertPhase1WorkerCapability({ request: baseReq as never }), null);

    // Profile format without matching manifest output → reject before Chromium.
    assert.equal(
      assertPhase1WorkerCapability({
        request: {
          ...baseReq,
          rendererProfile: { ...baseReq.rendererProfile, format: "mp4" },
        } as never,
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );
    // Profile resolution without matching manifest pixels → reject.
    assert.equal(
      assertPhase1WorkerCapability({
        request: {
          ...baseReq,
          rendererProfile: { ...baseReq.rendererProfile, resolution: "1080p" },
        } as never,
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );

    const mp4Fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    assert.equal(
      assertPhase1WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: {
            resolution: "720p",
            format: "mp4",
            fps: 30,
            quality: mp4Fixture.manifestV3.output.quality,
          },
          manifest: mp4Fixture.manifestV3,
        } as never,
      }),
      null,
    );

    const p1080Fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "1080p", format: "webm", quality: "high" },
    });
    assert.equal(
      assertPhase1WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: {
            resolution: "1080p",
            format: "webm",
            fps: 30,
            quality: p1080Fixture.manifestV3.output.quality,
          },
          manifest: p1080Fixture.manifestV3,
        } as never,
      }),
      null,
    );

    assert.equal(
      assertPhase1WorkerCapability({
        request: {
          ...baseReq,
          rendererBuildId: "wrong-build",
        } as never,
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );

    const voiceFixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1000,
    });
    assert.equal(
      assertPhase1WorkerCapability({
        request: {
          ...baseReq,
          manifest: voiceFixture.manifestV3,
        } as never,
      }),
      null,
    );

    const mixFixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice-and-music",
      durationMs: 1000,
    });
    assert.equal(
      assertPhase1WorkerCapability({
        request: {
          ...baseReq,
          manifest: mixFixture.manifestV3,
        } as never,
      }),
      null,
    );
  });

  test("slot mapping: repeated source digest across different slots stays distinct", () => {
    const shared = "https://fixture.local/shared.png";
    const digest = headlessSourceDigest(shared);
    const keyA = headlessSourceSlotKey({
      role: "scene_media",
      sceneId: "s1",
      mediaItemId: "m1",
      sourceDigest: digest,
    });
    const keyB = headlessSourceSlotKey({
      role: "scene_media",
      sceneId: "s1",
      mediaItemId: "m2",
      sourceDigest: digest,
    });
    assert.notEqual(keyA, keyB);

    const staged = [
      {
        assetId: "a1",
        sourceIdentity: {
          role: "scene_media" as const,
          sceneId: "scene-1",
          mediaItemId: "item-a",
          sourceDigest: digest,
          classification: "https" as const,
        },
        sourceDigest: digest,
        slotKey: headlessSourceSlotKey({
          role: "scene_media",
          sceneId: "scene-1",
          mediaItemId: "item-a",
          sourceDigest: digest,
        }),
        mimeType: "image/png",
        absolutePath: "/tmp/a",
        relativeUrlPath: "assets/a.png",
        byteLength: 1,
      },
      {
        assetId: "a2",
        sourceIdentity: {
          role: "scene_media" as const,
          sceneId: "scene-1",
          mediaItemId: "item-b",
          sourceDigest: digest,
          classification: "https" as const,
        },
        sourceDigest: digest,
        slotKey: headlessSourceSlotKey({
          role: "scene_media",
          sceneId: "scene-1",
          mediaItemId: "item-b",
          sourceDigest: digest,
        }),
        mimeType: "image/png",
        absolutePath: "/tmp/b",
        relativeUrlPath: "assets/b.png",
        byteLength: 1,
      },
    ];

    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    // Force both timeline items in scene-1 to the same source string.
    const scene = fixture.manifestV3.scenes[0]!;
    const items = scene.mediaTimeline.items.map((item, idx) => ({
      ...item,
      media: {
        ...item.media,
        type: "image" as const,
        source: shared,
      },
      id: idx === 0 ? "item-a" : "item-b",
    }));
    const draft = {
      ...fixture.manifestV3,
      scenes: [
        {
          ...scene,
          media: { ...scene.media, type: "image" as const, source: shared },
          mediaTimeline: { ...scene.mediaTimeline, items },
        },
        ...fixture.manifestV3.scenes.slice(1),
      ],
    };

    // Build a single-scene manifest for this unit check:
    const single = {
      ...draft,
      scenes: [draft.scenes[0]!],
      project: {
        ...draft.project,
        renderDurationMs: draft.scenes[0]!.durationMs,
      },
    };
    const ok = rewriteManifestMediaToLocalAssets({
      manifest: single as never,
      staged: staged as never,
      origin: "http://127.0.0.1:9",
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const urls = ok.manifest.scenes[0]!.mediaTimeline.items.map(
      (i) => (i.media as { source?: string }).source,
    );
    assert.equal(urls[0], "http://127.0.0.1:9/assets/a.png");
    assert.equal(urls[1], "http://127.0.0.1:9/assets/b.png");
  });

  test("probe authority: missing/wrong codec and invented-audio rejected", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    const bytes = new Uint8Array(64).fill(7);
    const badCodec = buildValidatedHeadlessArtifact({
      contentDigest: digestOfBytes(bytes),
      byteLength: bytes.byteLength,
      probe: {
        width: 720,
        height: 1280,
        fps: 30,
        durationMs: 1000,
        hasVideo: true,
        hasAudio: false,
        videoCodec: "h264",
        audioCodec: null,
        audioChannels: null,
        audioSampleRateHz: null,
        formatName: "matroska,webm",
        pixelFormat: "yuv420p",
      },
      request: {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "high",
        },
        manifestFingerprint: fixture.manifestV3.fingerprint,
        assetBundle: { fingerprint: "b".repeat(64) },
        manifest: fixture.manifestV3,
      } as never,
      job: {
        jobId: "job_probe",
        renderJobFingerprint: "c".repeat(64),
      } as never,
      nowMs: 1,
      evidenceBase: {
        chromeVersion: "x",
        ffmpegVersion: "y",
        ffprobeVersion: "z",
        elapsedRenderMs: 1,
        frameCount: 1,
        nodeCoordinatorPeakRssBytes: null,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        audioChannels: null,
        audioSampleRateHz: null,
      } as never,
    });
    assert.equal(badCodec.ok, false);

    const wrongContainer = buildValidatedHeadlessArtifact({
      contentDigest: digestOfBytes(bytes),
      byteLength: bytes.byteLength,
      probe: {
        width: 720,
        height: 1280,
        fps: 30,
        durationMs: 1000,
        hasVideo: true,
        hasAudio: false,
        videoCodec: "vp9",
        audioCodec: null,
        audioChannels: null,
        audioSampleRateHz: null,
        formatName: "mp4",
        pixelFormat: "yuv420p",
      },
      request: {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "high",
        },
        manifestFingerprint: fixture.manifestV3.fingerprint,
        assetBundle: { fingerprint: "b".repeat(64) },
        manifest: fixture.manifestV3,
      } as never,
      job: {
        jobId: "job_probe2",
        renderJobFingerprint: "c".repeat(64),
      } as never,
      nowMs: 1,
      evidenceBase: {
        chromeVersion: "x",
        ffmpegVersion: "y",
        ffprobeVersion: "z",
        elapsedRenderMs: 1,
        frameCount: 1,
        nodeCoordinatorPeakRssBytes: null,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        audioChannels: null,
        audioSampleRateHz: null,
      } as never,
    });
    assert.equal(wrongContainer.ok, false);

    const missingAudioFacts = buildValidatedHeadlessArtifact({
      contentDigest: digestOfBytes(bytes),
      byteLength: bytes.byteLength,
      probe: {
        width: 720,
        height: 1280,
        fps: 30,
        durationMs: 1000,
        hasVideo: true,
        hasAudio: true,
        videoCodec: "vp9",
        audioCodec: "opus",
        audioChannels: null,
        audioSampleRateHz: null,
        formatName: "webm",
        pixelFormat: "yuv420p",
      },
      request: {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "high",
        },
        manifestFingerprint: fixture.manifestV3.fingerprint,
        assetBundle: { fingerprint: "b".repeat(64) },
        manifest: {
          ...fixture.manifestV3,
          audio: { ...fixture.manifestV3.audio, mode: "with-voice" },
        },
      } as never,
      job: {
        jobId: "job_probe3",
        renderJobFingerprint: "c".repeat(64),
      } as never,
      nowMs: 1,
      evidenceBase: {
        chromeVersion: "x",
        ffmpegVersion: "y",
        ffprobeVersion: "z",
        elapsedRenderMs: 1,
        frameCount: 1,
        nodeCoordinatorPeakRssBytes: null,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        audioChannels: null,
        audioSampleRateHz: null,
      } as never,
    });
    assert.equal(missingAudioFacts.ok, false);

    const buildMismatch = buildValidatedHeadlessArtifact({
      contentDigest: digestOfBytes(bytes),
      byteLength: bytes.byteLength,
      probe: {
        width: 720,
        height: 1280,
        fps: 30,
        durationMs: 1000,
        hasVideo: true,
        hasAudio: false,
        videoCodec: "vp9",
        audioCodec: null,
        audioChannels: null,
        audioSampleRateHz: null,
        formatName: "webm",
        pixelFormat: "yuv420p",
      },
      request: {
        rendererBuildId: "other-build",
        manifestFingerprint: fixture.manifestV3.fingerprint,
        assetBundle: { fingerprint: "b".repeat(64) },
        manifest: fixture.manifestV3,
      } as never,
      job: {
        jobId: "job_probe4",
        renderJobFingerprint: "c".repeat(64),
      } as never,
      nowMs: 1,
      evidenceBase: {
        chromeVersion: "x",
        ffmpegVersion: "y",
        ffprobeVersion: "z",
        elapsedRenderMs: 1,
        frameCount: 1,
        nodeCoordinatorPeakRssBytes: null,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        audioChannels: null,
        audioSampleRateHz: null,
      } as never,
    });
    assert.equal(buildMismatch.ok, false);
  });

  test("workspace quota: reserve/commit/release + ceilings", () => {
    const budget = new WorkspaceByteBudget({
      ...DEFAULT_HEADLESS_WORKER_LIMITS,
      maxSingleFrameBytes: 10,
      maxAggregateFrameBytes: 20,
      maxWorkspaceBytes: 100,
      maxArtifactBytes: 50,
      maxGeneratedBundleBytes: 30,
    });
    assert.equal(budget.assertCanWrite(11, "frame").ok, false);

    const bundleOver = budget.reserve(31, "bundle");
    assert.equal(bundleOver.ok, false);

    const html = budget.reserve(8, "html");
    assert.equal(html.ok, true);
    if (!html.ok) return;
    budget.commit(html.reservationId, 8);
    assert.equal(budget.remainingWorkspaceCapacity(), 92);

    const artDenied = budget.reserve(51, "artifact");
    assert.equal(artDenied.ok, false);

    const art = budget.reserve(40, "artifact");
    assert.equal(art.ok, true);
    if (!art.ok) return;
    // Cancel/fail releases reservation without committing.
    budget.release(art.reservationId);
    assert.equal(budget.remainingWorkspaceCapacity(), 92);

    const frames = budget.reserve(10, "frame");
    assert.equal(frames.ok, true);
    if (!frames.ok) return;
    budget.commit(frames.reservationId, 10);
    // Combined assets(html) + frames + artifact cannot exceed workspace.
    const tooBig = budget.reserve(83, "artifact");
    assert.equal(tooBig.ok, false);
    assert.ok(budget.authorizedArtifactCeilingBytes() <= 50);
    assert.ok(budget.authorizedArtifactCeilingBytes() <= budget.remainingWorkspaceCapacity());
  });

  test("probe authority: tolerance-valid duration persists probed value not expected", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 2400 });
    const expected = fixture.manifestV3.project.renderDurationMs;
    // Manifest expected duration remains the tolerance baseline (may include
    // canonical project padding beyond the requested clip length).
    assert.ok(expected >= 2400);
    const probedDuration = expected - 20; // within 50ms tolerance, ≠ expected
    const hab = buildHeadlessAuthorityFingerprint("hab", {
      kind: "probe-dur-fixture",
    });
    const hrj = buildHeadlessAuthorityFingerprint("hrj", {
      kind: "probe-dur-fixture",
    });
    assert.equal(hab.ok && hrj.ok, true);
    if (!hab.ok || !hrj.ok) return;
    const bytes = new Uint8Array(64).fill(7);
    const built = buildValidatedHeadlessArtifact({
      contentDigest: digestOfBytes(bytes),
      byteLength: bytes.byteLength,
      probe: {
        width: 720,
        height: 1280,
        fps: 30,
        durationMs: probedDuration,
        hasVideo: true,
        hasAudio: false,
        videoCodec: "vp9",
        audioCodec: null,
        audioChannels: null,
        audioSampleRateHz: null,
        formatName: "matroska,webm",
        pixelFormat: "yuv420p",
      },
      request: {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "high",
        },
        manifestFingerprint: fixture.manifestV3.fingerprint,
        assetBundle: { fingerprint: hab.fingerprint },
        manifest: fixture.manifestV3,
      } as never,
      job: {
        jobId: "job_probe_dur",
        renderJobFingerprint: hrj.fingerprint,
      } as never,
      nowMs: 1,
      evidenceBase: {
        chromeVersion: "x",
        ffmpegVersion: "y",
        ffprobeVersion: "z",
        elapsedRenderMs: 1,
        frameCount: 1,
        nodeCoordinatorPeakRssBytes: null,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        audioChannels: null,
        audioSampleRateHz: null,
      } as never,
    });
    assert.equal(built.ok, true, built.ok ? "" : built.message);
    if (!built.ok) return;
    assert.equal(built.artifact.durationMs, probedDuration);
    assert.notEqual(built.artifact.durationMs, expected);
    assert.equal(built.evidence.durationMs, probedDuration);
    assert.equal(built.artifact.fps, 30);
    assert.equal(built.evidence.fps, built.artifact.fps);
  });

  await testAsync("asset server: symlink escape rejected via realpath", async () => {
    const ws = createHeadlessWorkerWorkspace({ jobId: "job_symlink", attempt: 1 });
    writeFileSync(path.join(ws.rootDir, "ok.txt"), "safe");
    const outside = path.join(ws.rootDir, "..", `escape-${Date.now()}.txt`);
    writeFileSync(outside, "secret");
    symlinkSync(outside, path.join(ws.rootDir, "link.txt"));
    const server = await startHeadlessAssetServer({ rootDir: ws.rootDir });
    try {
      const res = await fetch(`${server.origin}/link.txt`);
      assert.equal(res.status, 403);
      const ok = await fetch(`${server.origin}/ok.txt`);
      assert.equal(ok.status, 200);
    } finally {
      await server.close();
      ws.cleanup();
    }
  });

  await testAsync("claim lease: live claim rejected; expired reclaimable/fail-closed", async () => {
    const store = new MemoryHeadlessJobStoreAdapter();
    // Minimal create via compare path: use createJob if available
    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    // Use control-plane seed path is heavy; exercise recover API with manual insert via create
    const { composeTestHeadlessControlPlane, seedOwnedManifestAndBundle } =
      await import("@/features/headless-renderer/control-plane/testing");
    const { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } = await import(
      "@/features/headless-renderer/control-plane/types/control-plane.types"
    );

    let clock = 1_700_000_000_000;
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId: "owner-lease",
        sessionId: "sess-lease",
      },
    authorizedProjectIds: [fixture.manifestV3.project.projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "owner-lease",
      projectId: fixture.manifestV3.project.projectId,
      manifest: fixture.manifestV3,
      nowMs: clock,
      leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
      assetByteFactory: (slot) => {
        for (const [url, bytes] of fixture.assetBytesByUrl) {
          if (headlessSourceDigest(url) === slot.sourceDigest) return bytes;
        }
        throw new Error("missing");
      },
      mimeForSlot: () => "image/png",
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;

    const created = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify({
        version: 1,
        projectId: fixture.manifestV3.project.projectId,
        manifestObject: seeded.value.manifestLocator,
        manifestPayloadDigest: seeded.value.manifestPayloadDigest,
        assetBundleObject: seeded.value.bundleLocator,
        assetBundleFingerprint: seeded.value.bundle.fingerprint,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: fixture.manifestV3.output.quality,
        },
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        idempotencyKey: "lease-1",
      }),
      body: {
        version: 1,
        projectId: fixture.manifestV3.project.projectId,
        manifestObject: seeded.value.manifestLocator,
        manifestPayloadDigest: seeded.value.manifestPayloadDigest,
        assetBundleObject: seeded.value.bundleLocator,
        assetBundleFingerprint: seeded.value.bundle.fingerprint,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: fixture.manifestV3.output.quality,
        },
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        idempotencyKey: "lease-1",
      },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const jobId = created.value.jobId;
    const rec = await stack.jobStore.getByJobIdAndOwner(jobId, "owner-lease");
    assert.equal(rec.ok, true);
    if (!rec.ok) return;

    const claimed = await stack.jobStore.claimQueuedJob({
      jobId,
      ownerId: "owner-lease",
      expectedStoreVersion: rec.value.storeVersion,
      claimToken: "claim_live",
      nowMs: clock,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);

    const live = await stack.jobStore.recoverExpiredClaim({
      jobId,
      ownerId: "owner-lease",
      nowMs: clock + 1000,
      leaseMs: DEFAULT_HEADLESS_WORKER_LIMITS.claimLeaseMs,
    });
    assert.equal(live.ok && live.value.kind === "rejected_live_claim", true);

    // Advance past lease while still queued (claimed but not progressed) → fail closed.
    clock += DEFAULT_HEADLESS_WORKER_LIMITS.claimLeaseMs + 1;
    const expiredQueued = await stack.jobStore.recoverExpiredClaim({
      jobId,
      ownerId: "owner-lease",
      nowMs: clock,
      leaseMs: DEFAULT_HEADLESS_WORKER_LIMITS.claimLeaseMs,
    });
    assert.equal(
      expiredQueued.ok && expiredQueued.value.kind === "failed_expired",
      true,
    );
    if (!expiredQueued.ok || expiredQueued.value.kind !== "failed_expired") return;
    assert.equal(
      expiredQueued.value.record.canonicalJob!.terminalReason?.reasonId,
      "CLAIM_LEASE_EXPIRED",
    );

    // Terminal never reclaimed
    const terminal = await stack.jobStore.recoverExpiredClaim({
      jobId,
      ownerId: "owner-lease",
      nowMs: clock + 1,
      leaseMs: 1,
    });
    assert.equal(
      terminal.ok && terminal.value.kind === "rejected_terminal",
      true,
    );

    // Stale late write against terminal fails
    const late = await stack.jobStore.compareAndSetTransition({
      jobId,
      ownerId: "owner-lease",
      expectedStoreVersion: expiredQueued.value.record.storeVersion,
      next: {
        job: expiredQueued.value.record.canonicalJob,
        request: expiredQueued.value.record.canonicalRequest,
        idempotencyAuthorityKey:
          expiredQueued.value.record.idempotencyAuthorityKey,
        operationId: expiredQueued.value.record.operationId,
        claimToken: "claim_live",
        claimedAtMs: clock,
        artifactObjectBinding: null,
      },
    });
    assert.equal(late.ok && late.value.kind === "terminal_locked", true);

    // In-flight claim expiry also fails closed.
    const created2 = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify({
        version: 1,
        projectId: fixture.manifestV3.project.projectId,
        manifestObject: seeded.value.manifestLocator,
        manifestPayloadDigest: seeded.value.manifestPayloadDigest,
        assetBundleObject: seeded.value.bundleLocator,
        assetBundleFingerprint: seeded.value.bundle.fingerprint,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: fixture.manifestV3.output.quality,
        },
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        idempotencyKey: "lease-2",
      }),
      body: {
        version: 1,
        projectId: fixture.manifestV3.project.projectId,
        manifestObject: seeded.value.manifestLocator,
        manifestPayloadDigest: seeded.value.manifestPayloadDigest,
        assetBundleObject: seeded.value.bundleLocator,
        assetBundleFingerprint: seeded.value.bundle.fingerprint,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: fixture.manifestV3.output.quality,
        },
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        idempotencyKey: "lease-2",
      },
    });
    assert.equal(created2.ok, true);
    if (!created2.ok) return;
    const jobId2 = created2.value.jobId;
    const rec2 = await stack.jobStore.getByJobIdAndOwner(jobId2, "owner-lease");
    assert.equal(rec2.ok, true);
    if (!rec2.ok) return;
    const claimed2 = await stack.jobStore.claimQueuedJob({
      jobId: jobId2,
      ownerId: "owner-lease",
      expectedStoreVersion: rec2.value.storeVersion,
      claimToken: "claim_inflight",
      nowMs: clock,
    });
    assert.equal(claimed2.ok && claimed2.value.kind === "claimed", true);
    if (!claimed2.ok || claimed2.value.kind !== "claimed") return;

    const tRender = Math.max(clock + 1, claimed2.value.record.canonicalJob!.updatedAtMs + 1);
    const stepped = applyHeadlessJobTransition({
      jobValue: claimed2.value.record.canonicalJob,
      requestValue: claimed2.value.record.canonicalRequest,
      toState: "rendering",
      attempt: claimed2.value.record.canonicalJob!.attempt,
      updatedAtMs: tRender,
      progress: { percent: 10, stage: "rendering", updatedAtMs: tRender },
    });
    assert.equal(stepped.ok, true, stepped.ok ? "" : JSON.stringify(stepped));
    if (!stepped.ok) return;
    await stack.jobStore.compareAndSetTransition({
      jobId: jobId2,
      ownerId: "owner-lease",
      expectedStoreVersion: claimed2.value.record.storeVersion,
      next: {
        job: stepped.job,
        request: claimed2.value.record.canonicalRequest,
        idempotencyAuthorityKey: claimed2.value.record.idempotencyAuthorityKey,
        operationId: claimed2.value.record.operationId,
        claimToken: "claim_inflight",
        claimedAtMs: claimed2.value.record.claimedAtMs,
        artifactObjectBinding: null,
        },
    });

    clock = Math.max(clock, tRender) + DEFAULT_HEADLESS_WORKER_LIMITS.claimLeaseMs + 1;
    const failedExpired = await stack.jobStore.recoverExpiredClaim({
      jobId: jobId2,
      ownerId: "owner-lease",
      nowMs: clock,
      leaseMs: DEFAULT_HEADLESS_WORKER_LIMITS.claimLeaseMs,
    });
    assert.equal(
      failedExpired.ok && failedExpired.value.kind === "failed_expired",
      true,
    );
    void store;
  });

  await testAsync("ffmpeg -fs hard-cap keeps output within authorized bytes", async () => {
    const bins = resolveNativeFfmpegBinaries();
    assert.equal(bins.ok, true);
    if (!bins.ok) return;
    const encodeSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/ffmpeg/encode-png-sequence.ts",
      ),
      "utf8",
    );
    assert.equal(encodeSrc.includes('"-fs"'), true);
    assert.equal(encodeSrc.includes("maxOutputBytes"), true);
    assert.equal(encodeSrc.includes("isOutputAtOrOverCeiling"), true);

    const { encodePngSequenceToWebm } = await import(
      "@/features/headless-renderer/worker/ffmpeg/encode-png-sequence-webm"
    );
    const {
      mkdtempSync,
      mkdirSync: mkdir,
      existsSync,
      statSync,
      rmSync,
    } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const dir = mkdtempSync(pathJoin(tmpdir(), "hf-fs-"));
    const framesDir = pathJoin(dir, "frames");
    mkdir(framesDir, { recursive: true });
    for (let i = 0; i < 8; i++) {
      const out = pathJoin(framesDir, `frame_${String(i).padStart(6, "0")}.png`);
      const r: { status: number | null } = spawnSync(
        bins.ffmpegExecutable,
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=0x2244aa:s=720x1280:d=0.04",
          "-frames:v",
          "1",
          out,
        ],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 0);
    }
    const outputPath = pathJoin(dir, "out.webm");
    const ceiling = 2_048;
    const { buildHeadlessAudioPlan } = await import(
      "@/features/headless-renderer/worker/audio/build-headless-audio-plan"
    );
    const silentPlan = buildHeadlessAudioPlan(
      buildHeadlessReferenceFixture({ audioMode: "silent", durationMs: 1000 })
        .manifestV3,
    );
    assert.equal(silentPlan.ok, true);
    if (!silentPlan.ok) return;
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 8,
      fps: 30,
      outputPath,
      audioPlan: {
        ...silentPlan.plan,
        combination: "silent",
        mixPolicy: "none",
        outputDurationMs: Math.round((8 / 30) * 1000),
        outputDurationSec: 8 / 30,
        voiceover: null,
        music: null,
      },
      timeoutMs: 60_000,
      maxStderrBytes: 16_384,
      maxOutputBytes: ceiling,
    });
    // Encode may fail closed or stop early; either way disk must stay ≤ ceiling.
    if (existsSync(outputPath)) {
      assert.ok(statSync(outputPath).size <= ceiling);
    }
    if (encoded.ok) {
      // A "success" under a tiny ceiling is only acceptable if bytes stayed capped.
      assert.ok(existsSync(outputPath));
      assert.ok(statSync(outputPath).size <= ceiling);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("spawn: no shell; timeout/cancel; grandchild tree cleaned", async () => {
    const ffmpeg = resolveNativeFfmpegBinaries();
    assert.equal(ffmpeg.ok, true);
    if (!ffmpeg.ok) return;
    const ok = await spawnFixedArgv({
      executable: ffmpeg.ffmpegExecutable,
      args: ["-version"],
      timeoutMs: 5_000,
      maxStderrBytes: 4096,
    });
    assert.equal(ok.exitClass, "success");

    const ac = new AbortController();
    ac.abort();
    const cancelled = await spawnFixedArgv({
      executable: ffmpeg.ffmpegExecutable,
      args: ["-version"],
      timeoutMs: 5_000,
      maxStderrBytes: 4096,
      signal: ac.signal,
    });
    assert.equal(cancelled.exitClass, "cancelled");

    const invalid = await spawnFixedArgv({
      executable: ffmpeg.ffmpegExecutable,
      args: ["-version"],
      timeoutMs: 0,
      maxStderrBytes: 4096,
    });
    assert.equal(invalid.exitClass, "spawn_error");

    const redacted = redactSpawnDiagnostics(
      "err https://evil.example/x /Users/me/secret/path.wav",
    );
    assert.equal(redacted.includes("https://"), false);
    assert.equal(redacted.includes("/Users/me"), false);

    // Child spawns grandchild in same process group; timeout must reap both.
    const script = `
      const { spawn } = require('node:child_process');
      const g = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000)'], { stdio: 'ignore' });
      process.stdout.write(String(g.pid));
      setTimeout(() => {}, 120000);
    `;
    const tree = await spawnFixedArgv({
      executable: process.execPath,
      args: ["-e", script],
      timeoutMs: 400,
      maxStderrBytes: 4096,
      processGraceMs: 200,
    });
    assert.equal(tree.exitClass, "timeout");
    const grandchildPid = Number(tree.stdout.trim());
    if (Number.isFinite(grandchildPid) && grandchildPid > 0) {
      // Give escalate window
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(alive(grandchildPid), false);
    }
    if (tree.pid != null) {
      assert.equal(alive(tree.pid), false);
    }
    void terminateProcessTree;
  });

  test("exact FPS authority: only canonical 30 (parsing epsilon) passes", () => {
    assert.equal(isCanonicalHeadlessFps30(30), true);
    assert.equal(isCanonicalHeadlessFps30(30.0), true);
    assert.equal(isCanonicalHeadlessFps30(parseFfprobeFrameRate("30/1")), true);
    assert.equal(isCanonicalHeadlessFps30(parseFfprobeFrameRate("30000/1000")), true);
    assert.equal(isCanonicalHeadlessFps30(29.97), false);
    assert.equal(isCanonicalHeadlessFps30(29.6), false);
    assert.equal(isCanonicalHeadlessFps30(30.4), false);
    assert.equal(isCanonicalHeadlessFps30(null), false);
    assert.equal(isCanonicalHeadlessFps30(Number.NaN), false);
    assert.equal(parseFfprobeFrameRate("bogus"), null);
    assert.equal(parseFfprobeFrameRate("0/0"), null);
    assert.equal(isCanonicalHeadlessFps30(parseFfprobeFrameRate("30000/1001")), false);

    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    const hab = buildHeadlessAuthorityFingerprint("hab", { kind: "fps-matrix" });
    const hrj = buildHeadlessAuthorityFingerprint("hrj", { kind: "fps-matrix" });
    assert.equal(hab.ok && hrj.ok, true);
    if (!hab.ok || !hrj.ok) return;
    for (const bad of [29.97, 29.6, 30.4, null as never]) {
      const built = buildValidatedHeadlessArtifact({
        contentDigest: digestOfBytes(new Uint8Array(64).fill(1)),
      byteLength: new Uint8Array(64).fill(1).byteLength,
        probe: {
          width: 720,
          height: 1280,
          fps: bad,
          durationMs: fixture.manifestV3.project.renderDurationMs,
          hasVideo: true,
          hasAudio: false,
          videoCodec: "vp9",
          audioCodec: null,
          audioChannels: null,
          audioSampleRateHz: null,
          formatName: "webm",
        pixelFormat: "yuv420p",
        },
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: {
            resolution: "720p",
            format: "webm",
            fps: 30,
            quality: "high",
          },
          manifestFingerprint: fixture.manifestV3.fingerprint,
          assetBundle: { fingerprint: hab.fingerprint },
          manifest: fixture.manifestV3,
        } as never,
        job: {
          jobId: "job_fps",
          renderJobFingerprint: hrj.fingerprint,
        } as never,
        nowMs: 1,
        evidenceBase: {
          chromeVersion: "x",
          ffmpegVersion: "y",
          ffprobeVersion: "z",
          elapsedRenderMs: 1,
          frameCount: 1,
          nodeCoordinatorPeakRssBytes: null,
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          audioChannels: null,
          audioSampleRateHz: null,
        } as never,
      });
      assert.equal(built.ok, false);
    }
    const ok = buildValidatedHeadlessArtifact({
      contentDigest: digestOfBytes(new Uint8Array(64).fill(1)),
      byteLength: new Uint8Array(64).fill(1).byteLength,
      probe: {
        width: 720,
        height: 1280,
        fps: 30,
        durationMs: fixture.manifestV3.project.renderDurationMs,
        hasVideo: true,
        hasAudio: false,
        videoCodec: "vp9",
        audioCodec: null,
        audioChannels: null,
        audioSampleRateHz: null,
        formatName: "webm",
        pixelFormat: "yuv420p",
      },
      request: {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "high",
        },
        manifestFingerprint: fixture.manifestV3.fingerprint,
        assetBundle: { fingerprint: hab.fingerprint },
        manifest: fixture.manifestV3,
      } as never,
      job: {
        jobId: "job_fps_ok",
        renderJobFingerprint: hrj.fingerprint,
      } as never,
      nowMs: 1,
      evidenceBase: {
        chromeVersion: "x",
        ffmpegVersion: "y",
        ffprobeVersion: "z",
        elapsedRenderMs: 1,
        frameCount: 1,
        nodeCoordinatorPeakRssBytes: null,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        audioChannels: null,
        audioSampleRateHz: null,
      } as never,
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.artifact.fps, 30);
    assert.equal(ok.evidence.fps, ok.artifact.fps);
  });

  test("FFmpeg exact-cap output is quota exhaustion not probe mismatch", () => {
    assert.equal(isOutputAtOrOverCeiling(1000, 1000), true);
    assert.equal(isOutputAtOrOverCeiling(1001, 1000), true);
    assert.equal(isOutputAtOrOverCeiling(999, 1000), false);
    const executeSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/execute-render-job.ts",
      ),
      "utf8",
    );
    assert.equal(executeSrc.includes("isOutputAtOrOverCeiling"), true);
    assert.equal(executeSrc.includes("WORKSPACE_QUOTA_EXCEEDED"), true);
    // Cap check appears before probe call.
    assert.ok(
      executeSrc.indexOf("isOutputAtOrOverCeiling") <
        executeSrc.indexOf("probeArtifactWithFfprobe"),
    );
  });

  test("source-boundary: worker writes are reservation-gated; no unmetered HTML writer", () => {
    const bundleSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/chromium/bundle-page.ts",
      ),
      "utf8",
    );
    assert.equal(bundleSrc.includes("writeHeadlessRendererHtml"), false);
    assert.equal(bundleSrc.includes("write: false"), true);

    const renderSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/chromium/render-session.ts",
      ),
      "utf8",
    );
    assert.equal(renderSrc.includes("budget.reserve"), true);
    assert.equal(renderSrc.includes("materializeHeadlessPageWorkspace"), true);
    assert.equal(renderSrc.includes("buildHeadlessRendererHtml"), false);

    const pageWorkspaceSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/chromium/materialize-headless-page-workspace.ts",
      ),
      "utf8",
    );
    assert.equal(pageWorkspaceSrc.includes("budget.reserve"), true);
    assert.equal(pageWorkspaceSrc.includes("buildHeadlessRendererHtml"), true);

    const executeSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/execute-render-job.ts",
      ),
      "utf8",
    );
    assert.equal(executeSrc.includes('reserve(manifestBytes, "manifest")'), true);
    // Phase 3.2A: authorize artifact ceiling before FFmpeg write; commit actual after.
    assert.equal(executeSrc.includes('reserve(maxOutputBytes, "artifact")'), true);
    assert.equal(executeSrc.includes("startStreamedPngEncode"), true);
    assert.equal(executeSrc.includes("encodePngSequence"), false);

    const materializeSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/assets/materialize-owned-assets.ts",
      ),
      "utf8",
    );
    assert.equal(materializeSrc.includes("budget.reserve"), true);
  });

  await testAsync("recovery continuation: crash points + Promise.all concurrency", async () => {
    const { composeTestHeadlessControlPlane, seedOwnedManifestAndBundle } =
      await import("@/features/headless-renderer/control-plane/testing");
    const { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } = await import(
      "@/features/headless-renderer/control-plane/types/control-plane.types"
    );
    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    let clock = 1_700_000_000_000;
    const ownerId = "owner-cont";
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId,
        sessionId: "sess-cont",
      },
    authorizedProjectIds: [fixture.manifestV3.project.projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId,
      projectId: fixture.manifestV3.project.projectId,
      manifest: fixture.manifestV3,
      nowMs: clock,
      leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
      assetByteFactory: (slot) => {
        for (const [url, bytes] of fixture.assetBytesByUrl) {
          if (headlessSourceDigest(url) === slot.sourceDigest) return bytes;
        }
        throw new Error("missing");
      },
      mimeForSlot: () => "image/png",
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;

    const makeParentFailed = async (idempotencyKey: string) => {
      const created = await stack.service.createJob({
        requestContext: {},
        rawBodyText: JSON.stringify({
          version: 1,
          projectId: fixture.manifestV3.project.projectId,
          manifestObject: seeded.value.manifestLocator,
          manifestPayloadDigest: seeded.value.manifestPayloadDigest,
          assetBundleObject: seeded.value.bundleLocator,
          assetBundleFingerprint: seeded.value.bundle.fingerprint,
          rendererProfile: {
            resolution: "720p",
            format: "webm",
            fps: 30,
            quality: fixture.manifestV3.output.quality,
          },
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          idempotencyKey,
        }),
        body: {
          version: 1,
          projectId: fixture.manifestV3.project.projectId,
          manifestObject: seeded.value.manifestLocator,
          manifestPayloadDigest: seeded.value.manifestPayloadDigest,
          assetBundleObject: seeded.value.bundleLocator,
          assetBundleFingerprint: seeded.value.bundle.fingerprint,
          rendererProfile: {
            resolution: "720p",
            format: "webm",
            fps: 30,
            quality: fixture.manifestV3.output.quality,
          },
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          idempotencyKey,
        },
      });
      assert.equal(created.ok, true);
      if (!created.ok) throw new Error("create failed");
      const parentId = created.value.jobId;
      const rec = await stack.jobStore.getByJobIdAndOwner(parentId, ownerId);
      assert.equal(rec.ok, true);
      if (!rec.ok) throw new Error("missing parent");
      const claimed = await stack.jobStore.claimQueuedJob({
        jobId: parentId,
        ownerId,
        expectedStoreVersion: rec.value.storeVersion,
        claimToken: `claim_${idempotencyKey}`,
        nowMs: clock,
      });
      assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
      if (!claimed.ok || claimed.value.kind !== "claimed") {
        throw new Error("claim failed");
      }
      clock += DEFAULT_HEADLESS_WORKER_LIMITS.claimLeaseMs + 1;
      const expired = await stack.jobStore.recoverExpiredClaim({
        jobId: parentId,
        ownerId,
        nowMs: clock,
        leaseMs: DEFAULT_HEADLESS_WORKER_LIMITS.claimLeaseMs,
      });
      assert.equal(
        expired.ok && expired.value.kind === "failed_expired",
        true,
      );
      if (!expired.ok || expired.value.kind !== "failed_expired") {
        throw new Error("expire failed");
      }
      return {
        parentId,
        parentIdempotency: expired.value.record.idempotencyAuthorityKey,
        parentAttempt: expired.value.record.canonicalJob!.attempt,
        request: expired.value.record.canonicalRequest,
      };
    };

    const strandChild = async (
      parent: Awaited<ReturnType<typeof makeParentFailed>>,
      state: "created" | "materializing" | "queued",
    ) => {
      const recoveryIdempotency = buildHeadlessAuthorityFingerprint("hid", {
        version: 1,
        kind: "control-plane-claim-lease-recovery",
        parentJobId: parent.parentId,
        parentIdempotencyAuthorityKey: parent.parentIdempotency,
        recoveryAttempt: parent.parentAttempt + 1,
      });
      assert.equal(recoveryIdempotency.ok, true);
      if (!recoveryIdempotency.ok) throw new Error("hid");
      const accepted = createAcceptedHeadlessRenderJob({
        jobId: `job_strand_${state}_${Date.now()}_${Math.random()}`,
        requestValue: parent.request,
        createdAtMs: clock,
      });
      assert.equal(accepted.ok, true);
      if (!accepted.ok) throw new Error("accept");
      let job = accepted.job;
      if (state === "materializing" || state === "queued") {
        const m = applyHeadlessJobTransition({
          jobValue: job,
          requestValue: accepted.request,
          toState: "materializing",
          attempt: job.attempt,
          updatedAtMs: clock + 1,
          progress: {
            percent: 5,
            stage: "materializing",
            updatedAtMs: clock + 1,
          },
        });
        assert.equal(m.ok, true);
        if (!m.ok) throw new Error("mat");
        job = m.job;
      }
      if (state === "queued") {
        const q = applyHeadlessJobTransition({
          jobValue: job,
          requestValue: accepted.request,
          toState: "queued",
          attempt: job.attempt,
          updatedAtMs: clock + 2,
          progress: {
            percent: 10,
            stage: "queued",
            updatedAtMs: clock + 2,
          },
        });
        assert.equal(q.ok, true);
        if (!q.ok) throw new Error("queued");
        job = q.job;
      }
      const stored = await stack.jobStore.createIfAbsent({
        idempotencyAuthorityKey: recoveryIdempotency.fingerprint,
        record: {
          job,
          request: accepted.request,
          idempotencyAuthorityKey: recoveryIdempotency.fingerprint,
          operationId: `fixture_recover_${parent.parentId}_${parent.parentAttempt + 1}`,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      assert.equal(stored.ok && stored.value.kind === "created", true);
      if (!stored.ok || stored.value.kind !== "created") {
        throw new Error("strand create");
      }
      assert.equal(stored.value.record.canonicalJob!.state, state);
      return stored.value.record.canonicalJob!.jobId;
    };

    for (const crashState of ["created", "materializing", "queued"] as const) {
      const parent = await makeParentFailed(`cont-${crashState}`);
      const childId = await strandChild(parent, crashState);
      // Concurrent recoverDispatch from parent — must resume same child.
      const [a, b] = await Promise.all([
        stack.service.recoverDispatch({
          requestContext: {},
          jobId: parent.parentId,
        }),
        stack.service.recoverDispatch({
          requestContext: {},
          jobId: parent.parentId,
        }),
      ]);
      assert.equal(a.ok && b.ok, true);
      if (!a.ok || !b.ok) return;
      assert.equal(a.value.jobId, childId);
      assert.equal(b.value.jobId, childId);
      const child = await stack.jobStore.getByJobIdAndOwner(childId, ownerId);
      assert.equal(child.ok, true);
      if (!child.ok) return;
      assert.equal(child.value.canonicalJob!.state, "queued");
      assert.equal(child.value.claimToken, null);
      // Repeat recoverDispatch is idempotent.
      const again = await stack.service.recoverDispatch({
        requestContext: {},
        jobId: parent.parentId,
      });
      assert.equal(again.ok, true);
      if (!again.ok) return;
      assert.equal(again.value.jobId, childId);
      assert.equal(again.value.state, "queued");
    }
  });

  test("workspace cleanup removes root; traversal rejected; no SIG handlers", () => {
    const ws = createHeadlessWorkerWorkspace({ jobId: "job_ws", attempt: 1 });
    ws.writeFileSafe("assets/a.bin", new Uint8Array([1, 2, 3]));
    assert.throws(() => ws.resolveSafePath("../escape.txt"));
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/assets/workspace.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes('process.once("SIGINT"'), false);
    assert.equal(src.includes('process.once("SIGTERM"'), false);
    ws.cleanup();
  });

  test("production barrel does not export worker runtime", () => {
    const root = readFileSync(
      path.join(process.cwd(), "src/features/headless-renderer/index.ts"),
      "utf8",
    );
    assert.equal(root.includes("worker/"), false);
    const routes = [
      "src/app/api/headless-render/jobs/route.ts",
      "src/app/api/headless-render/jobs/[jobId]/route.ts",
      "src/app/api/headless-render/jobs/[jobId]/cancel/route.ts",
    ];
    for (const r of routes) {
      const text = readFileSync(path.join(process.cwd(), r), "utf8");
      assert.equal(text.includes("headless-renderer/worker"), false);
    }
  });

  void createServer;
  void mkdirSync;
  void spawnSync;

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
