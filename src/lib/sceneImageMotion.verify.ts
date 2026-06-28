/**
 * Scene image motion verification (run: npm run test:scene-image-motion).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getSceneImageTransformStyle,
  resolveSceneImageMotionProgress,
  resolveSceneImageMotionScale,
} from "@/features/story/utils";

const root = process.cwd();

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("scene-image-motion");

test("resolveSceneImageMotionProgress maps scene-local elapsed time", () => {
  assert.equal(resolveSceneImageMotionProgress(0, 4000), 0);
  assert.equal(resolveSceneImageMotionProgress(2000, 4000), 0.5);
  assert.equal(resolveSceneImageMotionProgress(4000, 4000), 1);
});

test("zoom-in scales from 1.00 toward intensity peak", () => {
  assert.equal(
    resolveSceneImageMotionScale({ type: "zoom-in", intensity: "subtle" }, 0),
    1,
  );
  assert.equal(
    resolveSceneImageMotionScale({ type: "zoom-in", intensity: "subtle" }, 1),
    1.05,
  );
  assert.equal(
    resolveSceneImageMotionScale({ type: "zoom-in", intensity: "medium" }, 0.5),
    1.05,
  );
  assert.equal(
    resolveSceneImageMotionScale({ type: "zoom-in", intensity: "strong" }, 1),
    1.16,
  );
});

test("zoom-out scales from intensity peak toward 1.00", () => {
  assert.equal(
    resolveSceneImageMotionScale({ type: "zoom-out", intensity: "subtle" }, 0),
    1.05,
  );
  assert.equal(
    resolveSceneImageMotionScale({ type: "zoom-out", intensity: "subtle" }, 1),
    1,
  );
  assert.equal(
    resolveSceneImageMotionScale({ type: "zoom-out", intensity: "medium" }, 0),
    1.1,
  );
  assert.equal(
    resolveSceneImageMotionScale({ type: "zoom-out", intensity: "strong" }, 1),
    1,
  );
});

test("none motion leaves scale at 1", () => {
  assert.equal(
    resolveSceneImageMotionScale({ type: "none", intensity: "strong" }, 0.5),
    1,
  );
});

test("motion scale multiplies manual zoom in transform css", () => {
  const image = {
    url: "blob:test",
    scale: 2,
    x: 10,
    y: -5,
    rotation: 0,
    fitMode: "fit" as const,
  };
  const withoutMotion = getSceneImageTransformStyle(image, 540, 960, 1);
  const withMotion = getSceneImageTransformStyle(image, 540, 960, 1.1);

  assert.match(withoutMotion.transform, /scale\(2\)/);
  assert.match(withMotion.transform, /scale\(2\.2\)/);
  assert.doesNotMatch(withoutMotion.transform, /scale\(2\.2\)/);
});

test("export renderer applies motion to background image only", () => {
  const videoRender = readFileSync(
    join(root, "src/features/export/services/video-render.service.ts"),
    "utf8",
  );

  assert.match(videoRender, /resolveSceneImageMotionTransformState/);
  assert.match(videoRender, /getImageMotionEventForScene/);
  assert.match(videoRender, /function drawSceneBackground/);
  assert.doesNotMatch(videoRender, /drawExportSubtitlesCaption[\s\S]{0,120}resolveSceneImageMotionScale/);
  assert.doesNotMatch(videoRender, /drawExportGeneratedCaption[\s\S]{0,120}resolveSceneImageMotionScale/);
});

test("preview applies motion to backdrop image only", () => {
  const previewFrame = readFileSync(
    join(root, "src/features/preview/components/PreviewFrame.tsx"),
    "utf8",
  );
  const videoPreview = readFileSync(
    join(root, "src/features/preview/components/VideoPreview.tsx"),
    "utf8",
  );
  const sceneFrameImage = readFileSync(
    join(root, "src/features/editor/components/SceneFrameImage.tsx"),
    "utf8",
  );

  assert.match(previewFrame, /timelineImageMotion/);
  assert.match(sceneFrameImage, /resolveSceneImageMotionTransformState/);
  assert.match(videoPreview, /sceneTimelineImageMotion/);
  assert.doesNotMatch(previewFrame, /CaptionOverlay/);
});

console.log("\nAll scene image motion checks passed.");
