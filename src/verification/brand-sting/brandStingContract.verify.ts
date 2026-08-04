/**
 * Brand-sting contract, normalize, and ExportManifest capability matrix.
 * Run via: npm run test:brand-sting-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BRAND_STING_DEFAULT_DURATION_MS,
  BRAND_STING_LEAD_IN,
  BRAND_STING_LOCKED_TITLE,
  createDefaultShortForgeBrandSting,
  getShortForgeBrandSting,
  normalizeShortForgeBrandSting,
  projectBrandStingToManifest,
  resolveAuthoritativeBrandStingDurationMs,
} from "@/features/brand-sting";
import { normalizeVisualRetentionProjectExtensions } from "@/features/engagement-overlays";
import {
  buildExportManifest,
  EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES,
  buildExportManifestFingerprint,
  isExportManifestV5,
  runExportCapabilityPreflight,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV5,
} from "@/features/export/domain";
import { HEADLESS_WORKER_PHASE3_SUPPORTED } from "@/features/headless-renderer/worker/runtime/worker-types";
import type { MediaMotionKeyframe } from "@/features/media-motion";
import type { FootieScript, SceneMedia } from "@/features/story/types";
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

function story(stingEnabled = true, durationMs = 2500): FootieScript {
  const base = syncFootieScript({
    title: "Brand sting",
    narration: "Hello world",
    totalDuration: 4,
    scenes: [
      {
        id: "scene-a",
        start: 0,
        end: 4,
        duration: 4,
        startMs: 0,
        endMs: 4000,
        durationMs: 4000,
        subtitle: "Hello",
        narration: "Hello",
        media: {
          type: "image",
          url: "https://example.com/sting.jpg",
          source: "upload",
        },
      },
    ],
  });
  if (!stingEnabled) return base;
  return {
    ...base,
    visualRetentionExtensions: {
      version: 1,
      shortForgeBrandSting: createDefaultShortForgeBrandSting(
        durationMs as 2000 | 2500 | 3000,
      ),
    },
  };
}

console.log("\nbrand-sting-contract\n");

test("absent and malformed overlays/stings fail closed", () => {
  assert.equal(normalizeShortForgeBrandSting(undefined), undefined);
  assert.equal(normalizeShortForgeBrandSting({ version: 1 }), undefined);
  assert.equal(
    normalizeShortForgeBrandSting({
      version: 1,
      enabled: true,
      title: "Promo",
      durationMs: 2500,
      presetId: "x",
      narrationPolicy: "none",
      captionPolicy: "none",
      playbackSpeedPolicy: "fixed",
    }),
    undefined,
  );
  assert.equal(
    normalizeShortForgeBrandSting({
      version: 1,
      enabled: true,
      title: BRAND_STING_LOCKED_TITLE,
      durationMs: 1800,
      presetId: "x",
      narrationPolicy: "none",
      captionPolicy: "none",
      playbackSpeedPolicy: "fixed",
    }),
    undefined,
  );
});

test("exact locked title and closed durations including default 2.5s", () => {
  const created = createDefaultShortForgeBrandSting();
  assert.equal(created.title, "ShortForge Studio");
  assert.equal(created.durationMs, BRAND_STING_DEFAULT_DURATION_MS);
  assert.equal(created.durationMs, 2500);
  for (const durationMs of [2000, 2500, 3000] as const) {
    const sting = createDefaultShortForgeBrandSting(durationMs);
    assert.equal(sting.durationMs, durationMs);
    assert.equal(normalizeShortForgeBrandSting(sting)?.durationMs, durationMs);
  }
});

test("capability off ignores dormant sting and keeps v4", () => {
  const dormant = buildExportManifest({
    story: story(true),
    environment: CAPABLE_ENV,
    audioMode: "silent",
    shortForgeBrandStingEnabled: false,
  });
  assert.equal(dormant.version, 4);
  assert.ok(!("brandSting" in dormant));
  assert.ok(!("requiredCapabilities" in dormant));
  assert.equal(
    resolveAuthoritativeBrandStingDurationMs({
      shortForgeBrandStingEnabled: false,
      extensions: story(true).visualRetentionExtensions,
    }),
    0,
  );
});

const KEYFRAMES: MediaMotionKeyframe[] = [
  { offsetMs: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, easing: "ease-in" },
  { offsetMs: 4000, x: 40, y: -20, scale: 1.1, rotation: 4, opacity: 1, easing: "linear" },
];

function keyedMedia(): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/sting.jpg",
    source: "upload",
    motion: {
      version: 1,
      enabled: true,
      presetId: "slow-zoom-in",
      easing: "linear",
      intensity: 1,
      startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      endTransform: { x: 0, y: 0, scale: 1.1, rotation: 0 },
      keyframes: KEYFRAMES,
    },
  };
}

function engagementOn(script: FootieScript): FootieScript {
  return {
    ...script,
    visualRetentionExtensions: {
      version: 1,
      ...(script.visualRetentionExtensions ?? {}),
      engagementOverlaysBySceneId: {
        "scene-a": [
          {
            version: 1,
            id: "engagement-scene-a",
            kind: "like",
            startOffsetMs: 1000,
            durationMs: 2000,
            position: "top-right",
            presetId: "compact-pill-v1",
          },
        ],
      },
    },
  };
}

test("authoritative capability matrix in canonical requiredCapabilities order", () => {
  const stingOnly = asV5(
    buildExportManifest({
      story: story(true, 2500),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      shortForgeBrandStingEnabled: true,
    }),
  );
  assert.deepEqual(stingOnly.requiredCapabilities, ["shortforge-brand-sting-v1"]);
  assert.equal(stingOnly.brandSting?.title, "ShortForge Studio");
  const stingMedia = stingOnly.scenes[0]!.mediaTimeline.items[0]!.media;
  assert.ok(
    stingMedia.type === "placeholder" ||
      !("motion" in stingMedia) ||
      stingMedia.motion?.keyframes == null,
  );
  assert.equal(stingOnly.scenes[0]!.engagementOverlays?.length ?? 0, 0);

  const keyframeOnly = asV5(
    buildExportManifest({
      story: {
        ...story(false),
        scenes: [{ ...story(false).scenes[0]!, media: keyedMedia() }],
      },
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
      shortForgeBrandStingEnabled: false,
    }),
  );
  assert.deepEqual(keyframeOnly.requiredCapabilities, [
    "keyframed-visual-effects-v1",
  ]);
  assert.ok(!("brandSting" in keyframeOnly));

  const engagementOnly = asV5(
    buildExportManifest({
      story: engagementOn(story(false)),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: false,
    }),
  );
  assert.deepEqual(engagementOnly.requiredCapabilities, [
    "engagement-overlays-v1",
  ]);
  assert.ok(!("brandSting" in engagementOnly));

  const stingAndKeyframe = asV5(
    buildExportManifest({
      story: {
        ...story(true, 2500),
        scenes: [{ ...story(true, 2500).scenes[0]!, media: keyedMedia() }],
      },
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
      shortForgeBrandStingEnabled: true,
    }),
  );
  assert.deepEqual(stingAndKeyframe.requiredCapabilities, [
    "keyframed-visual-effects-v1",
    "shortforge-brand-sting-v1",
  ]);

  const stingAndEngagement = asV5(
    buildExportManifest({
      story: engagementOn(story(true, 2000)),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      shortForgeBrandStingEnabled: true,
      engagementOverlaysEnabled: true,
    }),
  );
  assert.deepEqual(stingAndEngagement.requiredCapabilities, [
    "engagement-overlays-v1",
    "shortforge-brand-sting-v1",
  ]);

  const allThree = asV5(
    buildExportManifest({
      story: engagementOn({
        ...story(true, 3000),
        scenes: [{ ...story(true, 3000).scenes[0]!, media: keyedMedia() }],
      }),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: true,
    }),
  );
  assert.deepEqual(allThree.requiredCapabilities, [
    "keyframed-visual-effects-v1",
    "engagement-overlays-v1",
    "shortforge-brand-sting-v1",
  ]);
  assert.equal(allThree.brandSting?.durationMs, 3000);
  assert.equal(
    allThree.project.contentDurationMs,
    allThree.brandSting!.startMs + allThree.brandSting!.durationMs,
  );

  // Sting-only must not fabricate scene / keyframe / engagement overlays.
  assert.equal(stingOnly.scenes.length, 1);
  assert.equal(stingOnly.project.sceneCount, 1);
});

test("capability-off dormant sting omits payload without altering other fingerprints", () => {
  const keyed = {
    ...story(true, 2500),
    scenes: [{ ...story(true, 2500).scenes[0]!, media: keyedMedia() }],
  };
  const withOverlay = engagementOn(keyed);
  const active = asV5(
    buildExportManifest({
      story: withOverlay,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: true,
    }),
  );
  const dormant = asV5(
    buildExportManifest({
      story: withOverlay,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: false,
    }),
  );
  assert.ok(!("brandSting" in dormant));
  assert.deepEqual(dormant.requiredCapabilities, [
    "keyframed-visual-effects-v1",
    "engagement-overlays-v1",
  ]);
  assert.ok(
    dormant.project.contentDurationMs < active.project.contentDurationMs,
  );
  assert.equal(
    buildExportManifestFingerprint(dormant),
    buildExportManifestFingerprint(
      buildExportManifest({
        story: engagementOn({
          ...story(false),
          scenes: [{ ...story(false).scenes[0]!, media: keyedMedia() }],
        }),
        environment: CAPABLE_ENV,
        audioMode: "silent",
        keyframedVisualEffectsEnabled: true,
        engagementOverlaysEnabled: true,
        shortForgeBrandStingEnabled: false,
      }),
    ),
  );
});

test("fixed Made with lead-in token is locked; title remains ShortForge Studio", () => {
  assert.equal(BRAND_STING_LEAD_IN, "Made with");
  assert.equal(BRAND_STING_LOCKED_TITLE, "ShortForge Studio");
  assert.match(
    readSrc("src/features/brand-sting/domain/brand-sting.presets.ts"),
    /BRAND_STING_LEAD_IN = "Made with"/,
  );
  assert.doesNotMatch(
    readSrc("src/features/brand-sting/editor/BrandStingExportControls.tsx"),
    /leadIn|Made with/,
  );
});

test("strict invalid-payload rejection and capability mismatches", () => {
  const valid = asV5(
    buildExportManifest({
      story: story(true),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      shortForgeBrandStingEnabled: true,
    }),
  );
  const withoutCap = structuredClone(valid) as ExportManifestV5 & {
    requiredCapabilities: string[];
  };
  withoutCap.requiredCapabilities = ["keyframed-visual-effects-v1"];
  assert.equal(validateExportManifest(withoutCap).ok, false);

  const withoutPayload = structuredClone(valid) as ExportManifestV5;
  delete (withoutPayload as { brandSting?: unknown }).brandSting;
  assert.equal(validateExportManifest(withoutPayload).ok, false);

  const badTitle = structuredClone(valid) as ExportManifestV5;
  (badTitle.brandSting as { title: string }).title = "Other Brand";
  assert.equal(validateExportManifest(badTitle).ok, false);
});

test("independent Browser/Headless support negotiation", () => {
  assert.ok(
    (EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES as readonly string[]).includes(
      "shortforge-brand-sting-v1",
    ),
  );
  assert.ok(
    (HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities as readonly string[]).includes(
      "shortforge-brand-sting-v1",
    ),
  );
  const builder = readSrc("src/features/export/domain/build-export-manifest.ts");
  assert.doesNotMatch(
    builder,
    /supportedCapabilities:\s*\[\.\.\.requiredCapabilities\]/,
  );
  assert.match(
    readSrc("src/features/headless-renderer/worker/chromium/page-entry.ts"),
    /requiredCapabilities/,
  );

  const missing = asV5(
    buildExportManifest({
      story: story(true),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      shortForgeBrandStingEnabled: true,
    }),
  );
  const unsupported = {
    ...structuredClone(missing),
    capabilities: {
      ...missing.capabilities,
      supportedCapabilities: [
        "keyframed-visual-effects-v1",
        "engagement-overlays-v1",
      ],
    },
  } as ExportManifestV5;
  const preflight = runExportCapabilityPreflight(unsupported);
  assert.equal(preflight.renderer, "blocked");
  assert.ok(
    preflight.blockers.some(
      (blocker) => blocker.capability === "shortforge-brand-sting-v1",
    ),
  );
});

test("malformed sting does not delete engagement overlays", () => {
  const normalized = normalizeVisualRetentionProjectExtensions(
    {
      version: 1,
      engagementOverlaysBySceneId: {
        "scene-a": [
          {
            version: 1,
            id: "keep-me",
            kind: "share",
            startOffsetMs: 0,
            durationMs: 1000,
            position: "top-left",
            presetId: "compact-pill-v1",
          },
        ],
      },
      shortForgeBrandSting: {
        version: 1,
        enabled: true,
        title: "Nope",
        durationMs: 2500,
      },
    },
    ["scene-a"],
  );
  assert.equal(normalized?.engagementOverlaysBySceneId?.["scene-a"]?.[0]?.id, "keep-me");
  assert.equal(normalized?.shortForgeBrandSting, undefined);
  assert.equal(getShortForgeBrandSting(normalized), undefined);
});

test("project helper omits when capability off", () => {
  const projected = projectBrandStingToManifest(
    createDefaultShortForgeBrandSting(),
    4000,
    false,
  );
  assert.equal(projected.brandSting, undefined);
});

console.log(`\n${passed} passed\n`);
