/**
 * Sprint 6B — ExportManifest builder / immutability / fingerprint.
 * Run: npm run test:export-manifest
 */
import assert from "node:assert/strict";

import {
  buildExportManifest,
  buildExportManifestFingerprint,
  EXPORT_MANIFEST_VERSION,
  EXPORT_MANIFEST_V3_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  EXPORT_RENDERER_CONTRACT_V3,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestDraft,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { TIMELINE_END_BUFFER_MS } from "@/features/timeline-intelligence/build-master-timeline";

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

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fixStory(): FootieScript {
  const scenes: FootieScript["scenes"] = [
    {
      id: "scene-1",
      start: 0,
      end: 3,
      duration: 3,
      startMs: 0,
      endMs: 3000,
      durationMs: 3000,
      subtitle: "Hello world",
      subtitleEffect: "fade-up",
      captionMode: "generated",
      image: {
        url: "https://example.com/a.jpg",
        scale: 1.2,
        x: 10,
        y: -5,
        rotation: 0,
        fitMode: "fit",
      },
      media: {
        type: "image",
        url: "https://example.com/a.jpg",
        source: "upload",
        transform: { x: 10, y: -5, scale: 1.2, rotation: 0 },
        motion: {
          version: 1,
          enabled: true,
          presetId: "zoom-in",
          easing: "ease-out",
          intensity: 0.8,
        },
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
      subtitle: "Second beat",
      media: {
        type: "video",
        url: "https://example.com/b.mp4",
        source: "upload",
        durationMs: 10_000,
        trimStartMs: 1000,
        trimEndMs: 4000,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        fitMode: "cover",
      },
    },
  ];

  return syncFootieScript({
    title: "Manifest Fixture",
    narration: "Scene one. Scene two.",
    totalDuration: 6,
    voiceoverUrl: "blob:voice-test",
    voiceoverDurationMs: 6000,
    voiceSettings: { speed: 1.1 },
    exportSettings: {
      fileName: "manifest-fixture",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes,
    timelineItems: [
      { id: "ti-s1", type: "scene", scene: scenes[0]! },
      {
        id: "ti-t1",
        type: "transition",
        fromSceneId: "scene-1",
        toSceneId: "scene-2",
        effect: "fade",
        durationMs: 400,
        label: "Fade",
      },
      { id: "ti-s2", type: "scene", scene: scenes[1]! },
    ],
  });
}

console.log("\nexport-manifest (Sprint 6B)\n");

test("canonical project duration uses MasterTimeline.renderDurationMs", () => {
  const story = fixStory();
  const manifest = buildExportManifest({
    story,
    exportSettings: story.exportSettings,
    environment: CAPABLE_ENV,
  });
  assert.equal(manifest.version, EXPORT_MANIFEST_VERSION);
  assert.equal(manifest.rendererContractVersion, EXPORT_RENDERER_CONTRACT_VERSION);
  assert.equal(manifest.project.renderDurationMs, 6000 + TIMELINE_END_BUFFER_MS);
  assert.ok(manifest.project.endBufferMs >= TIMELINE_END_BUFFER_MS - 1);
  assert.equal(manifest.output.fps, 30);
  assert.equal(manifest.output.resolution, "720p");
  assert.equal(manifest.output.format, "webm");
  assert.equal(manifest.output.mimeType, "video/webm");
  assert.equal(manifest.output.extension, ".webm");
});

test("scene start/duration/end and media mapping", () => {
  const manifest = buildExportManifest({
    story: fixStory(),
    environment: CAPABLE_ENV,
  });
  assert.equal(manifest.scenes.length, 2);
  const first = manifest.scenes[0]!;
  const second = manifest.scenes[1]!;
  assert.equal(first.startMs + first.durationMs, first.endMs);
  assert.equal(second.startMs + second.durationMs, second.endMs);
  assert.ok(first.mediaTimeline);
  assert.equal(first.mediaTimeline.version, 1);
  assert.equal(first.mediaTimeline.items.length, 1);
  assert.deepEqual(first.media, first.mediaTimeline.items[0]!.media);
  assert.equal(second.media.type, "video");
  if (second.media.type === "video") {
    assert.equal(second.media.trimStartMs, 1000);
    assert.equal(second.media.trimEndMs, 4000);
    assert.equal(second.media.sourceAudioPolicy, "muted");
    assert.equal(second.media.playbackRate, 1);
    assert.equal(second.media.fitMode, "fill");
  }
  assert.equal(first.media.type, "image");
  if (first.media.type === "image") {
    assert.equal(first.media.fitMode, "fit");
    assert.equal(first.media.zoom, 1.2);
    assert.equal(first.media.positionX, 10);
    assert.ok(first.media.motion?.enabled);
  }
  assert.equal(first.transitionOut?.type, "fade");
  assert.equal(first.transitionOut?.durationMs, 400);
});

test("captions, audio voice-speed metadata, branding", () => {
  const manifest = buildExportManifest({
    story: fixStory(),
    audioMode: "with-voice",
    environment: CAPABLE_ENV,
  });
  assert.ok(manifest.captions.length >= 1);
  assert.equal(manifest.audio.mode, "voice");
  assert.equal(manifest.audio.voiceover?.generatedPlaybackRate, 1);
  assert.equal(manifest.audio.voiceover?.sourceVoiceSpeed, 1.1);
  assert.equal(manifest.audio.sourceVideoAudioPolicy, "muted");
  assert.equal(manifest.branding.watermarkEnabled, true);
  assert.ok(manifest.branding.watermarkText.length > 0);
});

test("MP4 output mapping", () => {
  const story = fixStory();
  const manifest = buildExportManifest({
    story,
    exportSettings: {
      ...story.exportSettings!,
      format: "mp4",
    },
    environment: CAPABLE_ENV,
  });
  assert.equal(manifest.output.format, "mp4");
  assert.equal(manifest.output.mimeType, "video/mp4");
  assert.equal(manifest.output.extension, ".mp4");
});

test("deep immutability and isolation from editor mutation", () => {
  const story = fixStory();
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
  });
  const fingerprint = manifest.fingerprint;
  const firstSource =
    manifest.scenes[0]!.media.type !== "placeholder"
      ? manifest.scenes[0]!.media.source
      : "";

  story.title = "MUTATED TITLE";
  story.scenes[0]!.durationMs = 999_999;
  if (story.scenes[0]?.media && story.scenes[0].media.type !== "placeholder") {
    story.scenes[0].media.url = "https://evil.example/mutated.jpg";
  }
  if (story.exportSettings) {
    story.exportSettings.resolution = "1080x1920";
  }

  assert.equal(manifest.project.storyTitle, "Manifest Fixture");
  assert.equal(manifest.scenes[0]!.durationMs, 3000);
  assert.equal(
    manifest.scenes[0]!.media.type !== "placeholder"
      ? manifest.scenes[0]!.media.source
      : "",
    firstSource,
  );
  assert.equal(manifest.output.resolution, "720p");
  assert.equal(manifest.fingerprint, fingerprint);
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.scenes));
  assert.ok(Object.isFrozen(manifest.project));

  try {
    (manifest as { fingerprint: string }).fingerprint = "tampered";
  } catch {
    // Strict freeze may throw; either throw or no-op is acceptable.
  }
  assert.equal(manifest.fingerprint, fingerprint);

  const sceneCountBefore = manifest.scenes.length;
  try {
    (manifest.scenes as unknown as unknown[]).push({});
  } catch {
    // Strict freeze may throw on array mutation.
  }
  assert.equal(manifest.scenes.length, sceneCountBefore);
});

