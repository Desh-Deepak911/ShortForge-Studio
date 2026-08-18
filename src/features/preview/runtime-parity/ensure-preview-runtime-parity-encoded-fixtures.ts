/**
 * Local encoded fixtures for Prompt 6 Browser/Headless certification.
 * Color-matched to corpus identities. Gitignored under .tmp/.
 */

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import {
  PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_IDS,
  type PreviewRuntimeParityEncodedFixtureId,
} from "./preview-runtime-parity-encoded-fixture-ids";

export {
  PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_IDS,
  previewRuntimeParityEncodedPublicUrl,
  type PreviewRuntimeParityEncodedFixtureId,
} from "./preview-runtime-parity-encoded-fixture-ids";

export const PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_DIR = join(
  process.cwd(),
  ".tmp/preview-runtime-parity/encoded-fixtures",
);

const COLORS: Record<PreviewRuntimeParityEncodedFixtureId, string> = {
  "video-a": "0xc41e3a",
  "video-b": "0x1b8a4a",
  "video-c": "0x1e4fc4",
  "image-p": "0xd97706",
  "image-q": "0x7c3aed",
};

export function previewRuntimeParityEncodedFilePath(
  id: PreviewRuntimeParityEncodedFixtureId,
): string {
  const ext = id.startsWith("image") ? "png" : "mp4";
  return join(PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_DIR, `${id}.${ext}`);
}

export function ensurePreviewRuntimeParityEncodedFixtures(): {
  readonly ok: boolean;
  readonly message: string;
  readonly files: readonly string[];
} {
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!ffmpeg.ok) {
    return { ok: false, message: ffmpeg.message, files: [] };
  }
  mkdirSync(PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_DIR, { recursive: true });
  const files: string[] = [];
  for (const id of PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_IDS) {
    const path = previewRuntimeParityEncodedFilePath(id);
    if (!existsSync(path)) {
      const color = COLORS[id];
      const isImage = id.startsWith("image");
      const args = isImage
        ? [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=${color}:s=1080x1920:d=0.04:r=30`,
            "-frames:v",
            "1",
            path,
          ]
        : [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=${color}:s=1080x1920:d=6:r=30`,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-an",
            path,
          ];
      const result = spawnSync(ffmpeg.ffmpegExecutable, args, { encoding: "utf8" });
      if (result.status !== 0 || !existsSync(path)) {
        return {
          ok: false,
          message: `Failed to synthesize ${id}: ${result.stderr || result.stdout}`,
          files,
        };
      }
    }
    files.push(path);
  }
  writeFileSync(
    join(PREVIEW_RUNTIME_PARITY_ENCODED_FIXTURE_DIR, "README.txt"),
    "Prompt 6 local encoded fixtures. Gitignored. Not user media.\n",
  );
  return { ok: true, message: "ok", files };
}
