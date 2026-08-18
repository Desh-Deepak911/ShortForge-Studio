/**
 * Local 6s 1080×1920 timecode MP4 for per-media trim certification.
 * Written under gitignored .tmp/. Not a saved draft.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";

export const PER_MEDIA_VIDEO_TRIM_FIXTURE_DIR = join(
  process.cwd(),
  ".tmp/per-media-video-trim",
);

export const PER_MEDIA_VIDEO_TRIM_FIXTURE_FILE = join(
  PER_MEDIA_VIDEO_TRIM_FIXTURE_DIR,
  "source-timecode.mp4",
);

export { PER_MEDIA_VIDEO_TRIM_FIXTURE_URL } from "./per-media-video-trim-contract";

const SECTIONS = [
  { color: "0xc41e3a", label: "SOURCE 0" },
  { color: "0xd97706", label: "SOURCE 1" },
  { color: "0x1b8a4a", label: "SOURCE 2" },
  { color: "0x1e4fc4", label: "SOURCE 3" },
  { color: "0x7c3aed", label: "SOURCE 4" },
  { color: "0xf8fafc", label: "SOURCE 5" },
] as const;

export function ensurePerMediaVideoTrimFixture(): {
  readonly ok: boolean;
  readonly message: string;
  readonly filePath: string;
} {
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!ffmpeg.ok) {
    return { ok: false, message: ffmpeg.message, filePath: PER_MEDIA_VIDEO_TRIM_FIXTURE_FILE };
  }
  mkdirSync(PER_MEDIA_VIDEO_TRIM_FIXTURE_DIR, { recursive: true });
  if (existsSync(PER_MEDIA_VIDEO_TRIM_FIXTURE_FILE)) {
    return { ok: true, message: "cached", filePath: PER_MEDIA_VIDEO_TRIM_FIXTURE_FILE };
  }

  const inputs: string[] = [];
  for (const section of SECTIONS) {
    inputs.push("-f", "lavfi", "-i", `color=c=${section.color}:s=1080x1920:d=1:r=30`);
  }
  const labeled = SECTIONS.map((section, index) => {
    const textColor = section.color === "0xf8fafc" ? "black" : "white";
    return `[${index}:v]drawtext=text='${section.label}':fontsize=96:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=16[v${index}]`;
  }).join(";");
  const concatInputs = SECTIONS.map((_, index) => `[v${index}]`).join("");
  const filter = `${labeled};${concatInputs}concat=n=6:v=1:a=0[out]`;
  const result = spawnSync(
    ffmpeg.ffmpegExecutable,
    [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      PER_MEDIA_VIDEO_TRIM_FIXTURE_FILE,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return {
      ok: false,
      message: result.stderr?.slice(-400) || "Failed to synthesize timecode fixture.",
      filePath: PER_MEDIA_VIDEO_TRIM_FIXTURE_FILE,
    };
  }
  writeFileSync(
    join(PER_MEDIA_VIDEO_TRIM_FIXTURE_DIR, "README.txt"),
    "Local per-media trim fixture. Do not commit.\n",
  );
  return { ok: true, message: "created", filePath: PER_MEDIA_VIDEO_TRIM_FIXTURE_FILE };
}
