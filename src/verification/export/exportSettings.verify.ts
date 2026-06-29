/**
 * Export settings verification (run: npm run test:export-settings).
 */
import assert from "node:assert/strict";

import {
  buildExportDownloadFileName,
  exportSettingsToQualityPreset,
  normalizeExportSettings,
  resolveEffectiveExportSettings,
  resolveExportQualityPreset,
  resolveExportRenderPreset,
  resolveExportSettings,
  sanitizeExportFileName,
  slugifyStoryTitle,
} from "@/features/export/utils/export-settings.utils";
import { getExportQualityPreset } from "@/features/export/utils/export-quality.utils";
import type { FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const baseScript: FootieScript = {
  title: "Haaland Derby Winner",
  narration: "A classic finish.",
  totalDuration: 6,
  scenes: [
    {
      id: "1",
      start: 0,
      end: 6,
      duration: 6,
      subtitle: "Goal",
    },
  ],
};

console.log("exportSettings");

test("slugifyStoryTitle produces a safe default file name", () => {
  assert.equal(slugifyStoryTitle("Haaland Derby Winner"), "haaland-derby-winner");
  assert.equal(slugifyStoryTitle("   "), "story-short");
});

test("sanitizeExportFileName slugifies titles and strips invalid characters", () => {
  assert.equal(sanitizeExportFileName("India World Cup Story"), "india-world-cup-story");
  assert.equal(sanitizeExportFileName('Bad:/name?.mp4'), "bad-name");
  assert.equal(sanitizeExportFileName("   "), "story-short");
});

test("buildExportDownloadFileName uses sanitized base name and selected format", () => {
  assert.equal(
    buildExportDownloadFileName({
      fileName: "India World Cup Story",
      format: "mp4",
    }),
    "india-world-cup-story.mp4",
  );

  assert.equal(
    buildExportDownloadFileName({
      fileName: "India World Cup Story",
      format: "webm",
    }),
    "india-world-cup-story.webm",
  );

  assert.equal(
    buildExportDownloadFileName({ fileName: "   ", format: "mp4" }),
    "story-short.mp4",
  );

  assert.equal(
    buildExportDownloadFileName({ fileName: "clip.webm", format: "mp4" }),
    "clip.mp4",
  );
});

test("normalizeExportSettings applies product defaults", () => {
  assert.deepEqual(normalizeExportSettings(undefined, "My Story"), {
    fileName: "my-story",
    format: "webm",
    quality: "high",
    resolution: "1080x1920",
  });
});

test("normalizeExportSettings preserves explicit MP4 selection", () => {
  assert.equal(
    normalizeExportSettings({ format: "mp4" }, "My Story").format,
    "mp4",
  );
});

test("resolveExportSettings is backward compatible without stored settings", () => {
  assert.deepEqual(resolveExportSettings(baseScript), {
    fileName: "haaland-derby-winner",
    format: "webm",
    quality: "high",
    resolution: "1080x1920",
  });
});

test("stored exportSettings override defaults", () => {
  const script: FootieScript = {
    ...baseScript,
    exportSettings: {
      fileName: "custom-export",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
  };

  assert.deepEqual(resolveExportSettings(script), script.exportSettings);
  assert.equal(buildExportDownloadFileName(script.exportSettings!), "custom-export.webm");
});

test("exportSettingsToQualityPreset maps resolution and quality to render preset", () => {
  const high1080 = exportSettingsToQualityPreset({
    fileName: "story",
    format: "mp4",
    quality: "high",
    resolution: "1080x1920",
  });

  assert.equal(high1080.width, 1080);
  assert.equal(high1080.height, 1920);
  assert.equal(high1080.bitrate, 8_000_000);

  const standard720 = exportSettingsToQualityPreset({
    fileName: "story",
    format: "webm",
    quality: "standard",
    resolution: "720x1280",
  });

  assert.equal(standard720.width, 720);
  assert.equal(standard720.height, 1280);
  assert.equal(standard720.bitrate, 4_000_000);
});

test("resolveEffectiveExportSettings blocks unavailable WebM without forcing MP4", () => {
  const result = resolveEffectiveExportSettings({
    fileName: "story",
    format: "webm",
    quality: "high",
    resolution: "1080x1920",
  });

  assert.equal(result.settings.format, "webm");
  assert.equal(result.formatFallback, false);
  assert.equal(result.blocked, false);
});

test("resolveEffectiveExportSettings preserves explicit MP4 selection", () => {
  const result = resolveEffectiveExportSettings({
    fileName: "story",
    format: "mp4",
    quality: "high",
    resolution: "1080x1920",
  });

  assert.equal(result.settings.format, "mp4");
  assert.equal(result.formatFallback, false);
});

test("resolveExportRenderPreset maps export settings to canvas dimensions and bitrate", () => {
  const preset = resolveExportRenderPreset(baseScript, {
    exportSettings: {
      fileName: "story",
      format: "mp4",
      quality: "standard",
      resolution: "720x1280",
    },
  });

  assert.equal(preset.width, 720);
  assert.equal(preset.height, 1280);
  assert.equal(preset.bitrate, 4_000_000);
});

test("resolveExportQualityPreset keeps legacy qualityId support", () => {
  const legacyPreset = resolveExportQualityPreset(baseScript, { qualityId: "4k" });
  const expected = getExportQualityPreset("4k");

  assert.equal(legacyPreset.width, expected.width);
  assert.equal(legacyPreset.height, expected.height);
  assert.equal(legacyPreset.bitrate, expected.bitrate);
});

test("resolveExportQualityPreset prefers exportSettings over legacy qualityId", () => {
  const script: FootieScript = {
    ...baseScript,
    exportSettings: {
      fileName: "story",
      format: "mp4",
      quality: "standard",
      resolution: "720x1280",
    },
  };

  const preset = resolveExportQualityPreset(script, { qualityId: "4k" });

  assert.equal(preset.width, 720);
  assert.equal(preset.height, 1280);
  assert.equal(preset.bitrate, 4_000_000);
});

console.log("All export settings checks passed.");
