/**
 * Image adjustment QA (run: npm run test:scene-image-qa).
 * Covers per-scene controls, defaults, duplication, preview sync wiring, and export.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildFootieExportPayload } from "@/features/export/services";
import {
  applyResetSceneImageSettings,
  applySceneImageSettings,
} from "@/lib/utils/voiceover";
import {
  createSceneImageFromUrl,
  duplicateScene,
  ensureTimelineItems,
  getSceneImage,
  getSceneImageObjectFit,
  getSceneImageUrl,
  getTransitionsFromTimeline,
  normalizeSceneImage,
  normalizeSceneImageMotion,
  normalizeSceneImageSettings,
  SCENE_IMAGE_MOTION_INTENSITY_OPTIONS,
  SCENE_IMAGE_MOTION_TYPE_OPTIONS,
  sceneHasImage,
  TRANSITION_CARD_TITLE,
  updateSceneImageSettings,
} from "@/features/story/utils";
import type { FootieScene, FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();
const studioSceneInspector = readFileSync(
  join(root, "src/features/editor/components/StudioSceneInspector.tsx"),
  "utf8",
);
const sceneImageInspector = readFileSync(
  join(root, "src/features/editor/components/SceneImageInspector.tsx"),
  "utf8",
);
const sceneImageUpload = readFileSync(
  join(root, "src/features/editor/hooks/useSceneImageUpload.ts"),
  "utf8",
);
const mediaPicker = readFileSync(
  join(root, "src/features/editor/components/MediaPicker.tsx"),
  "utf8",
);

function scene(id: string, image?: FootieScene["image"], uploadedImage?: string): FootieScene {
  return {
    id,
    start: 0,
    end: 3,
    duration: 3,
    subtitle: `Caption ${id}`,
    image,
    uploadedImage,
  };
}

function threeSceneScript(): FootieScript {
  return {
    title: "QA",
    narration: "Test narration",
    totalDuration: 9,
    scenes: [
      scene("scene-1", createSceneImageFromUrl("blob:scene-1")),
      scene("scene-2", createSceneImageFromUrl("blob:scene-2")),
      scene("scene-3"),
    ],
  };
}

console.log("sceneImageAdjustmentQa");

test("1. scene image settings dock includes zoom, fit, and image motion controls", () => {
  assert.match(studioSceneInspector, /handleImageTransformChange/);
  assert.match(studioSceneInspector, /handleImageReset/);
  assert.match(studioSceneInspector, /sceneImage \?/);
  assert.match(studioSceneInspector, /SceneImageInspector/);
  assert.match(sceneImageInspector, /onMotionChange/);
});

test("2. scene 2+ image controls appear when scene has image (not selection-gated)", () => {
  const scenes = threeSceneScript().scenes;
  assert.equal(sceneHasImage(scenes[0]!), true);
  assert.equal(sceneHasImage(scenes[1]!), true);
  assert.equal(sceneHasImage(scenes[2]!), false);
  assert.match(studioSceneInspector, /sceneImage \?/);
});

test("3. fit/fill/zoom/reset update only the targeted scene", () => {
  const script = threeSceneScript();
  const afterZoom = applySceneImageSettings(script, "scene-2", { scale: 2.1, fitMode: "fill" });
  assert.equal(getSceneImage(afterZoom.scenes[0])?.scale, 1);
  assert.equal(getSceneImage(afterZoom.scenes[0])?.fitMode, "fit");
  assert.equal(getSceneImage(afterZoom.scenes[1])?.scale, 2.1);
  assert.equal(getSceneImage(afterZoom.scenes[1])?.fitMode, "fill");
  assert.equal(getSceneImage(afterZoom.scenes[2]), undefined);

  const afterReset = applyResetSceneImageSettings(afterZoom, "scene-2");
  assert.equal(getSceneImage(afterReset.scenes[1])?.scale, 1);
  assert.equal(getSceneImage(afterReset.scenes[1])?.fitMode, "fill");
  assert.equal(getSceneImage(afterReset.scenes[0])?.scale, 1);
});

test("4. image control interactions wire preview activation by scene index", () => {
  const sidebar = readFileSync(
    join(root, "src/features/editor/components/EditorProjectSidebar.tsx"),
    "utf8",
  );
  assert.match(sidebar, /selection\.selectScene\(scene\.id\)/);
  assert.match(studioSceneInspector, /handleImageTransformChange/);
  assert.match(studioSceneInspector, /handleFitModeChange/);
  assert.match(studioSceneInspector, /handleImageReset/);
  assert.match(mediaPicker, /onInteractionStart\?\.\(\)/);
});

test("5. new uploads default to fit/contain with scale 1 and centered pan", () => {
  assert.match(sceneImageUpload, /createSceneImageFromUrl\(objectUrl\)/);
  const uploaded = createSceneImageFromUrl("blob:new");
  assert.equal(uploaded.fitMode, "fit");
  assert.equal(uploaded.scale, 1);
  assert.equal(uploaded.x, 0);
  assert.equal(uploaded.y, 0);
  assert.equal(getSceneImageObjectFit(uploaded), "contain");
});

test("6. existing images still render (legacy url + explicit fill preserved)", () => {
  const legacy = normalizeSceneImageSettings(
    scene("legacy", undefined, "https://example.com/legacy.jpg"),
  );
  assert.equal(getSceneImageUrl(legacy), "https://example.com/legacy.jpg");
  assert.equal(sceneHasImage(legacy), true);

  const existingFill = normalizeSceneImage({
    url: "blob:existing",
    scale: 1.6,
    x: 30,
    y: -12,
    fitMode: "fill",
  });
  assert.equal(existingFill?.fitMode, "fill");
  assert.equal(existingFill?.scale, 1.6);

  const payload = buildFootieExportPayload({
    title: "Legacy",
    narration: "",
    totalDuration: 3,
    scenes: [legacy, scene("fill", existingFill)],
  });
  assert.equal(getSceneImageUrl(payload.scenes[0]), "https://example.com/legacy.jpg");
  assert.equal(getSceneImage(payload.scenes[1])?.fitMode, "fill");
});

test("7. duplicated scenes do not share image settings objects", () => {
  const original = scene("scene-src", {
    url: "blob:shared-url",
    scale: 1.3,
    x: 15,
    y: -8,
    fitMode: "fill",
  });
  const copy = duplicateScene(original);
  assert.notEqual(copy.image, original.image);
  assert.equal(copy.image?.url, original.image?.url);

  const updated = updateSceneImageSettings([original, copy], copy.id, { scale: 2.5 });
  assert.equal(updated[0].image?.scale, 1.3);
  assert.equal(updated[1].image?.scale, 2.5);
});

test("8. export payload still includes per-scene image transforms", () => {
  const script: FootieScript = {
    title: "Export QA",
    narration: "Hello",
    totalDuration: 6,
    scenes: [
      scene("scene-1", {
        url: "blob:export-a",
        scale: 1.4,
        x: 54,
        y: -27,
        fitMode: "fill",
      }),
      scene("scene-2", createSceneImageFromUrl("blob:export-b")),
    ],
  };

  const payload = buildFootieExportPayload(script);
  assert.equal(payload.scenes.length, 2);
  assert.equal(getSceneImage(payload.scenes[0])?.scale, 1.4);
  assert.equal(getSceneImage(payload.scenes[0])?.fitMode, "fill");
  assert.equal(getSceneImage(payload.scenes[1])?.fitMode, "fit");
  assert.ok(payload.timelineItems.length >= 2);
});

test("9. image motion updates only target scene and preserves fit/zoom/subtitles/transitions", () => {
  const motionControl = readFileSync(
    join(root, "src/features/editor/components/SceneImageMotionControl.tsx"),
    "utf8",
  );
  const motionPanel = readFileSync(
    join(root, "src/features/editor/components/motion/MotionPanel.tsx"),
    "utf8",
  );
  assert.match(motionControl, /SCENE_IMAGE_MOTION_TYPE_OPTIONS/);
  assert.match(motionControl, /SCENE_IMAGE_MOTION_INTENSITY_OPTIONS/);
  assert.match(motionControl, /MotionPanel/);
  assert.match(motionPanel, /AnimatedPresetsSection/);
  assert.match(motionPanel, /MotionSpeedControl/);
  assert.deepEqual(
    SCENE_IMAGE_MOTION_TYPE_OPTIONS.map((option) => option.label),
    ["None", "Zoom In", "Zoom Out"],
  );
  assert.deepEqual(
    SCENE_IMAGE_MOTION_INTENSITY_OPTIONS.map((option) => option.label),
    ["Subtle", "Medium", "Strong"],
  );

  const script = threeSceneScript();
  const beforeSubtitle = script.scenes[1]?.subtitle;
  const afterMotion = applySceneImageSettings(script, "scene-2", {
    imageMotion: { type: "zoom-in", intensity: "strong" },
  });

  assert.equal(getSceneImage(afterMotion.scenes[0])?.scale, 1);
  assert.equal(getSceneImage(afterMotion.scenes[1])?.scale, 1);
  assert.equal(getSceneImage(afterMotion.scenes[1])?.fitMode, "fit");
  assert.equal(afterMotion.scenes[1]?.subtitle, beforeSubtitle);
  assert.deepEqual(normalizeSceneImageMotion(getSceneImage(afterMotion.scenes[1])?.imageMotion), {
    type: "zoom-in",
    intensity: "strong",
  });
  assert.deepEqual(normalizeSceneImageMotion(getSceneImage(afterMotion.scenes[0])?.imageMotion), {
    type: "none",
    intensity: "subtle",
  });

  const withTransition = {
    ...afterMotion,
    timelineItems: ensureTimelineItems(afterMotion.scenes).map((item) =>
      item.type === "transition"
        ? { ...item, effect: "fade" as const, durationMs: 500, label: TRANSITION_CARD_TITLE }
        : item,
    ),
  };
  const transitionBefore = getTransitionsFromTimeline(withTransition.timelineItems ?? [])[0];
  const afterSecondMotion = applySceneImageSettings(withTransition, "scene-1", {
    imageMotion: { type: "zoom-out", intensity: "medium" },
  });
  const transitionAfter = getTransitionsFromTimeline(afterSecondMotion.timelineItems ?? [])[0];

  assert.deepEqual(transitionAfter, transitionBefore);
  assert.equal(getSceneImage(afterSecondMotion.scenes[1])?.scale, 1);
});

console.log("\nAll image adjustment QA checks passed.");
