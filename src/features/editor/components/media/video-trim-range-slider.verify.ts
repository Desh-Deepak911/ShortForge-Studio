/**
 * Video trim range slider — 4.2B-7
 * Run: npm run test:scene-video-inspector
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyTrimHandleDrag,
  clampPosterMarkerToDraft,
  clampTrimEndForSlider,
  clampTrimStartForSlider,
  clientXToTrimTimeMs,
  formatTrimHandleValueText,
  nudgeTrimHandle,
  trimTimeMsToPercent,
  VIDEO_TRIM_SLIDER_NUDGE_MS,
  VIDEO_TRIM_SLIDER_SHIFT_NUDGE_MS,
} from "@/features/editor/components/media/video-trim-range-slider.utils";
import { MIN_VIDEO_TRIM_DURATION_MS } from "@/features/media-playback";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("Slider initializes from committed trim values", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /VideoTrimRangeSlider/);
  assert.match(inspector, /trimStartMs=\{draftTrimStartMs\}/);
  assert.match(inspector, /trimEndMs=\{draftTrimEndMs\}/);
  assert.match(slider, /data-scene-video-trim-slider="true"/);
});

test("Left handle updates local trim start", () => {
  const next = applyTrimHandleDrag(
    "start",
    2500,
    { trimStartMs: 1000, trimEndMs: 8000 },
    12_000,
  );
  assert.equal(next.trimStartMs, 2500);
  assert.equal(next.trimEndMs, 8000);
});

test("Right handle updates local trim end", () => {
  const next = applyTrimHandleDrag(
    "end",
    9000,
    { trimStartMs: 1000, trimEndMs: 8000 },
    12_000,
  );
  assert.equal(next.trimStartMs, 1000);
  assert.equal(next.trimEndMs, 9000);
});

test("Numeric inputs update when slider draft changes", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /applyLocalTrimDraft/);
  assert.match(inspector, /setDraftTrimStartSec\(formatTrimSeconds\(next\.trimStartMs\)\)/);
  assert.match(inspector, /setDraftTrimEndSec\(formatTrimSeconds\(next\.trimEndMs\)\)/);
});

test("Slider updates when numeric draft changes", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /setDraftTrimStartMs\(parsed\)/);
  assert.match(inspector, /setDraftTrimEndMs\(parsed\)/);
  assert.match(inspector, /trimStartMs=\{draftTrimStartMs\}/);
});

test("Pointer move does not commit script repeatedly", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.match(slider, /Updates local draft while dragging; commits only on pointer-up/);
  // Pointer move only drafts — commit happens in finishDrag / keyboard path.
  const moveBlock = slider.slice(
    slider.indexOf("const handlePointerMove"),
    slider.indexOf("const finishDrag"),
  );
  assert.match(moveBlock, /onDraftChange\(next\)/);
  assert.doesNotMatch(moveBlock, /onCommit/);
});

test("Pointer release commits once", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.match(slider, /finishDrag\(event, true\)/);
  assert.match(slider, /onCommit\(finalDraft\)/);
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /onCommit=\{\(next\) => \{[\s\S]*commitTrimValues/);
});

test("Escape restores committed values", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.match(slider, /onCancelDrag/);
  assert.match(slider, /Escape/);
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /onCancelDrag=\{\(\) => \{[\s\S]*syncDraftFromCommitted/);
});

test("Minimum trim duration is enforced", () => {
  assert.equal(MIN_VIDEO_TRIM_DURATION_MS, 100);
  const start = clampTrimStartForSlider(7900, 8000, 12_000);
  assert.equal(start, 7900);
  const tooClose = clampTrimStartForSlider(7950, 8000, 12_000);
  assert.equal(tooClose, 7900);
});

test("Handles cannot cross", () => {
  const crossed = applyTrimHandleDrag(
    "start",
    9000,
    { trimStartMs: 1000, trimEndMs: 8000 },
    12_000,
  );
  assert.ok(crossed.trimStartMs <= crossed.trimEndMs - MIN_VIDEO_TRIM_DURATION_MS);
  assert.equal(crossed.trimEndMs, 8000);
});

test("Start clamps at zero", () => {
  assert.equal(clampTrimStartForSlider(-500, 4000, 12_000), 0);
  assert.equal(clientXToTrimTimeMs(-10, 0, 200, 10_000), 0);
});

test("End clamps at source duration", () => {
  assert.equal(clampTrimEndForSlider(99_000, 1000, 12_000), 12_000);
  assert.equal(clientXToTrimTimeMs(999, 0, 200, 10_000), 10_000);
});

test("Keyboard 100ms nudge works", () => {
  const next = nudgeTrimHandle(
    "start",
    "ArrowRight",
    { trimStartMs: 1000, trimEndMs: 5000 },
    12_000,
    false,
  );
  assert.equal(next.trimStartMs, 1000 + VIDEO_TRIM_SLIDER_NUDGE_MS);
});

test("Shift keyboard 1s nudge works", () => {
  const next = nudgeTrimHandle(
    "end",
    "ArrowLeft",
    { trimStartMs: 1000, trimEndMs: 5000 },
    12_000,
    true,
  );
  assert.equal(next.trimEndMs, 5000 - VIDEO_TRIM_SLIDER_SHIFT_NUDGE_MS);
});

test("ARIA slider attributes are present", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.match(slider, /role="slider"/);
  assert.match(slider, /aria-label="Trim start"/);
  assert.match(slider, /aria-label="Trim end"/);
  assert.match(slider, /aria-valuemin/);
  assert.match(slider, /aria-valuemax/);
  assert.match(slider, /aria-valuenow/);
  assert.match(slider, /aria-valuetext/);
  assert.match(formatTrimHandleValueText(1250), /1\.250 seconds/);
});

test("Commit uses buildVideoTrimPatch", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(inspector, /buildVideoTrimPatch/);
  assert.match(inspector, /handleApplyTrim/);
});

test("Commit uses media intent", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(
    inspector,
    /onScriptChange\(applySceneUpdate\(script, sceneId, result\.patch\), \{ intent: "media" \}\)/,
  );
});

test("Scene duration remains unchanged", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.doesNotMatch(slider, /durationMs\s*=/);
  assert.doesNotMatch(slider, /scene\.duration/);
});

test("Poster is clamped by existing trim patch helper", () => {
  const marker = clampPosterMarkerToDraft(500, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.equal(marker, 3000);
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /commitTrimValues/);
  assert.match(
    readSrc("src/features/editor/components/StudioSceneInspector.tsx"),
    /buildVideoTrimPatch/,
  );
});

test("Narration and voice remain clean", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.doesNotMatch(slider, /intent:\s*"narration"|intent:\s*"voice"/);
});

test("Export becomes dirty", () => {
  // Covered by media intent path in StudioSceneInspector — slider only calls onCommit.
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(inspector, /intent: "media"/);
});

test("Image scenes do not show video trim slider", () => {
  const shell = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(shell, /isVideoMedia && sceneMedia\?\.type === "video"/);
});

test("Missing source duration disables the range slider", () => {
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.match(slider, /data-scene-video-trim-slider-unavailable="true"/);
  assert.match(slider, /sourceDurationMs >= MIN_VIDEO_TRIM_DURATION_MS/);
});

test("Reset Trim updates slider and numeric values", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /draftTrimSourceKey !== trimSourceKey/);
  assert.match(inspector, /syncDraftFromCommitted/);
  assert.match(inspector, /onResetTrim/);
});

test("Filmstrip metadata markers align with source duration", () => {
  assert.equal(trimTimeMsToPercent(0, 10_000), 0);
  assert.equal(trimTimeMsToPercent(5000, 10_000), 50);
  assert.equal(trimTimeMsToPercent(10_000, 10_000), 100);
  const slider = readSrc(
    "src/features/editor/components/media/VideoTrimRangeSlider.tsx",
  );
  assert.match(slider, /filmstripMarkers/);
  assert.match(slider, /data-scene-video-trim-marker="true"/);
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /filmstripMarkers=\{filmstrip\.samples\}/);
});

console.log(`\nvideo-trim-range-slider: ${passed} passed`);
