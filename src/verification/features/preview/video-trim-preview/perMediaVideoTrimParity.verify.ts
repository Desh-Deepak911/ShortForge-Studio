/**
 * Prompt 2 — canonical per-media video trim parity.
 * Provider-free. One source-time contract for Preview, Browser, and Headless.
 * Run: npm run test:per-media-video-trim-parity
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCaptionBackgroundAuthority } from "@/features/caption-style";
import { buildExportManifest } from "@/features/export/domain";
import { resolveExportVideoSourceTimeMs } from "@/features/export/timing/resolve-export-video-source-time";
import { hydrateExportDrawSceneMedia } from "@/features/export/runtime/hydrate-export-draw-media";
import {
  applyVideoTrimToMediaItem,
  moveSceneMediaItemRight,
  projectSceneMediaTimeline,
  removeSceneMediaItem,
  resolveActiveSceneMediaRenderView,
  resolvePreviewSceneMediaWindows,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline";
import { composeIntraSceneTransitionPreview } from "@/features/scene-media-transitions/preview";
import {
  VIDEO_CLIP_END_EPSILON_MS,
  buildVideoTrimForMedia,
  resolveDisplayableVideoSourceTimeMs,
  resolveSceneMediaClipTime,
} from "@/features/media-playback";
import { resolvePreviewVideoClipTime } from "@/features/preview/utils/preview-video-clip.utils";
import { writeMixedMediaSequenceItems } from "@/features/mixed-media-scenes";
import { resolveCurrentPreviewPlaybackPresentation } from "@/features/preview/runtime-parity/resolve-preview-presentation-authority";
import { resolvePreviewSelectedMediaInspection } from "@/features/preview/runtime-parity/resolve-preview-selected-media-inspection";
import {
  buildPerMediaVideoTrimScene,
  buildPerMediaVideoTrimSourceMedia,
  buildPerMediaVideoTrimStory,
} from "@/features/preview/video-trim-preview/build-per-media-video-trim-story";
import {
  PER_MEDIA_VIDEO_TRIM_A,
  PER_MEDIA_VIDEO_TRIM_B,
  PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
  PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
  PER_MEDIA_VIDEO_TRIM_SAMPLES,
  PER_MEDIA_VIDEO_TRIM_SCENE_ID,
  labelForSourceTimeMs,
} from "@/features/preview/video-trim-preview/per-media-video-trim-contract";
import {
  buildVideoTrimPreviewOverride,
  shouldApplyVideoTrimPreviewOverride,
  shouldClearTrimPreviewOnMediaItemChange,
} from "@/features/preview/video-trim-preview/video-trim-preview.utils";
import type { FootieScene, SceneMedia } from "@/features/story/types";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function sourceTime(
  media: Pick<SceneMedia, "durationMs" | "trimStartMs" | "trimEndMs">,
  itemElapsedMs: number,
) {
  const preview = resolvePreviewVideoClipTime({
    sceneElapsedMs: itemElapsedMs,
    trimStartMs: media.trimStartMs,
    trimEndMs: media.trimEndMs,
    durationMs: media.durationMs,
  });
  const shared = resolveSceneMediaClipTime(media, itemElapsedMs);
  assert.equal(preview.clipTimeMs, shared.clipTimeMs);
  return preview;
}

function itemOf(scene: FootieScene, id: string) {
  const item = projectSceneMediaTimeline(scene).items.find((entry) => entry.id === id);
  assert.ok(item, `missing ${id}`);
  return item;
}

test("untrimmed media starts at source zero", () => {
  const media = buildPerMediaVideoTrimSourceMedia();
  const result = sourceTime(media, 0);
  assert.equal(result.clipTimeMs, 0);
  assert.equal(result.holdingLastFrame, false);
});

test("non-zero trim start never begins at source zero", () => {
  const media = buildPerMediaVideoTrimSourceMedia({ trimStartMs: 2_000, trimEndMs: 5_000 });
  const result = sourceTime(media, 0);
  assert.equal(result.clipTimeMs, 2_000);
  assert.equal(labelForSourceTimeMs(result.clipTimeMs), "SOURCE 2");
  assert.notEqual(result.clipTimeMs, 0);
});

test("trim start and trim end clamp item-local elapsed", () => {
  const media = buildPerMediaVideoTrimSourceMedia({ trimStartMs: 2_000, trimEndMs: 5_000 });
  assert.equal(sourceTime(media, 1_500).clipTimeMs, 3_500);
  const held = sourceTime(media, 4_000);
  assert.equal(held.clipTimeMs, 5_000);
  assert.equal(held.holdingLastFrame, true);
});

test("two items keep different trims on the same URL", () => {
  const scene = buildPerMediaVideoTrimScene();
  const a = itemOf(scene, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID);
  const b = itemOf(scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.equal(a.media.url, b.media.url);
  assert.equal(a.media.trimStartMs, PER_MEDIA_VIDEO_TRIM_A.trimStartMs);
  assert.equal(b.media.trimStartMs, PER_MEDIA_VIDEO_TRIM_B.trimStartMs);
  assert.equal(sourceTime(a.media, 0).clipTimeMs, 0);
  assert.equal(sourceTime(b.media, 0).clipTimeMs, 2_000);
});

test("selected second-item inspection shows item B at its trim start", () => {
  const scene = buildPerMediaVideoTrimScene();
  const inspection = resolvePreviewSelectedMediaInspection({
    scene,
    selectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    sceneElapsedMs: 200,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(inspection.active, true);
  assert.equal(inspection.selectedMediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.equal(inspection.inspectionItemElapsedMs, 0);
  assert.equal(inspection.view?.media?.trimStartMs, 2_000);
  assert.equal(sourceTime(inspection.view!.media!, 0).clipTimeMs, 2_000);
});

test("trim scrub stays on the selected item instead of falling back to the timeline", () => {
  const scene = buildPerMediaVideoTrimScene();
  const inspection = resolvePreviewSelectedMediaInspection({
    scene,
    selectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    sceneElapsedMs: 200,
    trimScrubActive: true,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(inspection.active, true);
  assert.equal(inspection.presentationAuthority, "trim-scrub");
  assert.equal(inspection.selectedMediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);

  const presented = resolveCurrentPreviewPlaybackPresentation({
    scene,
    sceneElapsedMs: 200,
    isPlaying: false,
    selectedMediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    trimScrubActive: true,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(presented.playbackMedia.mediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.equal(presented.playbackAuthority, "trim-scrub");
});

test("trim preview override is scoped by scene and media item", () => {
  const override = buildVideoTrimPreviewOverride({
    sceneId: PER_MEDIA_VIDEO_TRIM_SCENE_ID,
    mediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    trimStartMs: 2_000,
    trimEndMs: 5_000,
    activeHandle: "start",
  });
  assert.equal(
    shouldApplyVideoTrimPreviewOverride(
      override,
      PER_MEDIA_VIDEO_TRIM_SCENE_ID,
      PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    ),
    true,
  );
  assert.equal(
    shouldApplyVideoTrimPreviewOverride(
      override,
      PER_MEDIA_VIDEO_TRIM_SCENE_ID,
      PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
    ),
    false,
  );
  assert.equal(
    shouldClearTrimPreviewOnMediaItemChange(
      override,
      PER_MEDIA_VIDEO_TRIM_SCENE_ID,
      PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
    ),
    true,
  );
});

test("apply persists to the selected item; cancel keeps the prior trim", () => {
  const scene = buildPerMediaVideoTrimScene();
  const before = itemOf(scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID).media;
  const applied = applyVideoTrimToMediaItem(scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID, {
    trimStartMs: 1_000,
    trimEndMs: 4_000,
  });
  assert.ok(applied);
  assert.equal(itemOf(applied.scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID).media.trimStartMs, 1_000);
  assert.equal(itemOf(applied.scene, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID).media.trimStartMs, 0);
  const restored = applyVideoTrimToMediaItem(applied.scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID, {
    trimStartMs: before.trimStartMs ?? 0,
    trimEndMs: before.trimEndMs ?? 6_000,
  });
  assert.equal(itemOf(restored!.scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID).media.trimStartMs, 2_000);
});

test("scene playback crosses item boundaries with item-local elapsed", () => {
  const scene = buildPerMediaVideoTrimScene();
  const early = resolveActiveSceneMediaRenderView(scene, 200, {
    mixedMediaScenesEnabled: true,
  });
  const boundary = resolveActiveSceneMediaRenderView(scene, 4_000, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(early.mediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID);
  assert.equal(early.itemElapsedMs, 200);
  assert.equal(sourceTime(early.media!, early.itemElapsedMs).clipTimeMs, 200);
  assert.equal(boundary.mediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.equal(boundary.itemElapsedMs, 0);
  assert.equal(sourceTime(boundary.media!, 0).clipTimeMs, 2_000);
});

test("backward and forward seeking remount the correct trimmed item", () => {
  const scene = buildPerMediaVideoTrimScene();
  const forward = resolveActiveSceneMediaRenderView(scene, 5_500, {
    mixedMediaScenesEnabled: true,
  });
  const backward = resolveActiveSceneMediaRenderView(scene, 1_500, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(forward.mediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.equal(sourceTime(forward.media!, forward.itemElapsedMs).clipTimeMs, 3_500);
  assert.equal(backward.mediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID);
  assert.equal(sourceTime(backward.media!, backward.itemElapsedMs).clipTimeMs, 1_500);
});

test("replay after scene completion holds the last trimmed frame of the last item", () => {
  const scene = buildPerMediaVideoTrimScene();
  const complete = resolveActiveSceneMediaRenderView(scene, 8_000, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(complete.mediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  const held = sourceTime(complete.media!, complete.itemElapsedMs);
  assert.equal(held.holdingLastFrame, true);
  assert.equal(held.clipTimeMs, 5_000);
  const replay = resolveActiveSceneMediaRenderView(scene, 0, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(replay.mediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID);
  assert.equal(sourceTime(replay.media!, 0).clipTimeMs, 0);
});

test("trim edit after playback updates the next resolve without a refresh", () => {
  const scene = buildPerMediaVideoTrimScene();
  const edited = applyVideoTrimToMediaItem(scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID, {
    trimStartMs: 3_000,
    trimEndMs: 5_000,
  })!.scene;
  const view = resolveActiveSceneMediaRenderView(edited, 4_000, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(sourceTime(view.media!, 0).clipTimeMs, 3_000);
  assert.equal(labelForSourceTimeMs(3_000), "SOURCE 3");
});

test("item window shorter than trimmed source renders only the needed start", () => {
  const scene = updateSceneMediaItemMedia(
    buildPerMediaVideoTrimScene(),
    PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    buildPerMediaVideoTrimSourceMedia({ trimStartMs: 1_000, trimEndMs: 5_000 }),
  ).scene;
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  const windowB = windows.find((entry) => entry.itemId === PER_MEDIA_VIDEO_TRIM_ITEM_B_ID)!;
  const view = resolveActiveSceneMediaRenderView(scene, windowB.startMs + 500, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(windowB.durationMs < 4_000 || windowB.durationMs === 4_000);
  assert.equal(sourceTime(view.media!, 500).clipTimeMs, 1_500);
});

test("item window equal to trimmed source plays the full range", () => {
  const media = buildPerMediaVideoTrimSourceMedia({ trimStartMs: 2_000, trimEndMs: 5_000 });
  assert.equal(sourceTime(media, 0).clipTimeMs, 2_000);
  assert.equal(sourceTime(media, 3_000).clipTimeMs, 5_000);
  assert.equal(sourceTime(media, 3_000).holdingLastFrame, true);
});

test("item window longer than trimmed source holds the last valid frame", () => {
  const scene = buildPerMediaVideoTrimScene();
  const view = resolveActiveSceneMediaRenderView(scene, 7_800, {
    mixedMediaScenesEnabled: true,
  });
  const result = sourceTime(view.media!, view.itemElapsedMs);
  assert.equal(result.holdingLastFrame, true);
  assert.equal(result.clipTimeMs, 5_000);
  const seek = resolveDisplayableVideoSourceTimeMs({
    clipTimeMs: result.clipTimeMs,
    trimStartMs: result.trimStartMs,
    trimEndMs: result.trimEndMs,
    holdingLastFrame: true,
  });
  assert.equal(seek, 5_000 - VIDEO_CLIP_END_EPSILON_MS);
  assert.ok(seek < result.trimEndMs);
  assert.ok(seek >= result.trimStartMs);
});

test("reorder by stable media ID keeps each item trim", () => {
  const scene = buildPerMediaVideoTrimScene();
  const moved = moveSceneMediaItemRight(scene, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID);
  assert.ok(moved);
  const items = projectSceneMediaTimeline(moved.scene).items;
  assert.equal(items[0]?.id, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.equal(items[0]?.media.trimStartMs, 2_000);
  assert.equal(items[1]?.id, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID);
  assert.equal(items[1]?.media.trimStartMs, 0);
});

test("delete and replace do not attach leftover trim to another item", () => {
  const scene = buildPerMediaVideoTrimScene();
  const override = buildVideoTrimPreviewOverride({
    sceneId: scene.id,
    mediaItemId: PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    trimStartMs: 2_000,
    trimEndMs: 5_000,
    activeHandle: "end",
  });
  const removed = removeSceneMediaItem(scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.ok(removed);
  assert.equal(
    shouldClearTrimPreviewOnMediaItemChange(override, scene.id, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID),
    true,
  );
  assert.equal(projectSceneMediaTimeline(removed.scene).items.length, 1);
  assert.equal(itemOf(removed.scene, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID).media.trimStartMs, 0);

  const replaced = updateSceneMediaItemMedia(
    scene,
    PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    buildPerMediaVideoTrimSourceMedia({
      url: "/api/dev/per-media-video-trim-fixture?replaced=1",
      trimStartMs: 0,
      trimEndMs: 6_000,
    }),
  ).scene;
  assert.equal(itemOf(replaced, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID).media.trimStartMs, 0);
  assert.equal(itemOf(replaced, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID).media.trimStartMs, 0);
});

test("save/reload persistence keeps per-item trims", () => {
  const story = buildPerMediaVideoTrimStory();
  const reloaded = JSON.parse(JSON.stringify(story)) as typeof story;
  const scene = reloaded.scenes[0]!;
  assert.equal(itemOf(scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID).media.trimStartMs, 2_000);
  assert.equal(itemOf(scene, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID).media.trimStartMs, 0);
});

test("legacy single-video scenes still trim scene.media", () => {
  const media = buildPerMediaVideoTrimSourceMedia({ trimStartMs: 1_000, trimEndMs: 4_000 });
  const scene = {
    id: "legacy-video",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4_000,
    durationMs: 4_000,
    subtitle: "",
    media,
  } as FootieScene;
  const patched = buildVideoTrimForMedia(media, { trimStartMs: 2_000, trimEndMs: 5_000 });
  assert.ok(patched);
  assert.equal(patched.media.trimStartMs, 2_000);
  const view = resolveActiveSceneMediaRenderView(
    { ...scene, media: patched.media },
    0,
    { mixedMediaScenesEnabled: false, multiImageScenesEnabled: false },
  );
  assert.equal(sourceTime(view.media ?? patched.media, 0).clipTimeMs, 2_000);
});

test("mixed image/video scenes keep the video item trim", () => {
  const scene = applyVideoTrimToMediaItem(
    updateSceneMediaItemMedia(
      buildPerMediaVideoTrimScene(),
      PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
      {
        type: "image",
        url: "/preview-runtime-parity/image-p.svg",
        source: "upload",
        width: 1080,
        height: 1920,
        fitMode: "cover",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
    ).scene,
    PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
    { trimStartMs: 2_000, trimEndMs: 5_000 },
  )!.scene;
  const view = resolveActiveSceneMediaRenderView(scene, 4_000, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(view.mediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.equal(view.media?.type, "video");
  assert.equal(sourceTime(view.media!, 0).clipTimeMs, 2_000);
});

test("outgoing and incoming intra-scene transitions keep per-item source time", () => {
  const scene = buildPerMediaVideoTrimScene({ withTransition: true });
  const composition = composeIntraSceneTransitionPreview(scene, 3_800, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(composition);
  assert.equal(composition.fromMediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID);
  assert.equal(composition.toMediaItemId, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  const outgoing = sourceTime(
    composition.fromView.media!,
    composition.fromView.itemElapsedMs,
  );
  const incoming = sourceTime(
    composition.toView.media!,
    composition.toView.itemElapsedMs,
  );
  assert.ok(outgoing.clipTimeMs >= (composition.fromView.media?.trimStartMs ?? 0));
  assert.ok(
    outgoing.clipTimeMs <= (composition.fromView.media?.trimEndMs ?? outgoing.clipTimeMs),
  );
  assert.equal(
    incoming.clipTimeMs,
    PER_MEDIA_VIDEO_TRIM_B.trimStartMs + composition.toView.itemElapsedMs,
  );
  assert.notEqual(incoming.clipTimeMs, 0);
});

test("Browser and Headless freeze/hydrate both trim boundaries per item", () => {
  const story = buildPerMediaVideoTrimStory();
  const manifest = buildExportManifest({
    story,
    mixedMediaScenesEnabled: true,
    exportSettings: {
      fileName: "per-media-trim",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
  const scene = manifest.scenes[0]!;
  const items = scene.mediaTimeline?.items ?? [];
  const frozenA = items.find((item) => item.id === PER_MEDIA_VIDEO_TRIM_ITEM_A_ID);
  const frozenB = items.find((item) => item.id === PER_MEDIA_VIDEO_TRIM_ITEM_B_ID);
  assert.ok(frozenA && frozenB);
  assert.equal(frozenA.media.type, "video");
  assert.equal(frozenB.media.type, "video");
  if (frozenA.media.type === "video") {
    assert.equal(frozenA.media.trimStartMs, 0);
    assert.equal(frozenA.media.trimEndMs, 3_000);
  }
  if (frozenB.media.type === "video") {
    assert.equal(frozenB.media.trimStartMs, 2_000);
    assert.equal(frozenB.media.trimEndMs, 5_000);
    const hydrated = hydrateExportDrawSceneMedia(frozenB.media, false);
    assert.equal(hydrated.trimStartMs, 2_000);
    assert.equal(hydrated.trimEndMs, 5_000);
  }

  for (const sample of PER_MEDIA_VIDEO_TRIM_SAMPLES) {
    if (sample.inspectMediaItemId) continue;
    const resolved = resolveExportVideoSourceTimeMs(scene, sample.sceneElapsedMs);
    assert.equal(resolved.mediaItemId, sample.expectedMediaItemId);
    if (sample.id === "item-b-hold") {
      assert.equal(resolved.holdLastFrame, true);
      assert.equal(resolved.sourceTimeMs, 5_000);
    } else {
      assert.equal(resolved.sourceTimeMs, sample.expectedSourceTimeMs);
    }
  }
});

test("mixed-media dual-write keeps the same per-item trim", () => {
  const scene = buildPerMediaVideoTrimScene();
  const projected = projectSceneMediaTimeline(scene);
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  const written = writeMixedMediaSequenceItems(
    scene,
    windows.map((window) => ({
      id: window.itemId,
      media: window.media,
      startOffsetMs: window.startMs,
      durationMs: window.durationMs,
    })),
    { mixedMediaScenesEnabled: true },
  );
  const b = written.scene.visualSequence?.items.find(
    (item) => item.id === PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
  );
  assert.ok(b);
  assert.equal(b.media.trimStartMs, 2_000);
  assert.equal(projected.items.length, 2);
});

test("capability-off mixed-media write fails closed and mediaTimeline trim remains", () => {
  const scene = buildPerMediaVideoTrimScene();
  assert.throws(() =>
    writeMixedMediaSequenceItems(
      scene,
      [
        {
          id: PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
          media: itemOf(scene, PER_MEDIA_VIDEO_TRIM_ITEM_A_ID).media,
          startOffsetMs: 0,
          durationMs: 4_000,
        },
      ],
      { mixedMediaScenesEnabled: false },
    ),
  );
  const applied = applyVideoTrimToMediaItem(scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID, {
    trimStartMs: 2_000,
    trimEndMs: 5_000,
  });
  assert.equal(itemOf(applied!.scene, PER_MEDIA_VIDEO_TRIM_ITEM_B_ID).media.trimStartMs, 2_000);
});

test("Prompt 1 caption transparency remains on the frozen story", () => {
  const story = buildPerMediaVideoTrimStory();
  const scene = story.scenes[0]!;
  const authority = resolveCaptionBackgroundAuthority({
    sceneStyle: scene.captionStyle,
    sceneLayout: scene.captionLayout,
  });
  assert.equal(authority.backgroundEnabled, false);
  assert.equal(authority.drawsFill, false);
  const captions = buildExportManifest({
    story,
    mixedMediaScenesEnabled: true,
  }).captions;
  assert.equal(captions[0]?.style.backgroundEnabled, false);
});

test("Preview, export, and seek layers share one clip formula", () => {
  const previewUtils = readSrc("src/features/preview/utils/preview-video-clip.utils.ts");
  const playbackUtils = readSrc("src/features/media-playback/media-playback.utils.ts");
  const exportTime = readSrc("src/features/export/timing/resolve-export-video-source-time.ts");
  const frameVideo = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  const exportRenderer = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
  assert.match(previewUtils, /trimStartMs \+ sceneElapsedMs/);
  assert.match(playbackUtils, /window\.trimStartMs \+ elapsed/);
  assert.match(exportTime, /resolveSceneMediaPlayback/);
  assert.match(frameVideo, /useActiveVideoTrimPreviewOverride\(sceneId, mediaItemId\)/);
  assert.match(frameVideo, /resolveDisplayableVideoSourceTimeMs/);
  assert.match(exportRenderer, /resolveExportVideoSeekTimeSec/);
  assert.doesNotMatch(exportRenderer, /VideoTrimPreviewOverride|scrubTimeMs/);
});

test("workspace and timeline persist trim by media item id", () => {
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  const commands = readSrc(
    "src/features/scene-media-timeline/editor/scene-media-timeline.commands.ts",
  );
  assert.match(workspace, /applyVideoTrimToMediaItem/);
  assert.match(workspace, /mediaItemId\?: string \| null/);
  assert.match(timeline, /onApplyVideoTrim\(sceneId, next, mediaItemId\)/);
  assert.match(commands, /export function applyVideoTrimToMediaItem/);
});

test("frozen samples never start the second item at source zero", () => {
  const scene = buildPerMediaVideoTrimScene();
  for (const sample of PER_MEDIA_VIDEO_TRIM_SAMPLES) {
    if (sample.expectedMediaItemId !== PER_MEDIA_VIDEO_TRIM_ITEM_B_ID) continue;
    if (sample.inspectMediaItemId) {
      const inspection = resolvePreviewSelectedMediaInspection({
        scene,
        selectedMediaItemId: sample.inspectMediaItemId,
        sceneElapsedMs: sample.sceneElapsedMs,
        mixedMediaScenesEnabled: true,
      });
      assert.equal(sourceTime(inspection.view!.media!, 0).clipTimeMs, 2_000);
      continue;
    }
    const view = resolveActiveSceneMediaRenderView(scene, sample.sceneElapsedMs, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(view.mediaItemId, sample.expectedMediaItemId);
    const clip = sourceTime(view.media!, view.itemElapsedMs);
    assert.equal(clip.clipTimeMs, sample.expectedSourceTimeMs);
    assert.notEqual(clip.clipTimeMs, 0);
  }
});

console.log(`\nper-media-video-trim-parity: ${passed} passed`);
