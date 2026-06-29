/**
 * Image Motion QA (run: npm run test:scene-image-motion-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildFootieExportPayload } from "@/features/export/services";
import { applySceneImageSettings } from "@/lib/utils/voiceover";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  createSceneImageFromUrl,
  getSceneImage,
  getSceneImageTransformStyle,
  normalizeSceneImageMotion,
  patchSceneImageTransform,
  resolveSceneImageMotionProgress,
  resolveSceneImageMotionScale,
  sceneHasImage,
  updateSceneImageSettings,
} from "@/features/story/utils";

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeScene(id: string, withImage: boolean): FootieScene {
  return {
    id,
    start: 0,
    end: 4,
    duration: 4,
    durationMs: 4000,
    startMs: 0,
    endMs: 4000,
    subtitle: `Caption ${id}`,
    ...(withImage
      ? {
          image: {
            ...createSceneImageFromUrl(`blob:${id}`),
            scale: 1.2,
            x: 12,
            y: -8,
            fitMode: "fill" as const,
          },
        }
      : {}),
  };
}

function threeSceneScript(): FootieScript {
  return {
    title: "Image Motion QA",
    narration: "Motion QA narration.",
    totalDuration: 12,
    scenes: [makeScene("a", true), makeScene("b", true), makeScene("c", false)],
  };
}

console.log("scene-image-motion-qa");

test("image motion controls appear for every scene with image (not selection-gated)", () => {
  const inspector = readSrc("src/features/editor/components/SceneImageInspector.tsx");
  const sceneInspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");

  assert.match(sceneInspector, /sceneImage \?/);
  assert.match(sceneInspector, /SceneImageMotionControl/);
  assert.match(inspector, /SceneImageMotionControl/);
  assert.match(inspector, /onMotionChange/);
  assert.match(inspector, /Image Inspector/);
  assert.match(inspector, /Fit full image/);
  assert.match(inspector, /Reset frame/);

  const script = threeSceneScript();
  assert.equal(sceneHasImage(script.scenes[0]!), true);
  assert.equal(sceneHasImage(script.scenes[1]!), true);
  assert.equal(sceneHasImage(script.scenes[2]!), false);
});

test("zoom-in works in preview — scale increases over scene progress", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const sceneFrameImage = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const motion = { type: "zoom-in" as const, intensity: "medium" as const };

  assert.match(previewFrame, /timelineImageMotion/);
  assert.match(sceneFrameImage, /resolveSceneImageMotionTransformState/);

  const start = resolveSceneImageMotionScale(motion, 0);
  const mid = resolveSceneImageMotionScale(motion, 0.5);
  const end = resolveSceneImageMotionScale(motion, 1);
  assert.equal(start, 1);
  assert.equal(end, 1.1);
  assert.ok(mid > start && mid < end);

  const image = createSceneImageFromUrl("blob:preview-zoom-in");
  const atStart = getSceneImageTransformStyle(image, 540, 960, start);
  const atEnd = getSceneImageTransformStyle(image, 540, 960, end);
  assert.match(atStart.transform, /scale\(1\)/);
  assert.match(atEnd.transform, /scale\(1\.1\)/);
});

test("zoom-out works in preview — scale decreases over scene progress", () => {
  const motion = { type: "zoom-out" as const, intensity: "strong" as const };
  const start = resolveSceneImageMotionScale(motion, 0);
  const end = resolveSceneImageMotionScale(motion, 1);

  assert.equal(start, 1.16);
  assert.equal(end, 1);

  const image = { ...createSceneImageFromUrl("blob:preview-zoom-out"), scale: 2 };
  const atStart = getSceneImageTransformStyle(image, 540, 960, start);
  const atEnd = getSceneImageTransformStyle(image, 540, 960, end);
  assert.match(atStart.transform, /scale\(2\.32\)/);
  assert.match(atEnd.transform, /scale\(2\)/);
});

test("zoom-in works in export — motion scale applied in background draw path", () => {
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const sceneUtils = readSrc("src/features/story/utils/scene.utils.ts");

  assert.match(videoRender, /resolveSceneImageMotionTransformState/);
  assert.match(videoRender, /drawSceneImageInFrame\([\s\S]*motionState/);
  assert.match(sceneUtils, /drawTransformOverride\?\.scale \?\? resolved\.scale \* motionScale/);

  const motion = { type: "zoom-in" as const, intensity: "subtle" as const };
  assert.equal(resolveSceneImageMotionScale(motion, 0), 1);
  assert.equal(resolveSceneImageMotionScale(motion, 1), 1.05);
  assert.equal(resolveSceneImageMotionProgress(4000, 4000), 1);
});

test("zoom-out works in export — peak scale at scene start, 1.0 at scene end", () => {
  const motion = { type: "zoom-out" as const, intensity: "medium" as const };
  assert.equal(resolveSceneImageMotionScale(motion, 0), 1.1);
  assert.equal(resolveSceneImageMotionScale(motion, 1), 1);
});

test("text and subtitles stay stable — motion only on background image layer", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  const sceneFrameImage = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");

  assert.match(sceneFrameImage, /timelineImageMotion/);
  assert.match(previewFrame, /SceneFrameImage[\s\S]*timelineImageMotion/);
  assert.doesNotMatch(previewFrame, /CaptionOverlay/);
  assert.doesNotMatch(previewFrame, /SubtitleOverlay/);
  assert.match(videoPreview, /hideCaptionsDuringTransition/);
  assert.match(videoPreview, /showSubtitles = .*!hideCaptionsDuringTransition/);

  assert.match(videoRender, /function drawSceneBackground/);
  assert.match(videoRender, /wrapText\(ctx, script\.title/);

  const drawSceneFrame = videoRender.slice(
    videoRender.indexOf("function drawSceneFrame"),
    videoRender.indexOf("function mapRenderingProgress"),
  );
  assert.match(drawSceneFrame, /drawSceneBackground/);
  assert.match(drawSceneFrame, /drawExportSubtitlesCaption/);
  const backgroundDrawIdx = drawSceneFrame.indexOf("drawSceneBackground(");
  const subtitleDrawIdx = drawSceneFrame.indexOf("drawExportSubtitlesCaption(");
  assert.ok(backgroundDrawIdx > -1 && subtitleDrawIdx > backgroundDrawIdx);
});

test("fit/fill/position/zoom controls still work alongside motion", () => {
  const script = threeSceneScript();
  const withMotion = applySceneImageSettings(script, "b", {
    imageMotion: { type: "zoom-in", intensity: "strong" },
  });

  const afterTransform = updateSceneImageSettings(withMotion.scenes, "b", {
    scale: 2.4,
    fitMode: "fit",
    x: 40,
    y: -20,
  });
  const sceneB = getSceneImage(afterTransform.find((s) => s.id === "b"));

  assert.equal(sceneB?.scale, 2.4);
  assert.equal(sceneB?.fitMode, "fit");
  assert.equal(sceneB?.x, 40);
  assert.equal(sceneB?.y, -20);
  assert.deepEqual(normalizeSceneImageMotion(sceneB?.imageMotion), {
    type: "zoom-in",
    intensity: "strong",
  });

  const patched = patchSceneImageTransform(
    { image: sceneB },
    { scale: 1.8, fitMode: "fill" },
  );
  assert.equal(patched?.fitMode, "fill");
  assert.equal(patched?.scale, 1.8);
  assert.deepEqual(normalizeSceneImageMotion(patched?.imageMotion), {
    type: "zoom-in",
    intensity: "strong",
  });
});

test("motion updates only the targeted scene", () => {
  const script = threeSceneScript();
  const updated = applySceneImageSettings(script, "b", {
    imageMotion: { type: "zoom-out", intensity: "medium" },
  });

  assert.deepEqual(normalizeSceneImageMotion(getSceneImage(updated.scenes[0])?.imageMotion), {
    type: "none",
    intensity: "subtle",
  });
  assert.deepEqual(normalizeSceneImageMotion(getSceneImage(updated.scenes[1])?.imageMotion), {
    type: "zoom-out",
    intensity: "medium",
  });
  assert.equal(getSceneImage(updated.scenes[2]), undefined);

  assert.equal(getSceneImage(updated.scenes[0])?.scale, 1.2);
  assert.equal(getSceneImage(updated.scenes[0])?.x, 12);
  assert.equal(updated.scenes[0]?.subtitle, "Caption a");
  assert.equal(updated.scenes[1]?.subtitle, "Caption b");

  const payload = buildFootieExportPayload(updated);
  assert.deepEqual(
    normalizeSceneImageMotion(getSceneImage(payload.scenes[1])?.imageMotion),
    { type: "zoom-out", intensity: "medium" },
  );
  assert.equal(getSceneImage(payload.scenes[0])?.fitMode, "fill");
});

console.log("\nAll image motion QA checks passed.");
