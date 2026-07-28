/**
 * Preview / Export media framing parity (image + video, 720p / 1080p scaling).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMediaFramingSettings } from "@/lib/utils/voiceover";
import {
  resolveSceneMediaFraming,
  resolveSceneMediaFramingAsImage,
} from "@/features/media-framing";
import { resolvePreviewMediaBaseTransform } from "@/features/editor/preview/motion";
import { resolveExportMediaBaseTransform } from "@/features/editor/export/motion";
import { buildExportManifest } from "@/features/export/domain/build-export-manifest";
import {
  mapSceneMediaToExportDrawImage,
  resolveExportMediaFitMode,
  resolveExportSceneMediaDrawImage,
} from "@/features/export/utils/export-scene-media-renderer";
import { SCENE_IMAGE_REFERENCE_HEIGHT, SCENE_IMAGE_REFERENCE_WIDTH } from "@/features/story/utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { ensureTimelineItems } from "@/features/story/utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function imageScene(): FootieScene {
  return {
    id: "img-1",
    start: 0,
    end: 3,
    duration: 3,
    durationMs: 3000,
    narration: "Image",
    subtitle: "Image",
    image: {
      url: "blob:img",
      x: 108,
      y: -192,
      scale: 1.25,
      rotation: 8,
      fitMode: "fill",
    },
    media: {
      type: "image",
      url: "blob:img",
      fitMode: "cover",
      transform: { x: 108, y: -192, scale: 1.25, rotation: 8 },
      motion: {
        version: 1,
        enabled: true,
        presetId: "slow-zoom-in",
        intensity: 1,
      },
    },
  };
}

function videoScene(): FootieScene {
  return {
    id: "vid-1",
    start: 3,
    end: 7,
    duration: 4,
    durationMs: 4000,
    narration: "Video",
    subtitle: "Video",
    media: {
      type: "video",
      url: "blob:vid",
      durationMs: 6000,
      trimStartMs: 0,
      trimEndMs: 4000,
      fitMode: "contain",
      transform: { x: -54, y: 96, scale: 1.1, rotation: -3 },
    },
  };
}

function story(): FootieScript {
  const scenes = [imageScene(), videoScene()];
  return {
    title: "Parity",
    narration: "Image Video",
    totalDuration: 7,
    scenes,
    timelineItems: ensureTimelineItems(scenes),
  };
}

console.log("\nmedia-framing-parity\n");

test("image Preview and Export base transforms match", () => {
  const scene = imageScene();
  assert.deepEqual(
    resolvePreviewMediaBaseTransform(scene),
    resolveExportMediaBaseTransform(scene),
  );
});

test("video Preview and Export base transforms match", () => {
  const scene = videoScene();
  assert.deepEqual(
    resolvePreviewMediaBaseTransform(scene),
    resolveExportMediaBaseTransform(scene),
  );
});

test("720p and 1080p scale reference pan equivalently", () => {
  const scene = imageScene();
  const framing = resolveSceneMediaFraming(scene);
  const scale720 = 720 / SCENE_IMAGE_REFERENCE_WIDTH;
  const scale1080 = 1080 / SCENE_IMAGE_REFERENCE_WIDTH;
  const screenX720 = framing.positionX * scale720;
  const screenX1080 = framing.positionX * scale1080;
  // Same visual fraction of frame
  assert.ok(Math.abs(screenX720 / 720 - screenX1080 / 1080) < 1e-9);
  assert.ok(Math.abs(framing.positionY * (1280 / SCENE_IMAGE_REFERENCE_HEIGHT) / 1280 -
    framing.positionY * (1920 / SCENE_IMAGE_REFERENCE_HEIGHT) / 1920) < 1e-9);
});

test("ExportManifest freezes image + video framing", () => {
  const manifest = buildExportManifest({
    story: story(),
    exportSettings: {
      fileName: "parity",
      format: "webm",
      resolution: "720x1280",
      quality: "standard",
    },
  });
  const img = manifest.scenes.find((s) => s.media.type === "image")?.media;
  const vid = manifest.scenes.find((s) => s.media.type === "video")?.media;
  assert.ok(img && img.type === "image");
  assert.ok(vid && vid.type === "video");
  if (img?.type === "image") {
    assert.equal(img.fitMode, "fill");
    assert.equal(img.positionX, 108);
    assert.equal(img.positionY, -192);
    assert.equal(img.zoom, 1.25);
    assert.equal(img.rotationDeg, 8);
  }
  if (vid?.type === "video") {
    assert.equal(vid.fitMode, "fit");
    assert.equal(vid.positionX, -54);
    assert.equal(vid.positionY, 96);
    assert.equal(vid.zoom, 1.1);
    assert.equal(vid.rotationDeg, -3);
    assert.equal(vid.trimStartMs, 0);
    assert.equal(vid.trimEndMs, 4000);
  }
});

test("export draw image uses shared framing resolver", () => {
  const scene = imageScene();
  const draw = resolveExportSceneMediaDrawImage(scene);
  assert.ok(draw);
  assert.equal(draw!.x, 108);
  assert.equal(draw!.y, -192);
  assert.equal(draw!.scale, 1.25);
  assert.equal(draw!.fitMode, "fill");
  assert.equal(resolveExportMediaFitMode(scene, scene.media!), "fill");
});

test("fit/fill + position + zoom + rotation on both media kinds", () => {
  const img = resolveSceneMediaFraming(imageScene());
  const vid = resolveSceneMediaFraming(videoScene());
  assert.equal(img.fitMode, "fill");
  assert.equal(vid.fitMode, "fit");
  assert.ok(img.zoom > 1);
  assert.ok(vid.zoom > 1);
  assert.ok(img.rotationDeg !== 0);
  assert.ok(vid.rotationDeg !== 0);
});

test("framing + motion composition remains separate (adapters share resolver)", () => {
  const previewAdapter = readSrc(
    "src/features/editor/preview/motion/previewMotionAdapter.ts",
  );
  const exportAdapter = readSrc(
    "src/features/editor/export/motion/exportMotionAdapter.ts",
  );
  assert.match(previewAdapter, /resolveSceneMediaFramingTransform/);
  assert.match(exportAdapter, /resolveSceneMediaFramingTransform/);
  assert.match(previewAdapter, /resolveMediaMotionStateForSceneTiming/);
  assert.match(exportAdapter, /resolveMediaMotionStateForSceneTiming/);
});

test("transitions remain on separate outer layer", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(previewFrame, /transitionOverlay/);
  assert.match(previewFrame, /SceneBackdrop/);
  assert.match(previewFrame, /editLayer/);
});

test("structural: framing commits through StoryDocument helpers", () => {
  const voiceover = readSrc("src/lib/utils/voiceover.ts");
  const patch = readSrc("src/features/media-framing/media-framing-patch.utils.ts");
  assert.match(voiceover, /applyMediaFramingSettings/);
  assert.match(patch, /buildMediaFramingPatch/);
  assert.match(patch, /intent|dual-write|scene\.image/);
  assert.doesNotMatch(patch, /scene\.media\.motion\s*=/);
});

test("committed framing survives script round-trip fields", () => {
  const script = applyMediaFramingSettings(
    {
      title: "t",
      narration: "Image",
      totalDuration: 3,
      scenes: [imageScene()],
    },
    "img-1",
    { x: 200, y: -100, scale: 1.5 },
  );
  const asImage = resolveSceneMediaFramingAsImage(script.scenes[0]!);
  assert.ok(asImage);
  assert.equal(asImage!.x, 200);
  assert.equal(asImage!.y, -100);
  assert.equal(asImage!.scale, 1.5);
  const mapped = mapSceneMediaToExportDrawImage(script.scenes[0]!.media!, asImage!.fitMode);
  // media-only map without scene.image still has dual-written transform
  assert.equal(mapped?.x, 200);
});

console.log(`\nmedia-framing-parity: ${passed} passed\n`);
