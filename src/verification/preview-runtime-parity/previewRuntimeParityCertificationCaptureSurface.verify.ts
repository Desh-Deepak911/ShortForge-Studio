/**
 * Prompt 6B — clean Preview capture surface (provider-free).
 * Run: npm run test:preview-runtime-parity-certification-capture-surface
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_ASPECT,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_ATTR,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_EXCLUDED_CHROME,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_LOCATOR,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
  certificationCaptureBoxHasDevicePadding,
  certificationCaptureBoxIsNineSixteen,
} from "@/features/preview/runtime-parity/preview-runtime-parity-certification-capture";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
const sceneFrameVideo = readSrc(
  "src/features/editor/components/SceneFrameVideo.tsx",
);
const harness = readSrc(
  "src/app/dev/preview-runtime-parity-qa/PreviewRuntimeParityQaHarness.tsx",
);

test("certification capture mode is opt-in and default-false", () => {
  assert.match(previewFrame, /certificationCaptureMode\?: boolean/);
  assert.match(previewFrame, /certificationCaptureMode = false/);
  assert.match(previewFrame, /Studio Preview is unchanged/);
});

test("capture mode uses the same production Preview composition", () => {
  assert.match(previewFrame, /planPreviewMediaLayers/);
  assert.match(previewFrame, /resolveLegibilityLayerPlan/);
  assert.doesNotMatch(previewFrame, /function CertificationPreviewFrame/);
  assert.match(harness, /<PreviewFrame/);
  assert.doesNotMatch(harness, /function CertificationPreviewRenderer/);
});

test("capture mode suppresses only Preview-device and authoring chrome", () => {
  assert.match(previewFrame, /certificationCaptureMode \? null : <DynamicIsland/);
  assert.match(previewFrame, /footer && !certificationCaptureMode/);
  assert.match(previewFrame, new RegExp(PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_ATTR));
  assert.match(previewFrame, /aspect-\[9\/16\]/);
  assert.match(harness, /certificationCaptureMode=\{certificationCaptureMode\}/);
  assert.match(harness, /data-preview-runtime-parity-arm-cert-capture/);
  assert.match(harness, /draggable=\{!certificationCaptureMode\}/);
  assert.match(
    harness,
    /allowPointerEvents=\{!isPlaying && !certificationCaptureMode\}/,
  );
  for (const chrome of PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_EXCLUDED_CHROME) {
    assert.ok(chrome.length > 0);
  }
});

test("exported overlays remain mounted in capture mode", () => {
  assert.match(harness, /EngagementOverlayPreview/);
  assert.match(harness, /SubtitleOverlay/);
  assert.match(harness, /BrandStingPreview/);
  assert.match(previewFrame, /\{overlay\}/);
  assert.doesNotMatch(
    previewFrame,
    /certificationCaptureMode[\s\S]{0,80}\{overlay \? null/,
  );
});

test("one stable locator identifies the exact 9:16 content surface", () => {
  assert.equal(
    PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_LOCATOR,
    `[${PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_ATTR}]`,
  );
  assert.match(harness, /data-preview-runtime-parity-cert-capture/);
  assert.equal(PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX, 1080);
  assert.equal(PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX, 1920);
});

test("captured 1080×1920 box is 9:16 and has no device padding", () => {
  const box = {
    width: PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
    height: PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
  };
  assert.equal(box.width / box.height, PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_ASPECT);
  assert.equal(certificationCaptureBoxIsNineSixteen(box), true);
  assert.equal(certificationCaptureBoxHasDevicePadding(box), false);
  assert.equal(
    certificationCaptureBoxHasDevicePadding({ width: 244, height: 434 }),
    true,
  );
});

test("Dynamic Island has a locator and is omitted from the capture surface", () => {
  assert.match(previewFrame, /data-preview-dynamic-island=""/);
  assert.match(previewFrame, /certificationCaptureMode \? null : <DynamicIsland/);
});

test("software video plate is capture-surface-only and does not change Studio Preview", () => {
  assert.match(
    sceneFrameVideo,
    /data-preview-runtime-parity-cert-capture-surface/,
  );
  assert.match(sceneFrameVideo, /data-preview-runtime-parity-cert-video-plate=""/);
  assert.match(sceneFrameVideo, /certCapturePlate \? \{ opacity: 0 \}/);
  assert.match(sceneFrameVideo, /setCertCapturePlate\(/);
});

console.log(`\nPreview runtime-parity certification capture surface: ${passed} passed`);
