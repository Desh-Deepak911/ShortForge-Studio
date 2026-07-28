/**
 * Export media fit / full-image framing parity (4.2C-7).
 * Run: npm run test:export-media-fit
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  mapSceneMediaToExportDrawImage,
  resolveExportMediaFitMode,
  resolveExportSceneMediaDrawImage,
} from "@/features/export/utils/export-scene-media-renderer";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import {
  getSceneImage,
  getSceneImageContainDimensions,
  getSceneImageCoverDimensions,
  getSceneImageDrawDimensions,
  getSceneImageObjectFit,
  normalizeSceneImageFitMode,
} from "@/features/story/utils";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function sceneWithImage(fitMode: "fit" | "fill", mediaFit?: "contain" | "cover"): FootieScene {
  return {
    id: "img-1",
    start: 0,
    end: 3,
    duration: 3,
    durationMs: 3000,
    startMs: 0,
    endMs: 3000,
    subtitle: "",
    image: {
      url: "https://example.com/photo.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode,
    },
    media: {
      type: "image",
      url: "https://example.com/photo.jpg",
      source: "upload",
      ...(mediaFit ? { fitMode: mediaFit } : {}),
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
  };
}

function assertContainCentered(
  sourceW: number,
  sourceH: number,
  frameW: number,
  frameH: number,
) {
  const dims = getSceneImageContainDimensions(sourceW, sourceH, frameW, frameH);
  assert.ok(dims.drawWidth <= frameW + 1e-6);
  assert.ok(dims.drawHeight <= frameH + 1e-6);
  // At least one axis fills the frame
  assert.ok(
    Math.abs(dims.drawWidth - frameW) < 1e-6 || Math.abs(dims.drawHeight - frameH) < 1e-6,
  );
  return dims;
}

async function main() {
  console.log("\nexport-media-fit\n");

  await test("Preview image fitMode is export authority when media.fitMode disagrees", () => {
    // Inspector writes scene.image.fitMode; Preview reads getSceneImage.
    // media may still be cover from upload defaults.
    const scene = sceneWithImage("fit", "cover");
    const previewFit = getSceneImageObjectFit(getSceneImage(scene)!);
    const exportFit = resolveExportSceneMediaDrawImage(scene)!.fitMode;
    assert.equal(previewFit, "contain");
    assert.equal(exportFit, "fit");
    assert.equal(resolveExportMediaFitMode(scene, scene.media!), "fit");
  });

  await test("missing media.fitMode defaults to scene.image / fit (not fill)", () => {
    const scene = sceneWithImage("fit");
    delete (scene.media as SceneMedia).fitMode;
    assert.equal(resolveExportSceneMediaDrawImage(scene)!.fitMode, "fit");
  });

  await test("fill / cover still covers the frame", () => {
    const scene = sceneWithImage("fill", "cover");
    const draw = resolveExportSceneMediaDrawImage(scene)!;
    assert.equal(draw.fitMode, "fill");
    const dims = getSceneImageDrawDimensions(draw, 1920, 1080, 1080, 1920);
    const cover = getSceneImageCoverDimensions(1920, 1080, 1080, 1920);
    assert.deepEqual(dims, cover);
  });

  await test("fit portrait / landscape / square letterbox correctly", () => {
    const frames = [
      [720, 1280],
      [1080, 1920],
      [1440, 2560],
    ] as const;
    const sources = [
      [1080, 1920], // portrait
      [1920, 1080], // landscape
      [1200, 1200], // square
    ] as const;

    for (const [fw, fh] of frames) {
      for (const [sw, sh] of sources) {
        const dims = assertContainCentered(sw, sh, fw, fh);
        const draw = mapSceneMediaToExportDrawImage(
          {
            type: "image",
            url: "https://example.com/x.jpg",
            fitMode: "contain",
          },
          "fit",
        )!;
        const viaHelper = getSceneImageDrawDimensions(draw, sw, sh, fw, fh);
        assert.deepEqual(viaHelper, dims);
      }
    }
  });

  await test("manual position / zoom / rotation preserved on export draw image", () => {
    const scene: FootieScene = {
      ...sceneWithImage("fit", "contain"),
      image: {
        url: "https://example.com/photo.jpg",
        fitMode: "fit",
        scale: 1.4,
        x: 40,
        y: -20,
        rotation: 12,
      },
      media: {
        type: "image",
        url: "https://example.com/photo.jpg",
        fitMode: "contain",
        transform: { x: 40, y: -20, scale: 1.4, rotation: 12 },
      },
    };
    const draw = resolveExportSceneMediaDrawImage(scene)!;
    assert.equal(draw.fitMode, "fit");
    assert.equal(draw.scale, 1.4);
    assert.equal(draw.x, 40);
    assert.equal(draw.y, -20);
    assert.equal(draw.rotation, 12);
  });

  await test("video unset fitMode defaults to fill (Preview cover parity)", () => {
    const scene: FootieScene = {
      id: "vid",
      start: 0,
      end: 2,
      duration: 2,
      durationMs: 2000,
      startMs: 0,
      endMs: 2000,
      subtitle: "",
      media: {
        type: "video",
        url: "blob:v",
        durationMs: 2000,
      },
    };
    assert.equal(resolveExportSceneMediaDrawImage(scene)!.fitMode, "fill");
  });

  await test("video contain maps to fit", () => {
    const scene: FootieScene = {
      id: "vid",
      start: 0,
      end: 2,
      duration: 2,
      durationMs: 2000,
      startMs: 0,
      endMs: 2000,
      subtitle: "",
      media: {
        type: "video",
        url: "blob:v",
        durationMs: 2000,
        fitMode: "contain",
      },
    };
    assert.equal(resolveExportSceneMediaDrawImage(scene)!.fitMode, "fit");
  });

  await test("fit uses Math.min semantics (contain), not cover Math.max", () => {
    const landscape = getSceneImageContainDimensions(1920, 1080, 1080, 1920);
    const cover = getSceneImageCoverDimensions(1920, 1080, 1080, 1920);
    assert.ok(landscape.drawWidth < cover.drawWidth || landscape.drawHeight < cover.drawHeight);
    assert.equal(landscape.drawWidth, 1080);
    assert.ok(landscape.drawHeight < 1920);
  });

  await test("normalizeSceneImageFitMode defaults to fit", () => {
    assert.equal(normalizeSceneImageFitMode(undefined), "fit");
    assert.equal(normalizeSceneImageFitMode("bogus"), "fit");
  });

  await test("export renderer does not hard-default all images to fill", () => {
    const source = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
    assert.match(source, /resolveExportMediaFitMode/);
    assert.match(source, /resolveSceneMediaFraming/);
    assert.doesNotMatch(
      source,
      /fitMode:\s*media\.fitMode === "contain" \? "fit" : "fill"/,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