test("deterministic fingerprint excludes createdAt/manifestId", () => {
  const story = fixStory();
  const a = buildExportManifest({ story, environment: CAPABLE_ENV });
  const b = buildExportManifest({ story, environment: CAPABLE_ENV });
  assert.notEqual(a.manifestId, b.manifestId);
  assert.equal(a.fingerprint, b.fingerprint);

  const draft: ExportManifestDraft = {
    version: a.version,
    manifestId: "other-id",
    createdAt: "2099-01-01T00:00:00.000Z",
    rendererContractVersion: a.rendererContractVersion,
    project: a.project,
    output: a.output,
    scenes: a.scenes,
    captions: a.captions,
    audio: a.audio,
    branding: a.branding,
    capabilities: a.capabilities,
  };
  assert.equal(buildExportManifestFingerprint(draft), a.fingerprint);
});

test("caption layout + opacity survive manifest freeze unchanged", () => {
  const base = fixStory();
  const scenes = base.scenes.map((scene, index) =>
    index === 0
      ? {
          ...scene,
          captionLayout: {
            version: 2 as const,
            anchor: "center" as const,
            textAlign: "left" as const,
            offsetX: 40,
            offsetY: -80,
            maxWidthPercent: 85,
            safeAreaEnabled: true,
            backgroundOpacity: 3,
          },
          captionStyle: {
            backgroundOpacity: 3,
            backgroundEnabled: true,
            textColor: "#ffffff",
          },
        }
      : scene,
  );
  const story = syncFootieScript({ ...base, scenes });
  const manifest = buildExportManifest({ story, environment: CAPABLE_ENV });
  const caption = manifest.captions.find((entry) => entry.sceneId === "scene-1");
  assert.ok(caption);
  assert.equal(caption!.layout.anchor, "center");
  assert.equal(caption!.layout.textAlign, "left");
  assert.equal(caption!.layout.offsetX, 40);
  assert.equal(caption!.layout.offsetY, -80);
  assert.equal(caption!.layout.usesLegacyBottomCenter, false);
  assert.equal(caption!.style.backgroundOpacity, 3);
  assert.equal(caption!.style.textAlign, "left");
  assert.equal(Number(caption!.layout.offsetX) === 0 ? "zero-ok" : "nonzero", "nonzero");
});

