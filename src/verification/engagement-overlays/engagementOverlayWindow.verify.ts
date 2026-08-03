/**
 * Engagement-overlay window/frame planner + manifest dispatch verification.
 * Run via: npm run test:engagement-overlays
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ENGAGEMENT_OVERLAY_DEFAULT_POSITION,
  ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
  ENGAGEMENT_OVERLAY_PRESET_ID,
  normalizeSceneEngagementOverlay,
  normalizeVisualRetentionProjectExtensions,
  projectEngagementOverlayToManifest,
  resolveEngagementOverlayFrame,
  resolveEngagementOverlayWindow,
  shouldSuppressEngagementOverlayForInterSceneTransition,
} from "@/features/engagement-overlays";
import {
  buildExportManifest,
  EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES,
  isExportManifestV5,
  runExportCapabilityPreflight,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV5,
} from "@/features/export/domain";
import { buildExportManifestFingerprint } from "@/features/export/domain/export-manifest-fingerprint";
import { HEADLESS_WORKER_PHASE3_SUPPORTED } from "@/features/headless-renderer/worker/runtime/worker-types";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";
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
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function asV5(manifest: ReturnType<typeof buildExportManifest>): ExportManifestV5 {
  assert.equal(isExportManifestV5(manifest), true);
  return manifest as ExportManifestV5;
}

function overlay(partial: Partial<SceneEngagementOverlayV1> = {}): SceneEngagementOverlayV1 {
  return {
    version: 1,
    id: "engagement-scene-a",
    kind: "like",
    startOffsetMs: 1000,
    durationMs: 2500,
    position: "top-right",
    presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
    ...partial,
  };
}

function media(): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/engagement.jpg",
    source: "upload",
  };
}

function story(options: {
  durationMs?: number;
  overlay?: SceneEngagementOverlayV1 | null;
  orphanOverlay?: boolean;
} = {}): FootieScript {
  const durationMs = options.durationMs ?? 5000;
  const scene: FootieScene = {
    id: "scene-a",
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Hello",
    narration: "Hello",
    media: media(),
  };
  const base = syncFootieScript({
    title: "Engagement",
    narration: "Hello",
    totalDuration: durationMs / 1000,
    scenes: [scene],
  });
  if (options.overlay === null) return base;
  const configured = options.overlay ?? overlay();
  return {
    ...base,
    visualRetentionExtensions: {
      version: 1,
      engagementOverlaysBySceneId: {
        [options.orphanOverlay ? "missing-scene" : "scene-a"]: [configured],
      },
    },
  };
}

function main(): void {
  console.log("\nengagement-overlay-window\n");

  test("absent and malformed overlays fail closed", () => {
    assert.equal(normalizeSceneEngagementOverlay(undefined), undefined);
    assert.equal(normalizeSceneEngagementOverlay({ version: 2 }), undefined);
    assert.equal(
      normalizeSceneEngagementOverlay({
        version: 1,
        id: "x",
        kind: "custom",
        startOffsetMs: 0,
        durationMs: 2500,
        position: "top-right",
        presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
      }),
      undefined,
    );
    assert.equal(
      normalizeVisualRetentionProjectExtensions({ version: 9 }),
      undefined,
    );
    const window = resolveEngagementOverlayWindow({
      overlay: { version: 1, id: "", kind: "like" },
      sceneDurationMs: 4000,
    });
    assert.equal(window.available, false);
    assert.equal(window.omitReason, "malformed");
  });

  test("each kind and corner position resolves labels/icons and layout", () => {
    for (const kind of ["like", "share", "subscribe", "combined"] as const) {
      for (const position of [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ] as const) {
        const frame = resolveEngagementOverlayFrame({
          overlay: overlay({ kind, position, startOffsetMs: 0, durationMs: 2500 }),
          sceneDurationMs: 5000,
          sceneElapsedMs: 1200,
          frameWidth: 1080,
          frameHeight: 1920,
        });
        assert.equal(frame.visible, true);
        assert.equal(frame.kind, kind);
        assert.equal(frame.position, position);
        assert.ok(frame.labels.length >= 1);
        assert.ok(frame.iconTokens.length >= 1);
        assert.ok(frame.layout.width > 0);
        assert.ok(frame.layout.height > 0);
      }
    }
    assert.equal(ENGAGEMENT_OVERLAY_DEFAULT_POSITION, "top-right");
  });

  test("timing clamp and unusable short scene omit without mutating authoring", () => {
    const authored = overlay({ startOffsetMs: 4000, durationMs: 3000 });
    const clamped = resolveEngagementOverlayWindow({
      overlay: authored,
      sceneDurationMs: 5000,
    });
    assert.equal(clamped.available, true);
    assert.ok(clamped.startOffsetMs + clamped.durationMs <= 5000 + 1e-6);
    assert.equal(authored.startOffsetMs, 4000);

    const short = resolveEngagementOverlayWindow({
      overlay: overlay({ startOffsetMs: 0, durationMs: 2500 }),
      sceneDurationMs: ENGAGEMENT_OVERLAY_MIN_DURATION_MS - 1,
    });
    assert.equal(short.available, false);
    assert.equal(short.omitReason, "scene_too_short");
    assert.ok(short.warnings.length > 0);

    const projected = projectEngagementOverlayToManifest(
      overlay({ startOffsetMs: 0, durationMs: 2500 }),
      100,
      true,
    );
    assert.equal(projected.overlay, undefined);
    assert.ok(projected.warnings.length > 0);
  });

  test("entrance/hold/exit samples are deterministic under seek", () => {
    const input = {
      overlay: overlay({ startOffsetMs: 0, durationMs: 2500 }),
      sceneDurationMs: 5000,
      frameWidth: 1080,
      frameHeight: 1920,
    };
    const entrance = resolveEngagementOverlayFrame({ ...input, sceneElapsedMs: 80 });
    const hold = resolveEngagementOverlayFrame({ ...input, sceneElapsedMs: 1200 });
    const exit = resolveEngagementOverlayFrame({ ...input, sceneElapsedMs: 2400 });
    const hidden = resolveEngagementOverlayFrame({ ...input, sceneElapsedMs: 2600 });

    assert.equal(entrance.phase, "entrance");
    assert.ok(entrance.opacity < 1);
    assert.equal(hold.phase, "hold");
    assert.equal(hold.opacity, 1);
    assert.equal(hold.scale, 1);
    assert.equal(exit.phase, "exit");
    assert.ok(exit.opacity < 1);
    assert.equal(hidden.visible, false);

    const seekA = resolveEngagementOverlayFrame({ ...input, sceneElapsedMs: 1200 });
    const seekB = resolveEngagementOverlayFrame({ ...input, sceneElapsedMs: 1200 });
    assert.deepEqual(seekA, seekB);
  });

  test("safe-area layout scales across 720p/1080p/4K", () => {
    for (const [w, h] of [
      [720, 1280],
      [1080, 1920],
      [2160, 3840],
    ] as const) {
      const frame = resolveEngagementOverlayFrame({
        overlay: overlay({ startOffsetMs: 0 }),
        sceneDurationMs: 5000,
        sceneElapsedMs: 1000,
        frameWidth: w,
        frameHeight: h,
      });
      assert.ok(frame.layout.x >= 0);
      assert.ok(frame.layout.y >= 0);
      assert.ok(frame.layout.x + frame.layout.width <= w + 1e-6);
      assert.ok(frame.layout.y + frame.layout.height <= h + 1e-6);
    }
  });

  test("capability off ignores dormant overlays and keeps v4 fingerprint/warnings stable", () => {
    const plain = buildExportManifest({
      story: story({ overlay: null }),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: false,
    });
    const dormant = buildExportManifest({
      story: story(),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: false,
    });
    assert.equal(dormant.version, 4);
    assert.equal(plain.version, 4);
    assert.equal(dormant.fingerprint, plain.fingerprint);
    assert.ok(!("requiredCapabilities" in dormant));
    assert.equal(
      "engagementOverlays" in dormant.scenes[0]!
        ? dormant.scenes[0]!.engagementOverlays
        : undefined,
      undefined,
    );
    assert.equal(validateExportManifest(dormant).ok, true);
  });

  test("Browser advertises an independent static capability set (never mirrors required)", () => {
    const builder = readSrc(
      "src/features/export/domain/build-export-manifest.ts",
    );
    assert.match(builder, /EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES/);
    assert.doesNotMatch(
      builder,
      /supportedCapabilities:\s*\[\.\.\.requiredCapabilities\]/,
    );
    assert.doesNotMatch(
      builder,
      /supportedCapabilities:\s*\[\s*\.\.\.required/,
    );

    const overlayOnly = buildExportManifest({
      story: story(),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: true,
    });
    assert.deepEqual(asV5(overlayOnly).requiredCapabilities, [
      "engagement-overlays-v1",
    ]);
    assert.deepEqual(
      [...(overlayOnly.capabilities.supportedCapabilities ?? [])].sort(),
      [...EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES].sort(),
    );
    // Advertisement includes keyframed even when not required — independence proof.
    assert.ok(
      overlayOnly.capabilities.supportedCapabilities?.includes(
        "keyframed-visual-effects-v1",
      ),
    );
  });

  test("negative negotiation: missing engagement advertisement is terminal before dispatch", () => {
    const valid = buildExportManifest({
      story: story(),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: true,
    });
    const unsupported = JSON.parse(JSON.stringify(valid));
    unsupported.capabilities.supportedCapabilities = ["keyframed-visual-effects-v1"];
    unsupported.fingerprint = buildExportManifestFingerprint(unsupported);
    assert.equal(
      buildExportManifestFingerprint(unsupported),
      valid.fingerprint,
      "supportedCapabilities must not affect fingerprint",
    );
    const preflight = runExportCapabilityPreflight(unsupported);
    assert.ok(
      preflight.blockers.some(
        (blocker) =>
          blocker.code === "UNSUPPORTED_RENDERER_CAPABILITY" &&
          blocker.capability === "engagement-overlays-v1",
      ),
    );
    assert.equal(preflight.renderer, "blocked");
  });

  test("positive negotiation: Browser that advertises engagement remains selectable", () => {
    const result = buildExportManifest({
      story: story(),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: true,
    });
    assert.ok(
      result.capabilities.supportedCapabilities?.includes(
        "engagement-overlays-v1",
      ),
    );
    const preflight = runExportCapabilityPreflight(result);
    assert.equal(preflight.renderer, "browser");
    assert.equal(
      preflight.blockers.some(
        (blocker) => blocker.code === "UNSUPPORTED_RENDERER_CAPABILITY",
      ),
      false,
    );
  });

  test("Browser stays selectable when Headless advertisement lacks overlays", () => {
    const browserManifest = buildExportManifest({
      story: story(),
      environment: { ...CAPABLE_ENV, serverRendererAvailable: true },
      audioMode: "silent",
      engagementOverlaysEnabled: true,
    });
    // Fabricate a Headless-like advertisement without overlays; Browser path
    // still uses its own supported set and remains selectable.
    const headlessLacks = JSON.parse(JSON.stringify(browserManifest));
    headlessLacks.capabilities.supportedCapabilities = [
      "keyframed-visual-effects-v1",
    ];
    assert.equal(
      buildExportManifestFingerprint(browserManifest),
      buildExportManifestFingerprint(headlessLacks),
    );
    // Restore Browser advertisement for dispatch selection.
    const browserPreflight = runExportCapabilityPreflight(browserManifest);
    assert.equal(browserPreflight.renderer, "browser");
  });

  test("Headless owns an independent capability registry including overlays", () => {
    const supported = HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities;
    assert.ok(supported.includes("keyframed-visual-effects-v1"));
    assert.ok(supported.includes("engagement-overlays-v1"));
    const pageEntry = readSrc(
      "src/features/headless-renderer/worker/chromium/page-entry.ts",
    );
    const workerPreflight = readSrc(
      "src/features/headless-renderer/worker/runtime/capability-preflight.ts",
    );
    assert.match(pageEntry, /HEADLESS_WORKER_PHASE3_SUPPORTED/);
    assert.match(pageEntry, /requiredCapabilities/);
    assert.match(workerPreflight, /HEADLESS_WORKER_PHASE3_SUPPORTED\.rendererCapabilities/);
  });

  test("exact manifest requirement matrix for overlay/keyframe combinations", () => {
    const overlayOnly = buildExportManifest({
      story: story(),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: true,
    });
    assert.equal(overlayOnly.version, 5);
    assert.deepEqual(asV5(overlayOnly).requiredCapabilities, [
      "engagement-overlays-v1",
    ]);
    assert.equal(
      asV5(overlayOnly).requiredCapabilities.includes(
        "keyframed-visual-effects-v1",
      ),
      false,
    );

    const keyedStory = story({ overlay: null });
    keyedStory.scenes[0]!.media = {
      type: "image",
      url: "https://example.com/engagement.jpg",
      source: "upload",
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        easing: "linear",
        intensity: 1,
        startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
        endTransform: { x: 0, y: 0, scale: 1.1, rotation: 0 },
        keyframes: [
          {
            offsetMs: 0,
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: 1,
            easing: "linear",
          },
          {
            offsetMs: 4000,
            x: 10,
            y: 0,
            scale: 1.1,
            rotation: 0,
            opacity: 1,
            easing: "linear",
          },
        ],
      },
    };
    const keyframeOnly = buildExportManifest({
      story: keyedStory,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
      engagementOverlaysEnabled: true,
    });
    assert.deepEqual(asV5(keyframeOnly).requiredCapabilities, [
      "keyframed-visual-effects-v1",
    ]);

    const combinedStory = story();
    combinedStory.scenes[0]!.media = keyedStory.scenes[0]!.media;
    const combined = buildExportManifest({
      story: combinedStory,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
      engagementOverlaysEnabled: true,
    });
    assert.deepEqual(asV5(combined).requiredCapabilities, [
      "keyframed-visual-effects-v1",
      "engagement-overlays-v1",
    ]);
  });

  test("strict validation rejects overlay/capability mismatches and unknown fields", () => {
    const valid = buildExportManifest({
      story: story(),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: true,
    });
    const withoutCap = JSON.parse(JSON.stringify(valid));
    withoutCap.requiredCapabilities = ["keyframed-visual-effects-v1"];
    withoutCap.scenes[0].mediaTimeline.items[0].media.motion = {
      enabled: true,
      presetId: "slow-zoom-in",
      easing: "linear",
      intensity: 1,
      keyframes: [
        {
          offsetMs: 0,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          easing: "linear",
        },
        {
          offsetMs: 1000,
          x: 1,
          y: 0,
          scale: 1.01,
          rotation: 0,
          opacity: 1,
          easing: "linear",
        },
      ],
      keyframeSchemaVersion: 1,
    };
    withoutCap.fingerprint = buildExportManifestFingerprint(withoutCap);
    assert.equal(validateExportManifest(withoutCap).ok, false);

    const noOverlay = JSON.parse(JSON.stringify(valid));
    delete noOverlay.scenes[0].engagementOverlays;
    noOverlay.fingerprint = buildExportManifestFingerprint(noOverlay);
    assert.equal(validateExportManifest(noOverlay).ok, false);

    const badKind = JSON.parse(JSON.stringify(valid));
    badKind.scenes[0].engagementOverlays[0].kind = "clap";
    badKind.fingerprint = buildExportManifestFingerprint(badKind);
    assert.equal(validateExportManifest(badKind).ok, false);

    const badTiming = JSON.parse(JSON.stringify(valid));
    badTiming.scenes[0].engagementOverlays[0].durationMs = Number.NaN;
    badTiming.fingerprint = buildExportManifestFingerprint(badTiming);
    assert.equal(validateExportManifest(badTiming).ok, false);
  });

  test("unusable short scene omits overlay and does not require engagement capability", () => {
    const short = buildExportManifest({
      story: story({
        durationMs: 100,
        overlay: overlay({ startOffsetMs: 0, durationMs: 2500 }),
      }),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: true,
    });
    assert.equal(short.version, 4);
    assert.ok(!("requiredCapabilities" in short));
    assert.equal(
      "engagementOverlays" in short.scenes[0]!
        ? short.scenes[0]!.engagementOverlays
        : undefined,
      undefined,
    );
  });

  test("inter-scene transition suppression is shared and absolute", () => {
    assert.equal(
      shouldSuppressEngagementOverlayForInterSceneTransition(true),
      true,
    );
    assert.equal(
      shouldSuppressEngagementOverlayForInterSceneTransition(false),
      false,
    );
    const draw = readSrc(
      "src/features/export/runtime/draw-prepared-export-frame.ts",
    );
    const preview = readSrc(
      "src/features/preview/components/VideoPreview.tsx",
    );
    assert.match(draw, /shouldSuppressEngagementOverlayForInterSceneTransition/);
    assert.match(preview, /shouldSuppressEngagementOverlayForInterSceneTransition/);
  });

  test("v4 stability without overlays; orphan/malformed extensions preserve brand sting", () => {
    const plain = buildExportManifest({
      story: story({ overlay: null }),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: true,
    });
    assert.equal(plain.version, 4);

    const withSting = {
      version: 1 as const,
      engagementOverlaysBySceneId: {
        "missing-scene": [overlay()],
        "scene-a": [{ version: 2, id: "bad" }],
      },
      shortForgeBrandSting: {
        version: 1 as const,
        enabled: false,
        title: "ShortForge Studio" as const,
        durationMs: 2000 as const,
        presetId: "sting-v1",
        narrationPolicy: "none" as const,
        captionPolicy: "none" as const,
        playbackSpeedPolicy: "fixed" as const,
      },
    };
    const normalized = normalizeVisualRetentionProjectExtensions(withSting, [
      "scene-a",
    ]);
    assert.equal(normalized?.engagementOverlaysBySceneId, undefined);
    assert.equal(normalized?.shortForgeBrandSting?.enabled, false);
    assert.equal(normalizeVisualRetentionProjectExtensions(undefined), undefined);
  });

  test("draw/preview consume shared planner and isolate canvas state", () => {
    const draw = readSrc(
      "src/features/export/runtime/draw-prepared-export-frame.ts",
    );
    const preview = readSrc(
      "src/features/preview/components/VideoPreview.tsx",
    );
    const drawModule = readSrc(
      "src/features/engagement-overlays/render/draw-engagement-overlay.ts",
    );
    assert.match(draw, /resolveEngagementOverlayFrame/);
    assert.match(draw, /drawEngagementOverlay/);
    assert.match(preview, /EngagementOverlayPreview/);
    assert.match(drawModule, /ctx\.save\(\)/);
    assert.match(drawModule, /ctx\.restore\(\)/);
    assert.match(drawModule, /shadowBlur/);
    assert.match(drawModule, /Arial, Helvetica, sans-serif/);
    assert.doesNotMatch(drawModule, /emoji|twemoji|youtube|instagram/i);
    assert.match(draw, /engagementOverlays/);
    const engagementAt = draw.indexOf("drawEngagementOverlay");
    const captionAt = draw.indexOf("drawExportSubtitlesCaption");
    assert.ok(engagementAt >= 0 && captionAt > engagementAt);
  });

  test("default top-right stays above the caption band at 720p/1080p/4K", () => {
    for (const [w, h] of [
      [720, 1280],
      [1080, 1920],
      [2160, 3840],
    ] as const) {
      const frame = resolveEngagementOverlayFrame({
        overlay: overlay({ position: "top-right", startOffsetMs: 0 }),
        sceneDurationMs: 5000,
        sceneElapsedMs: 1000,
        frameWidth: w,
        frameHeight: h,
      });
      const captionBandTop = h - 280 * (h / 1920);
      assert.ok(frame.layout.y + frame.layout.height < captionBandTop);
      assert.ok(frame.layout.x + frame.layout.width <= w + 1e-6);
    }
  });

  console.log(`\n${passed} passed\n`);
}

main();
