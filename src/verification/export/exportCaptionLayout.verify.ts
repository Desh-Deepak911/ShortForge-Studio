/**
 * Export caption layout resolver — position, offsets, 720p/1080p scaling.
 * Run: npm run test:export-caption-layout
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveExportCaptionLayout,
  scaleReferenceCaptionOffsetX,
  scaleReferenceCaptionOffsetY,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
} from "@/features/export/domain";
import type { ExportCaptionLayoutManifest } from "@/features/export/domain/export-manifest.types";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function layout(
  partial: Partial<ExportCaptionLayoutManifest> &
    Pick<ExportCaptionLayoutManifest, "anchor">,
): ExportCaptionLayoutManifest {
  return {
    textAlign: "center",
    offsetX: 0,
    offsetY: 0,
    maxWidthPercent: 90,
    safeAreaEnabled: true,
    backgroundOpacity: null,
    usesLegacyBottomCenter: false,
    ...partial,
  };
}

console.log("\nexport-caption-layout\n");

test("center placement at 720p and 1080p is horizontally centered", () => {
  const center = layout({ anchor: "center" });
  const at720 = resolveExportCaptionLayout({
    layout: center,
    width: 720,
    height: 1280,
    contentBoxWidth: 400,
    contentBoxHeight: 80,
  });
  const at1080 = resolveExportCaptionLayout({
    layout: center,
    width: 1080,
    height: 1920,
    contentBoxWidth: 600,
    contentBoxHeight: 120,
  });
  assert.ok(Math.abs(at720.centerX - 360) < 2);
  assert.ok(Math.abs(at1080.centerX - 540) < 2);
  assert.equal(at720.usesLegacyBottomCenter, false);
  assert.equal(at1080.usesLegacyBottomCenter, false);
});

test("offsets apply after base anchor and scale proportionally", () => {
  const base = layout({ anchor: "center", offsetX: 0, offsetY: 0 });
  const shifted = layout({ anchor: "center", offsetX: 108, offsetY: -192 });

  const base720 = resolveExportCaptionLayout({
    layout: base,
    width: 720,
    height: 1280,
    contentBoxWidth: 300,
    contentBoxHeight: 60,
  });
  const shift720 = resolveExportCaptionLayout({
    layout: shifted,
    width: 720,
    height: 1280,
    contentBoxWidth: 300,
    contentBoxHeight: 60,
  });
  const shift1080 = resolveExportCaptionLayout({
    layout: shifted,
    width: 1080,
    height: 1920,
    contentBoxWidth: 450,
    contentBoxHeight: 90,
  });

  const dx720 = shift720.centerX - base720.centerX;
  const expectedDx720 = scaleReferenceCaptionOffsetX(108, 720);
  assert.ok(Math.abs(dx720 - expectedDx720) < 2);

  // Same semantic fraction of frame at both resolutions
  assert.ok(
    Math.abs(shift720.offsetX / CAPTION_LAYOUT_REFERENCE_WIDTH - shift1080.offsetX / CAPTION_LAYOUT_REFERENCE_WIDTH) <
      1e-9,
  );
  assert.ok(
    Math.abs(
      scaleReferenceCaptionOffsetY(-192, 1280) / 1280 -
        scaleReferenceCaptionOffsetY(-192, 1920) / 1920,
    ) < 1e-9,
  );
});

test("left/right alignment and top/bottom anchors resolve distinctly", () => {
  const left = resolveExportCaptionLayout({
    layout: layout({ anchor: "center_left", textAlign: "left" }),
    width: 1080,
    height: 1920,
    contentBoxWidth: 400,
    contentBoxHeight: 80,
  });
  const right = resolveExportCaptionLayout({
    layout: layout({ anchor: "center_right", textAlign: "right" }),
    width: 1080,
    height: 1920,
    contentBoxWidth: 400,
    contentBoxHeight: 80,
  });
  const top = resolveExportCaptionLayout({
    layout: layout({ anchor: "top_center" }),
    width: 1080,
    height: 1920,
    contentBoxWidth: 400,
    contentBoxHeight: 80,
  });
  const bottom = resolveExportCaptionLayout({
    layout: layout({ anchor: "bottom_center" }),
    width: 1080,
    height: 1920,
    contentBoxWidth: 400,
    contentBoxHeight: 80,
  });
  assert.ok(left.boxLeft < right.boxLeft);
  assert.ok(top.boxTop < bottom.boxTop);
  assert.equal(left.textAlign, "left");
  assert.equal(right.textAlign, "right");
});

test("multi-line block uses content height for vertical centering", () => {
  const single = resolveExportCaptionLayout({
    layout: layout({ anchor: "center" }),
    width: 1080,
    height: 1920,
    contentBoxWidth: 500,
    contentBoxHeight: 40,
  });
  const multi = resolveExportCaptionLayout({
    layout: layout({ anchor: "center" }),
    width: 1080,
    height: 1920,
    contentBoxWidth: 500,
    contentBoxHeight: 160,
  });
  // Taller block still centered — boxTop moves up relative to single-line
  assert.ok(multi.boxTop < single.boxTop);
  assert.ok(Math.abs(multi.centerX - 540) < 2);
});

test("legacy flag keeps legacy bottom-center path", () => {
  const legacy = resolveExportCaptionLayout({
    layout: layout({
      anchor: "bottom_center",
      usesLegacyBottomCenter: true,
    }),
    width: 1080,
    height: 1920,
    contentBoxWidth: 400,
    contentBoxHeight: 80,
  });
  assert.equal(legacy.usesLegacyBottomCenter, true);
  assert.ok(Math.abs(legacy.centerX - 540) < 2);
  assert.ok(legacy.boxBottomY > 1500);
});

test("manifest draw path freezes layout fields (structural)", () => {
  const root = process.cwd();
  const build = readFileSync(
    join(root, "src/features/export/domain/build-export-manifest.ts"),
    "utf8",
  );
  const draw = readFileSync(
    join(root, "src/features/export/runtime/draw-prepared-export-frame.ts"),
    "utf8",
  );
  assert.match(build, /buildCaptionLayout/);
  assert.match(build, /usesLegacyBottomCenter/);
  assert.match(draw, /captionLayoutFromManifest/);
  assert.match(draw, /usesLegacyBottomCenter/);
  assert.doesNotMatch(draw, /textAlign:\s*"center"/);
});

console.log(`\nexport-caption-layout: ${passed} passed\n`);
