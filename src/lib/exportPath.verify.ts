/**
 * Export path verification (run: npm run test:export-path).
 */
import assert from "node:assert/strict";

import {
  EXPORT_PATH_MP4_SLOW_NOTICE,
  EXPORT_PATH_WEBM_BACKGROUND_MUSIC_UNSUPPORTED_MESSAGE,
  EXPORT_PATH_WEBM_FAST_NOTICE,
  resolveExportPath,
  resolveExportPathFormatNotice,
  resolveWebmBackgroundMusicExportNotice,
  WEBM_BACKGROUND_MUSIC_EXPORT_SUPPORTED,
} from "@/features/export/utils/export-path.utils";
import { isMp4ExportBlob } from "@/features/export/utils/ffmpeg.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("exportPath");

test("resolveExportPath selects WebM without rewriting format", () => {
  const result = resolveExportPath({
    fileName: "story",
    format: "webm",
    quality: "high",
    resolution: "1080x1920",
  });

  assert.equal(result.path, "webm");
  assert.equal(result.format, "webm");
  assert.equal(result.blocked, false);
});

test("resolveExportPath selects MP4 without rewriting format", () => {
  const result = resolveExportPath({
    fileName: "story",
    format: "mp4",
    quality: "high",
    resolution: "1080x1920",
  });

  assert.equal(result.path, "mp4");
  assert.equal(result.format, "mp4");
  assert.equal(result.blocked, false);
});

test("resolveExportPathFormatNotice describes each path", () => {
  assert.equal(resolveExportPathFormatNotice("webm"), EXPORT_PATH_WEBM_FAST_NOTICE);
  assert.equal(resolveExportPathFormatNotice("mp4"), EXPORT_PATH_MP4_SLOW_NOTICE);
});

test("resolveWebmBackgroundMusicExportNotice is clear when WebM music mix is unsupported", () => {
  if (WEBM_BACKGROUND_MUSIC_EXPORT_SUPPORTED) {
    assert.equal(
      resolveWebmBackgroundMusicExportNotice({
        exportPath: "webm",
        backgroundMusicActive: true,
      }),
      undefined,
    );
    return;
  }

  assert.equal(
    resolveWebmBackgroundMusicExportNotice({
      exportPath: "webm",
      backgroundMusicActive: true,
    }),
    EXPORT_PATH_WEBM_BACKGROUND_MUSIC_UNSUPPORTED_MESSAGE,
  );
});

test("isMp4ExportBlob detects finalized MP4 blobs", () => {
  assert.equal(isMp4ExportBlob(new Blob([], { type: "video/mp4" })), true);
  assert.equal(isMp4ExportBlob(new Blob([], { type: "video/webm" })), false);
});

test("resolveWebmBackgroundMusicExportNotice ignores MP4 path", () => {
  assert.equal(
    resolveWebmBackgroundMusicExportNotice({
      exportPath: "mp4",
      backgroundMusicActive: true,
    }),
    undefined,
  );
});

console.log("All export path checks passed.");
