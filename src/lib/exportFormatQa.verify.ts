/**
 * Export format QA (run: npm run test:export-format-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportDownloadFileName,
  DEFAULT_EXPORT_FORMAT,
  normalizeExportSettings,
  resolveExportSettings,
  WEBM_EXPORT_AVAILABLE,
} from "@/features/export/services";
import {
  resolveExportPath,
  resolveWebmBackgroundMusicExportNotice,
  WEBM_BACKGROUND_MUSIC_EXPORT_SUPPORTED,
} from "@/features/export/utils/export-path.utils";
import type { FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const baseScript: FootieScript = {
  title: "Export QA Story",
  narration: "Test narration.",
  totalDuration: 12,
  scenes: [
    {
      id: "1",
      start: 0,
      end: 12,
      duration: 12,
      subtitle: "Scene",
    },
  ],
};

const repoRoot = join(import.meta.dirname, "..", "..");
const videoRenderSource = readFileSync(
  join(repoRoot, "src/features/export/services/video-render.service.ts"),
  "utf8",
);
const ffmpegSource = readFileSync(
  join(repoRoot, "src/features/export/utils/ffmpeg.utils.ts"),
  "utf8",
);

console.log("exportFormatQa");

test("1. default export format is WebM", () => {
  assert.equal(DEFAULT_EXPORT_FORMAT, "webm");
  assert.equal(WEBM_EXPORT_AVAILABLE, true);
  assert.equal(normalizeExportSettings(undefined, "My Story").format, "webm");
  assert.equal(resolveExportSettings(baseScript).format, "webm");
});

test("2. WebM voiceover path uses stream-copy mux profile (fast path)", () => {
  assert.match(ffmpegSource, /codecArgs: \["-c:v", "copy", "-c:a", "libopus", "-b:a", "96k"\]/);
  assert.match(ffmpegSource, /outputFormat = options\.outputFormat \?\? "webm"/);
  assert.match(videoRenderSource, /resolveMuxOutputFormat\(exportPath\.path\)/);
  assert.match(videoRenderSource, /return exportPath === "mp4" \? "mp4" : "webm"/);
});

test("3. WebM path skips MP4 transcode in finalizeBlobForExportPath", () => {
  const finalizeMatch = videoRenderSource.match(
    /async function finalizeBlobForExportPath[\s\S]*?\n\}/,
  );
  assert.ok(finalizeMatch, "finalizeBlobForExportPath should exist");
  const finalizeFn = finalizeMatch[0];

  assert.match(finalizeFn, /if \(isWebmExportPath\(exportPath\)\) \{\s*return blob;/);
  assert.doesNotMatch(finalizeFn, /transcodeWebmToMp4/);
});

test("4. MP4 export path still has transcode or single-pass MP4 mux", () => {
  assert.match(ffmpegSource, /outputFormat === "mp4"/);
  assert.match(ffmpegSource, /export async function transcodeWebmToMp4/);
  assert.match(videoRenderSource, /transcodeForMp4ExportPath/);
  assert.match(videoRenderSource, /resolveExportPath\(exportSettings\)/);
  const mp4Path = resolveExportPath({
    fileName: "story",
    format: "mp4",
    quality: "high",
    resolution: "1080x1920",
  });
  assert.equal(mp4Path.path, "mp4");
  assert.equal(mp4Path.blocked, false);
});

test("5. MP4 is not the default format", () => {
  assert.notEqual(DEFAULT_EXPORT_FORMAT, "mp4");
  assert.equal(resolveExportSettings(baseScript).format, "webm");
});

test("6. exported file extension matches selected format", () => {
  assert.equal(
    buildExportDownloadFileName({
      fileName: "my-story",
      format: "webm",
      quality: "high",
      resolution: "1080x1920",
    }),
    "my-story.webm",
  );
  assert.equal(
    buildExportDownloadFileName({
      fileName: "my-story",
      format: "mp4",
      quality: "high",
      resolution: "1080x1920",
    }),
    "my-story.mp4",
  );
  assert.match(
    videoRenderSource,
    /buildExportDownloadFileName\(options\.exportSettings, options\.exportPath\)/,
  );
});

test("7. background music does not silently force MP4 on WebM", () => {
  const webmWithMusic = resolveExportPath({
    fileName: "story",
    format: "webm",
    quality: "high",
    resolution: "1080x1920",
  });
  assert.equal(webmWithMusic.format, "webm");
  assert.equal(webmWithMusic.path, "webm");
  assert.equal(webmWithMusic.blocked, false);

  if (WEBM_BACKGROUND_MUSIC_EXPORT_SUPPORTED) {
    assert.equal(
      resolveWebmBackgroundMusicExportNotice({
        exportPath: "webm",
        backgroundMusicActive: true,
      }),
      undefined,
    );
  } else {
    assert.match(
      resolveWebmBackgroundMusicExportNotice({
        exportPath: "webm",
        backgroundMusicActive: true,
      }) ?? "",
      /WebM|MP4/i,
    );
  }

  assert.doesNotMatch(
    videoRenderSource,
    /backgroundMusic[\s\S]{0,200}format:\s*"mp4"/,
  );
});

console.log("All export format QA checks passed.");
