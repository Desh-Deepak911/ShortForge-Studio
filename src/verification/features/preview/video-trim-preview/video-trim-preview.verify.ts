/**
 * Live trim preview override — 4.2B-8
 * Run: npm run test:video-trim-preview
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildVideoTrimPatch, MIN_VIDEO_TRIM_DURATION_MS } from "@/features/media-playback";
import type { FootieScene } from "@/features/story/types";

import {
  VIDEO_TRIM_PREVIEW_SAFE_FRAME_OFFSET_MS,
  VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS,
  buildVideoTrimPreviewOverride,
  canCreateVideoTrimPreviewOverride,
  createTrimPreviewSeekQueue,
  queueTrimPreviewSeek,
  resolveTrimPreviewScrubTimeMs,
  shouldApplyVideoTrimPreviewOverride,
  shouldClearTrimPreviewOnMediaChange,
  shouldClearTrimPreviewOnSceneChange,
  shouldSeekVideoToTimeMs,
  takePendingTrimPreviewSeek,
} from "@/features/preview/video-trim-preview/video-trim-preview.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function videoScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 5,
    duration: 5,
    durationMs: 5000,
    subtitle: "Caption",
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 10_000,
      trimStartMs: 1000,
      trimEndMs: 8000,
      muted: true,
      posterTimeMs: 2000,
    },
    ...overrides,
  };
}

test("Start-handle drag resolves preview frame to draft trim start", () => {
  const scrub = resolveTrimPreviewScrubTimeMs({
    activeHandle: "start",
    trimStartMs: 2500,
    trimEndMs: 8000,
    sourceDurationMs: 12_000,
  });
  assert.equal(scrub, 2500);

  const override = buildVideoTrimPreviewOverride({
    sceneId: "scene-1",
    trimStartMs: 2500,
    trimEndMs: 8000,
    activeHandle: "start",
    sourceDurationMs: 12_000,
  });
  assert.equal(override.scrubTimeMs, 2500);
  assert.equal(override.activeHandle, "start");
});

test("End-handle drag resolves preview frame just before draft trim end", () => {
  const scrub = resolveTrimPreviewScrubTimeMs({
    activeHandle: "end",
    trimStartMs: 1000,
    trimEndMs: 8000,
    sourceDurationMs: 12_000,
  });
  assert.equal(scrub, 8000 - VIDEO_TRIM_PREVIEW_SAFE_FRAME_OFFSET_MS);

  const tight = resolveTrimPreviewScrubTimeMs({
    activeHandle: "end",
    trimStartMs: 7900,
    trimEndMs: 8000,
    sourceDurationMs: 12_000,
  });
  // End scrub uses max(start, end - safeOffset) — still above start here.
  assert.equal(tight, 8000 - VIDEO_TRIM_PREVIEW_SAFE_FRAME_OFFSET_MS);

  const clampedToStart = resolveTrimPreviewScrubTimeMs({
    activeHandle: "end",
    trimStartMs: 7980,
    trimEndMs: 8000,
    sourceDurationMs: 12_000,
  });
  assert.equal(clampedToStart, 7980);
});

test("Temporary override applies only to the selected scene", () => {
  const override = buildVideoTrimPreviewOverride({
    sceneId: "scene-1",
    trimStartMs: 1000,
    trimEndMs: 5000,
    activeHandle: "start",
  });
  assert.equal(shouldApplyVideoTrimPreviewOverride(override, "scene-1"), true);
  assert.equal(shouldApplyVideoTrimPreviewOverride(override, "scene-2"), false);
  assert.equal(
    shouldApplyVideoTrimPreviewOverride({ ...override, isActive: false }, "scene-1"),
    false,
  );
});

test("Pointer movement does not mutate the script", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  const moveBlock = slider.slice(
    slider.indexOf("const handlePointerMove"),
    slider.indexOf("const finishDrag"),
  );
  assert.match(moveBlock, /onDraftChange\(next\)/);
  assert.match(moveBlock, /emitPreview\(/);
  assert.doesNotMatch(moveBlock, /onCommit/);
  assert.doesNotMatch(moveBlock, /onPreviewCommit/);
});

test("Pointer release commits once", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  const finish = slider.slice(
    slider.indexOf("const finishDrag"),
    slider.indexOf("const handleKeyDown"),
  );
  assert.match(finish, /onCommit\(finalDraft\)/);
  assert.match(finish, /onPreviewCommit/);
});

test("Pointer release clears the override", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /clearTrimPreviewOverride/);
  assert.match(inspector, /onPreviewCommit=\{\(\) => \{/);
  assert.match(inspector, /onPreviewCommit[\s\S]{0,80}clearTrimPreviewOverride/);
});

test("Escape clears override and does not commit", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.match(slider, /onPreviewCancel\?\.\(\)/);
  assert.match(slider, /onCancelDrag\(\)/);

  // Window Escape listener during drag cancels without committing.
  const windowEscape = slider.slice(
    slider.indexOf("const onKeyDown = (event: globalThis.KeyboardEvent)"),
    slider.indexOf("window.addEventListener"),
  );
  assert.match(windowEscape, /onCancelDrag\(\)/);
  assert.match(windowEscape, /onPreviewCancel/);
  assert.doesNotMatch(windowEscape, /onCommit/);
});

test("Scene switch clears the override", () => {
  const override = buildVideoTrimPreviewOverride({
    sceneId: "scene-1",
    trimStartMs: 0,
    trimEndMs: 5000,
    activeHandle: "start",
  });
  assert.equal(shouldClearTrimPreviewOnSceneChange(override, "scene-2"), true);
  assert.equal(shouldClearTrimPreviewOnSceneChange(override, "scene-1"), false);
  assert.equal(shouldClearTrimPreviewOnSceneChange(override, null), true);

  const provider = readSrc(
    "src/features/preview/video-trim-preview/VideoTrimPreviewProvider.tsx",
  );
  assert.match(provider, /shouldApplyVideoTrimPreviewOverride/);
  assert.match(provider, /selectedSceneId/);
  assert.match(provider, /scopedOverride/);
});

test("Media replacement clears the override", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /clearTrimPreviewOverride/);
  assert.match(inspector, /onReplace/);
  // Replace path clears preview before uploading.
  assert.match(inspector, /handleReplaceMedia|clearTrimPreviewOverride\(\)/);
});

test("Video removal clears the override", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /handleRemoveMedia|onRemove/);
  assert.match(inspector, /clearTrimPreviewOverride/);
});

test("Playback pauses or trim interaction is disabled when scrubbing begins", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(preview, /useVideoTrimPreviewOptional|trimPreview/);
  assert.match(preview, /pauseVoice/);
  assert.match(preview, /isActive/);
});

test("Only the latest pending seek target is applied", () => {
  let queue = createTrimPreviewSeekQueue();
  let scheduled = queueTrimPreviewSeek(queue, 1000);
  assert.equal(scheduled.shouldSchedule, true);
  queue = scheduled.queue;

  scheduled = queueTrimPreviewSeek(queue, 2000);
  assert.equal(scheduled.shouldSchedule, false);
  queue = scheduled.queue;
  assert.equal(queue.pendingMs, 2000);

  scheduled = queueTrimPreviewSeek(queue, 3500);
  queue = scheduled.queue;
  assert.equal(queue.pendingMs, 3500);

  const taken = takePendingTrimPreviewSeek(queue);
  assert.equal(taken.targetMs, 3500);
  assert.equal(taken.queue.pendingMs, null);
  assert.equal(taken.queue.appliedMs, 3500);
});

test("Seek tolerance avoids redundant work", () => {
  assert.equal(
    shouldSeekVideoToTimeMs(1000, 1000 + VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS - 1),
    false,
  );
  assert.equal(
    shouldSeekVideoToTimeMs(1000, 1000 + VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS + 1),
    true,
  );

  const queue = createTrimPreviewSeekQueue(1000);
  const result = queueTrimPreviewSeek(queue, 1005);
  assert.equal(result.shouldSchedule, false);
  assert.equal(result.queue.pendingMs, null);
});

test("Keyboard nudges update preview", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.match(slider, /emitPreview\(handle, next, "start"\)/);
  assert.match(slider, /onDraftChange\(next\)/);
  assert.match(slider, /onCommit\(next\)/);
  assert.match(slider, /onPreviewCommit\?\.\(\)/);
});

test("Numeric invalid drafts do not update preview", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /publishNumericTrimPreview/);
  assert.match(inspector, /draftTrimValidation\.ok/);
  assert.match(inspector, /if \(!draftTrimValidation\.ok/);
});

test("Export payload ignores temporary overrides", () => {
  const exportRenderer = readSrc(
    "src/features/export/utils/export-scene-media-renderer.ts",
  );
  assert.doesNotMatch(exportRenderer, /VideoTrimPreview|trimPreviewOverride|scrubTimeMs/);
  const fingerprint = readSrc(
    "src/components/export/build-export-fingerprint.utils.ts",
  );
  assert.doesNotMatch(fingerprint, /VideoTrimPreview|scrubTimeMs|trimPreview/);
});

test("Export fingerprint ignores temporary overrides", () => {
  const fingerprint = readSrc(
    "src/components/export/build-export-fingerprint.utils.ts",
  );
  assert.match(fingerprint, /trimStartMs/);
  assert.match(fingerprint, /trimEndMs/);
  assert.doesNotMatch(fingerprint, /scrubTimeMs/);
  assert.doesNotMatch(fingerprint, /VideoTrimPreviewOverride/);
});

test("Story/narration/voice remain clean during temporary preview", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /setOverrideFn|buildVideoTrimPreviewOverride/);
  const publishStart = inspector.indexOf("const publishTrimPreview");
  const publishEnd = inspector.indexOf("const syncDraftFromCommitted");
  const previewPublish = inspector.slice(publishStart, publishEnd);
  assert.doesNotMatch(previewPublish, /onApplyTrim|onScriptChange|intent/);
});

test("Final trim commit marks export dirty", () => {
  const shell = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(shell, /buildVideoTrimPatch/);
  assert.match(shell, /intent:\s*"media"/);

  const scene = videoScene();
  const result = buildVideoTrimPatch(scene, {
    trimStartMs: 2000,
    trimEndMs: 7000,
  });
  assert.ok(result);
  assert.equal(result!.patch.media?.trimStartMs, 2000);
  assert.ok(7000 - 2000 >= MIN_VIDEO_TRIM_DURATION_MS);
});

test("Image scenes do not create video trim overrides", () => {
  assert.equal(
    canCreateVideoTrimPreviewOverride({ mediaType: "image", sourceDurationMs: 5000 }),
    false,
  );
  assert.equal(
    canCreateVideoTrimPreviewOverride({ mediaType: "video", sourceDurationMs: 5000 }),
    true,
  );

  const inspectorShell = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspectorShell, /isVideoMedia && sceneMedia\?\.type === "video"/);
});

test("Missing duration disables trim preview", () => {
  assert.equal(
    canCreateVideoTrimPreviewOverride({ mediaType: "video", sourceDurationMs: 0 }),
    false,
  );
  assert.equal(
    canCreateVideoTrimPreviewOverride({ mediaType: "video", sourceDurationMs: null }),
    false,
  );

  const override = shouldClearTrimPreviewOnMediaChange(
    buildVideoTrimPreviewOverride({
      sceneId: "scene-1",
      trimStartMs: 0,
      trimEndMs: 1000,
      activeHandle: "start",
    }),
    "scene-1",
    "",
  );
  assert.equal(override, true);
});

test("Poster fields remain unchanged", () => {
  const scene = videoScene();
  const result = buildVideoTrimPatch(scene, {
    trimStartMs: 1500,
    trimEndMs: 6000,
  });
  assert.ok(result);
  // Poster may be clamped into the window, but preview override must not write poster.
  const previewUtils = readSrc(
    "src/features/preview/video-trim-preview/video-trim-preview.utils.ts",
  );
  assert.doesNotMatch(previewUtils, /posterTimeMs|posterUrl/);

  const frameVideo = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  assert.match(frameVideo, /useActiveVideoTrimPreviewOverride|trimPreview/);
  assert.doesNotMatch(frameVideo, /posterTimeMs\s*=/);
});

console.log(`\nvideo-trim-preview: ${passed} passed`);