test("explicit zero offsets and opacity are preserved (not defaulted away)", () => {
  const base = fixStory();
  const scenes = base.scenes.map((scene, index) =>
    index === 0
      ? {
          ...scene,
          captionLayout: {
            version: 2 as const,
            anchor: "top_center" as const,
            textAlign: "center" as const,
            offsetX: 0,
            offsetY: 0,
            backgroundOpacity: 0,
          },
          captionStyle: {
            backgroundOpacity: 0,
            backgroundEnabled: true,
          },
        }
      : scene,
  );
  const story = syncFootieScript({ ...base, scenes });
  const caption = buildExportManifest({ story, environment: CAPABLE_ENV }).captions.find(
    (entry) => entry.sceneId === "scene-1",
  );
  assert.ok(caption);
  assert.equal(caption!.layout.offsetX, 0);
  assert.equal(caption!.layout.offsetY, 0);
  assert.equal(caption!.style.backgroundOpacity, 0);
  assert.equal(caption!.layout.anchor, "top_center");
});

test("v4 freezes image/video visual adjustments into fingerprinted media", () => {
  const base = fixStory();
  const scenes = base.scenes.map((scene, index) =>
    index === 0
      ? {
          ...scene,
          media: {
            ...scene.media!,
            visualAdjustments: {
              version: 1 as const,
              brightness: 115,
              contrast: 130,
              saturation: 85,
              shadowEnabled: true,
              shadowColor: "#123456",
              shadowOpacity: 0.4,
              shadowBlur: 18,
              shadowOffsetX: 4,
              shadowOffsetY: 9,
            },
          },
        }
      : scene,
  );
  const manifest = buildExportManifest({
    story: syncFootieScript({ ...base, scenes }),
    environment: CAPABLE_ENV,
  });
  assert.equal(manifest.version, 4);
  assert.equal(manifest.rendererContractVersion, "9D");
  assert.equal(manifest.scenes[0]!.media.type, "image");
  assert.equal(manifest.scenes[0]!.media.visualAdjustments?.contrast, 130);
  const timelineMedia = manifest.scenes[0]!.mediaTimeline.items[0]!.media;
  assert.notEqual(timelineMedia.type, "placeholder");
  assert.equal(
    timelineMedia.type === "placeholder"
      ? undefined
      : timelineMedia.visualAdjustments?.shadowBlur,
    18,
  );
  assert.equal(validateExportManifest(manifest).ok, true);

  const corrupted = structuredClone(manifest);
  const corruptedMedia = corrupted.scenes[0]!.media;
  if (corruptedMedia.type !== "placeholder" && corruptedMedia.visualAdjustments) {
    (corruptedMedia.visualAdjustments as { shadowColor: string }).shadowColor =
      "red);url(https://invalid.example";
  }
  assert.equal(validateExportManifest(corrupted).ok, false);
  assert.notEqual(buildExportManifestFingerprint({
    version: corrupted.version,
    rendererContractVersion: corrupted.rendererContractVersion,
    manifestId: corrupted.manifestId,
    createdAt: corrupted.createdAt,
    project: corrupted.project,
    output: corrupted.output,
    scenes: corrupted.scenes,
    captions: corrupted.captions,
    audio: corrupted.audio,
    branding: corrupted.branding,
    capabilities: corrupted.capabilities,
  }), manifest.fingerprint);

  const frozenV3Draft = {
    version: EXPORT_MANIFEST_V3_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_V3,
    manifestId: manifest.manifestId,
    createdAt: manifest.createdAt,
    project: manifest.project,
    output: manifest.output,
    scenes: manifest.scenes,
    captions: manifest.captions,
    audio: manifest.audio,
    branding: manifest.branding,
    capabilities: manifest.capabilities,
  };
  const frozenV3WithV4Media = {
    ...frozenV3Draft,
    fingerprint: buildExportManifestFingerprint(
      frozenV3Draft as unknown as ExportManifestDraft,
    ),
  };
  const frozenV3Result = validateExportManifest(frozenV3WithV4Media);
  assert.equal(frozenV3Result.ok, false);
  assert.ok(
    frozenV3Result.issues.some(
      (entry) => entry.code === "UNSUPPORTED_MEDIA_VISUAL_ADJUSTMENTS",
    ),
  );
});

console.log(`\n${passed} tests passed.\n`);
