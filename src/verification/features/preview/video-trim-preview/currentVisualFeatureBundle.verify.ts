/**
 * Prompt 2B frozen-story / manifest / capability handshake.
 * Run: npm run test:current-visual-feature-bundle
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveBrandStingFrame } from "@/features/brand-sting/domain/resolve-brand-sting-frame";
import { resolveEngagementOverlayFrame } from "@/features/engagement-overlays/domain/resolve-engagement-overlay-frame";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import {
  buildExportManifest,
  isExportManifestV5,
  validateExportManifest,
} from "@/features/export/domain";
import { HEADLESS_WORKER_PHASE3_SUPPORTED } from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildCurrentVisualFeatureBundleStory } from "@/features/preview/video-trim-preview/build-current-visual-feature-bundle-story";
import {
  CURRENT_VISUAL_FEATURE_BUNDLE_BRAND_STING_DURATION_MS,
  CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
  CURRENT_VISUAL_FEATURE_BUNDLE_CONTENT_DURATION_MS,
  CURRENT_VISUAL_FEATURE_BUNDLE_CTA,
  CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_B_ID,
  CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES,
  CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
} from "@/features/preview/video-trim-preview/current-visual-feature-bundle-contract";
import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function capableManifest() {
  return buildExportManifest({
    story: buildCurrentVisualFeatureBundleStory(),
    exportSettings: {
      fileName: "current-visual-feature-bundle",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    audioMode: "silent",
    ...CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
  });
}

console.log("\nCurrent visual feature bundle\n");

test("authored story contains trim, CTA, sting, and a fade", () => {
  const story = buildCurrentVisualFeatureBundleStory();
  const scene = story.scenes[0]!;
  const itemB = scene.mediaTimeline?.items.find(
    (item) => item.id === CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_B_ID,
  );
  assert.equal(itemB?.media.trimStartMs, 2_000);
  assert.equal(itemB?.media.trimEndMs, 5_000);
  assert.equal(scene.captionStyle?.backgroundEnabled, false);
  const overlay = getSceneEngagementOverlay(
    story,
    CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
  );
  assert.equal(overlay?.kind, "combined");
  assert.equal(overlay?.position, "bottom-center");
  assert.equal(overlay?.size, "medium");
  assert.equal(overlay?.scale, CURRENT_VISUAL_FEATURE_BUNDLE_CTA.scale);
  assert.equal(overlay?.startOffsetMs, CURRENT_VISUAL_FEATURE_BUNDLE_CTA.startOffsetMs);
  assert.equal(overlay?.durationMs, CURRENT_VISUAL_FEATURE_BUNDLE_CTA.durationMs);
  const sting = getShortForgeBrandSting(story.visualRetentionExtensions);
  assert.equal(sting?.enabled, true);
  assert.equal(sting?.durationMs, CURRENT_VISUAL_FEATURE_BUNDLE_BRAND_STING_DURATION_MS);
  assert.equal(
    scene.mediaTransitions?.boundaries.some((boundary) => boundary.effect === "fade"),
    true,
  );
});

test("capability-off freeze omits CTA and Brand Sting — first decisive loss point", () => {
  const story = buildCurrentVisualFeatureBundleStory();
  const omitted = buildExportManifest({
    story,
    mixedMediaScenesEnabled: true,
    exportSettings: {
      fileName: "omitted",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    audioMode: "silent",
  });
  assert.equal(
    "requiredCapabilities" in omitted &&
      Array.isArray(omitted.requiredCapabilities) &&
      omitted.requiredCapabilities.includes("engagement-overlays-v1"),
    false,
  );
  assert.equal(
    "requiredCapabilities" in omitted &&
      Array.isArray(omitted.requiredCapabilities) &&
      omitted.requiredCapabilities.includes("shortforge-brand-sting-v1"),
    false,
  );
  assert.equal("brandSting" in omitted && omitted.brandSting != null, false);
  const scene = omitted.scenes[0] as { engagementOverlays?: unknown };
  assert.equal(
    scene.engagementOverlays == null ||
      (Array.isArray(scene.engagementOverlays) &&
        scene.engagementOverlays.length === 0),
    true,
  );
});

test("capability-on freeze keeps CTA, sting, trim, and v5 capabilities", () => {
  const manifest = capableManifest();
  assert.equal(validateExportManifest(manifest).ok, true);
  assert.equal(isExportManifestV5(manifest), true);
  if (!isExportManifestV5(manifest)) return;
  assert.ok(manifest.requiredCapabilities.includes("engagement-overlays-v1"));
  assert.ok(manifest.requiredCapabilities.includes("shortforge-brand-sting-v1"));
  assert.ok(
    manifest.requiredCapabilities.includes("continuous-intra-scene-transitions-v1"),
  );
  assert.equal(manifest.brandSting?.durationMs, CURRENT_VISUAL_FEATURE_BUNDLE_BRAND_STING_DURATION_MS);
  assert.ok(manifest.project.renderDurationMs >= CURRENT_VISUAL_FEATURE_BUNDLE_CONTENT_DURATION_MS + CURRENT_VISUAL_FEATURE_BUNDLE_BRAND_STING_DURATION_MS);
  const overlay = manifest.scenes[0]?.engagementOverlays?.[0];
  assert.ok(overlay);
  assert.equal(overlay?.kind, "combined");
  assert.equal(overlay?.position, "bottom-center");
  assert.equal(overlay?.size, "medium");
  assert.equal(overlay?.scale, 1);
  assert.equal(overlay?.startOffsetMs, CURRENT_VISUAL_FEATURE_BUNDLE_CTA.startOffsetMs);
  assert.equal(overlay?.durationMs, CURRENT_VISUAL_FEATURE_BUNDLE_CTA.durationMs);
  const itemB = manifest.scenes[0]?.mediaTimeline.items.find(
    (item) => item.id === CURRENT_VISUAL_FEATURE_BUNDLE_ITEM_B_ID,
  );
  assert.equal(itemB?.media.type === "video" ? itemB.media.trimStartMs : null, 2_000);
  assert.equal(itemB?.media.type === "video" ? itemB.media.trimEndMs : null, 5_000);
});

test("Subscribe wording and caption-safe placement stay on the shared frame plan", () => {
  const story = buildCurrentVisualFeatureBundleStory();
  const overlay = getSceneEngagementOverlay(
    story,
    CURRENT_VISUAL_FEATURE_BUNDLE_SCENE_ID,
  );
  const confirmation = CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES.find(
    (sample) => sample.id === "cta-subscribe-confirmation",
  )!;
  const frame = resolveEngagementOverlayFrame({
    overlay,
    sceneDurationMs: CURRENT_VISUAL_FEATURE_BUNDLE_CONTENT_DURATION_MS,
    sceneElapsedMs: confirmation.timestampMs,
    frameWidth: 1080,
    frameHeight: 1920,
    captionCollision: {
      present: true,
      sceneLayout: story.scenes[0]?.captionLayout,
      sceneStyle: story.scenes[0]?.captionStyle,
    },
  });
  assert.equal(frame.visible, true);
  assert.deepEqual(frame.labels, ["Like", "Share", "Subscribe"]);
  const active = frame.segments.find((segment) => segment.active);
  assert.equal(active?.label, "Subscribe");
  assert.equal(active?.confirmation, true);
  assert.equal(
    frame.segments.every((segment) => segment.label !== "Subscribed"),
    true,
  );
  assert.equal(frame.captionSafePlacement.translated, true);
  assert.ok(frame.layout.y < frame.captionSafePlacement.requested.y);
  assert.equal(frame.chrome.columnCount, 3);
  assert.equal(frame.chrome.columnBoxes.length, 3);
});

test("Brand Sting duration is included once after content", () => {
  const sting = getShortForgeBrandSting(
    buildCurrentVisualFeatureBundleStory().visualRetentionExtensions,
  );
  const hold = resolveBrandStingFrame({
    sting,
    elapsedMs: 1_000,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  assert.equal(hold.visible, true);
  assert.equal(hold.phase, "hold");
  const after = resolveBrandStingFrame({
    sting,
    elapsedMs: CURRENT_VISUAL_FEATURE_BUNDLE_BRAND_STING_DURATION_MS,
    frameWidth: 1080,
    frameHeight: 1920,
  });
  assert.equal(after.visible, false);
});

test("current worker advertises CTA/outro capabilities and rejects unknown IDs", () => {
  assert.ok(
    (HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities as readonly string[]).includes(
      "engagement-overlays-v1",
    ),
  );
  assert.ok(
    (HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities as readonly string[]).includes(
      "shortforge-brand-sting-v1",
    ),
  );
  const preflight = readSrc(
    "src/features/headless-renderer/worker/runtime/capability-preflight.ts",
  );
  assert.match(preflight, /requiredCapabilities\.some/);
  assert.match(preflight, /UNSUPPORTED_CAPABILITY/);
  assert.match(preflight, /HEADLESS_WORKER_PHASE3_SUPPORTED\.rendererCapabilities/);
  const page = readSrc(
    "src/features/headless-renderer/worker/chromium/page-entry.ts",
  );
  assert.match(page, /unsupported/);
  assert.doesNotMatch(preflight, /return null;\s*\/\/ silent/);
});

test("Prompt 1–2 import boundary no longer pulls SpeechStylePanel into Headless", () => {
  const renderer = readSrc(
    "src/features/export/utils/export-scene-media-renderer.ts",
  );
  assert.match(
    renderer,
    /from "@\/features\/media-playback\/media-playback\.utils"/,
  );
  assert.doesNotMatch(
    renderer,
    /from "@\/features\/media-playback";/,
  );
  const barrel = readSrc("src/features/speech-style/index.ts");
  assert.doesNotMatch(barrel, /SpeechStylePanel/);
  const commands = readSrc(
    "src/features/scene-media-timeline/editor/scene-media-timeline.commands.ts",
  );
  assert.match(
    commands,
    /from "@\/features\/media-playback\/media-trim-patch\.utils"/,
  );
});

console.log(`\n${passed} passed`);
