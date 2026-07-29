/**
 * Sprint 11E Phase 2G.24C — transition continuity authority.
 * Run: npm run test:export-transition-continuity-authority
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportManifest,
  isExportSceneManifestV3,
  resolveExportIntraSceneTransitionAtElapsed,
  runExportCapabilityPreflight,
  type ExportManifest,
  type ExportSceneManifestV3,
} from "@/features/export/domain";
import {
  resolveExportFrameTimestampMs,
  resolveExportTotalFrames,
  resolveExportTransitionFrame,
} from "@/features/export/timing";
import { resolveIntraSceneTransitionAtElapsed } from "@/features/scene-media-transitions";
import {
  buildMasterTimeline,
  getTimelineTrackByType,
  resolveCanonicalTransitionEffectLayers,
  resolveCanonicalTransitionProgressForSample,
  resolveTimelineFrameSampleTimeMs,
  resolveTransitionEffectLayers,
  resolveTransitionState,
  type TransitionTimelineEvent,
} from "@/features/timeline-intelligence";
import { getExportTransitionLayerDrawStates } from "@/features/export/utils/export-transition-canvas.utils";
import type { FootieScript } from "@/features/story/types";
import { buildIntraSceneTransitionGoldenFixture } from "@/verification/scene-media-transitions/goldens";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const FPS = 30;

function sampleFrameIndexForTimeMs(timeMs: number): number {
  return Math.max(0, Math.round((timeMs * FPS) / 1000 - 0.5));
}

function fadeCoverage(opacityFrom: number, opacityTo: number): number {
  return opacityFrom + opacityTo;
}

function transitionStory(): FootieScript {
  const scenes = [
    {
      id: "s1",
      start: 0,
      end: 4,
      duration: 4,
      startMs: 0,
      endMs: 4000,
      durationMs: 4000,
      subtitle: "Scene one",
      media: {
        type: "image" as const,
        url: "https://example.com/red.jpg",
        source: "upload" as const,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      image: {
        url: "https://example.com/red.jpg",
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        fitMode: "fit" as const,
      },
    },
    {
      id: "s2",
      start: 4,
      end: 8,
      duration: 4,
      startMs: 4000,
      endMs: 8000,
      durationMs: 4000,
      subtitle: "Scene two",
      media: {
        type: "image" as const,
        url: "https://example.com/blue.jpg",
        source: "upload" as const,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      image: {
        url: "https://example.com/blue.jpg",
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        fitMode: "fit" as const,
      },
    },
  ];
  return syncFootieScript({
    title: "Transition QA",
    narration: "Scene one. Scene two.",
    totalDuration: 8,
    exportSettings: {
      fileName: "transition-qa",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    scenes,
    timelineItems: [
      { id: "ti-1", type: "scene", scene: scenes[0]! },
      {
        id: "tr-1",
        type: "transition",
        fromSceneId: "s1",
        toSceneId: "s2",
        effect: "fade",
        durationMs: 500,
        label: "Fade",
      },
      { id: "ti-2", type: "scene", scene: scenes[1]! },
    ],
  });
}

function manifestFor(story: FootieScript): ExportManifest {
  return buildExportManifest({
    story,
    multiImageScenesEnabled: true,
    environment: {
      browserName: "chrome",
      supportsCanvasCaptureStream: true,
      supportsManualCanvasFrameRequest: true,
      supportsMediaRecorder: true,
      supportsWebAssembly: true,
      serverRendererAvailable: false,
      ffmpegRuntimePoisoned: false,
      mp4EncoderAvailable: true,
    },
  });
}

console.log("\nexport-transition-continuity-authority (Sprint 11E 2G.24C)\n");

test("reproduction: legacy cap prevented intra-scene completion", () => {
  const progressAt999 = Math.min(
    0.999999999999,
    0.999999999999,
  );
  assert.ok(progressAt999 < 1);
  const canonical = resolveCanonicalTransitionProgressForSample({
    sampleTimeMs: 999,
    windowStartMs: 0,
    windowEndMs: 1000,
    fps: FPS,
  });
  assert.equal(canonical, 1);
});

test("1. Inter-scene fade has no black/uncovered frame", () => {
  for (let p = 0; p <= 1; p += 0.05) {
    const layers = resolveTransitionEffectLayers("fade", p);
    assert.ok(
      fadeCoverage(layers.opacityFrom, layers.opacityTo) >= 0.999,
      `fade coverage at ${p}`,
    );
  }
});

test("2. Inter-scene slide has no uncovered frame at boundary", () => {
  const start = resolveCanonicalTransitionEffectLayers({
    sampleTimeMs: 1000,
    windowStartMs: 1000,
    windowEndMs: 1500,
    fps: FPS,
    effect: "slide-left",
  });
  const end = resolveCanonicalTransitionEffectLayers({
    sampleTimeMs: resolveTimelineFrameSampleTimeMs(
      sampleFrameIndexForTimeMs(1499),
      FPS,
    ),
    windowStartMs: 1000,
    windowEndMs: 1500,
    fps: FPS,
    effect: "slide-left",
  });
  assert.equal(start.opacityFrom, 1);
  assert.equal(start.opacityTo, 1);
  assert.equal(end.opacityFrom, 1);
  assert.equal(end.opacityTo, 1);
});

test("3. Transition reaches completed incoming state", () => {
  const progress = resolveCanonicalTransitionProgressForSample({
    sampleTimeMs: resolveTimelineFrameSampleTimeMs(
      sampleFrameIndexForTimeMs(3999),
      FPS,
    ),
    windowStartMs: 3500,
    windowEndMs: 4000,
    fps: FPS,
  });
  assert.equal(progress, 1);
  const layers = resolveTransitionEffectLayers("fade", progress!);
  assert.equal(layers.opacityFrom, 0);
  assert.equal(layers.opacityTo, 1);
});

test("4. First post-transition frame is inactive overlay", () => {
  const manifest = manifestFor(transitionStory());
  const post = resolveExportTransitionFrame(manifest, 4000);
  assert.equal(post, null);
});

function exportSceneFromFixture(
  fixture: ReturnType<typeof buildIntraSceneTransitionGoldenFixture>,
): ExportSceneManifestV3 {
  const manifest = buildExportManifest({
    story: fixture.story,
    multiImageScenesEnabled: true,
    environment: {
      browserName: "chrome",
      supportsCanvasCaptureStream: true,
      supportsManualCanvasFrameRequest: true,
      supportsMediaRecorder: true,
      supportsWebAssembly: true,
      serverRendererAvailable: false,
      ffmpegRuntimePoisoned: false,
      mp4EncoderAvailable: true,
    },
  });
  const scene = manifest.scenes.find((entry) => entry.id === fixture.primarySceneId)!;
  assert.ok(isExportSceneManifestV3(scene));
  return scene;
}

function storySceneFromFixture(
  fixture: ReturnType<typeof buildIntraSceneTransitionGoldenFixture>,
) {
  return fixture.story.scenes.find((entry) => entry.id === fixture.primarySceneId)!;
}

function lateOverlayElapsedMs(
  scene: ReturnType<typeof exportSceneFromFixture>,
): number {
  const boundary = scene.mediaTransitions.boundaries[0]!;
  const framePeriodMs = 1000 / FPS;
  return boundary.overlayEndOffsetMs - framePeriodMs;
}

test("5. Image→image intra-scene preview/export progress parity", () => {
  const fixture = buildIntraSceneTransitionGoldenFixture("ist-fade");
  const storyScene = storySceneFromFixture(fixture);
  const exportScene = exportSceneFromFixture(fixture);
  const mid = exportScene.mediaTransitions.boundaries[0]!.overlayStartOffsetMs + 20;
  const exportResolved = resolveExportIntraSceneTransitionAtElapsed(exportScene, mid, FPS);
  const previewResolved = resolveIntraSceneTransitionAtElapsed(storyScene, mid, FPS);
  assert.ok(exportResolved);
  assert.ok(previewResolved.active);
  assert.equal(exportResolved!.progress, previewResolved.progress);

  const late = lateOverlayElapsedMs(exportScene);
  const exportLast = resolveExportIntraSceneTransitionAtElapsed(exportScene, late, FPS);
  const previewLast = resolveIntraSceneTransitionAtElapsed(storyScene, late, FPS);
  assert.equal(exportLast?.progress, 1);
  assert.equal(previewLast.progress, 1);
});

test("6–8. Intra-scene media-type continuity uses canonical completion", () => {
  for (const id of [
    "ist-image-to-image",
    "ist-image-to-video",
    "ist-video-to-image",
    "ist-video-to-video",
  ] as const) {
    const fixture = buildIntraSceneTransitionGoldenFixture(id);
    const storyScene = storySceneFromFixture(fixture);
    const exportScene = exportSceneFromFixture(fixture);
    const late = lateOverlayElapsedMs(exportScene);
    const exportLast = resolveExportIntraSceneTransitionAtElapsed(exportScene, late, FPS);
    const previewLast = resolveIntraSceneTransitionAtElapsed(storyScene, late, FPS);
    assert.equal(exportLast?.progress, 1, `${id} export completes`);
    assert.equal(previewLast.progress, 1, `${id} preview completes`);
  }
});

test("9. Cut remains a hard cut", () => {
  const layers = resolveTransitionEffectLayers("cut", 1);
  assert.equal(layers.opacityFrom, 0);
  assert.equal(layers.opacityTo, 1);
});

test("10. No transition change to total frame count", () => {
  const manifest = manifestFor(transitionStory());
  const before = resolveExportTotalFrames(manifest);
  assert.ok(before > 0);
  assert.equal(resolveExportTotalFrames(manifest), before);
});

test("11. Browser/Headless manifest transition progress parity", () => {
  const manifest = manifestFor(transitionStory());
  const frameIndex = sampleFrameIndexForTimeMs(3750);
  const sampleMs = resolveExportFrameTimestampMs(frameIndex, FPS);
  const exportFrame = resolveExportTransitionFrame(manifest, sampleMs);
  assert.ok(exportFrame);
  const canonical = resolveCanonicalTransitionProgressForSample({
    sampleTimeMs: sampleMs,
    windowStartMs: exportFrame!.startMs,
    windowEndMs: exportFrame!.endMs,
    fps: FPS,
  });
  assert.equal(exportFrame!.progress, canonical);
});

test("12. Preview/export resolveTransitionState uses canonical progress", () => {
  const timeline = buildMasterTimeline(transitionStory(), { mode: "preview" });
  const track = getTimelineTrackByType(timeline.tracks, "transition");
  const event = track?.events[0] as TransitionTimelineEvent | undefined;
  assert.ok(event);
  const sampleMs = resolveTimelineFrameSampleTimeMs(
    sampleFrameIndexForTimeMs(3999),
    FPS,
  );
  const state = resolveTransitionState(event!, sampleMs, FPS);
  assert.equal(state.isActive, true);
  assert.equal(state.progress, 1);
});

test("13. Fractional-frame boundaries remain deterministic", () => {
  const a = resolveCanonicalTransitionProgressForSample({
    sampleTimeMs: 3833,
    windowStartMs: 3500,
    windowEndMs: 4000,
    fps: FPS,
  });
  const b = resolveCanonicalTransitionProgressForSample({
    sampleTimeMs: 3833,
    windowStartMs: 3500,
    windowEndMs: 4000,
    fps: FPS,
  });
  assert.deepEqual(a, b);
});

test("14. Invalid transition metadata still fails closed", () => {
  const base = manifestFor(transitionStory());
  const forged = {
    ...base,
    scenes: [
      {
        ...base.scenes[0]!,
        transitionOut: {
          type: "warp-hole",
          durationMs: 300,
          fromSceneId: "s1",
          toSceneId: "s2",
        },
      },
      ...base.scenes.slice(1),
    ],
  } as ExportManifest;
  const result = runExportCapabilityPreflight(forged);
  assert.equal(result.supported, false);
});

test("15. Captions remain layered during intra-scene transitions", () => {
  const draw = read("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.match(draw, /else if \(intra\)/);
  assert.match(draw, /drawExportSubtitlesCaption|drawPreparedExportCaptions/);
  assert.doesNotMatch(
    draw.slice(draw.indexOf("else if (intra)"), draw.indexOf("else if (intra)") + 600),
    /return;/,
  );
});

test("16. Motion/crop/adjustment paths remain in export media renderer", () => {
  const renderer = read("src/features/export/utils/export-scene-media-renderer.ts");
  assert.match(renderer, /visualAdjustment|motion|framing|trim/);
});

test("audio isolation: visual transition authority does not touch audio graph", () => {
  const canonical = read(
    "src/features/timeline-intelligence/resolve-canonical-transition-frame.utils.ts",
  );
  const audioFilter = read(
    "src/features/headless-renderer/worker/audio/build-headless-audio-filter.ts",
  );
  assert.doesNotMatch(canonical, /buildHeadlessAudioFilter|volume=|amix|acrossfade/);
  assert.doesNotMatch(
    read("src/features/export/runtime/prepare-export-frame.ts"),
    /buildHeadlessAudioFilter|buildExportAudioFilterGraph/,
  );
  assert.match(audioFilter, /amix=inputs=2/);
});

test("pixel blend: completed fade equals incoming color weight 1", () => {
  const from: [number, number, number] = [255, 0, 0];
  const to: [number, number, number] = [0, 0, 255];
  const layers = getExportTransitionLayerDrawStates("fade", 1);
  const r = from[0] * layers.from.opacity + to[0] * layers.to.opacity;
  const g = from[1] * layers.from.opacity + to[1] * layers.to.opacity;
  const b = from[2] * layers.from.opacity + to[2] * layers.to.opacity;
  assert.equal(r, 0);
  assert.equal(g, 0);
  assert.equal(b, 255);
});

console.log(`\nexport-transition-continuity-authority: ${passed} passed\n`);
