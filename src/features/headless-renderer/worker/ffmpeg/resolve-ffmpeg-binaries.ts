/**
 * Resolve native ffmpeg/ffprobe executables — never FFmpeg.wasm.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const CANDIDATE_FFMPEG = [
  process.env.HEADLESS_FFMPEG_PATH,
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "ffmpeg",
].filter(Boolean) as string[];

const CANDIDATE_FFPROBE = [
  process.env.HEADLESS_FFPROBE_PATH,
  "/opt/homebrew/bin/ffprobe",
  "/usr/local/bin/ffprobe",
  "ffprobe",
].filter(Boolean) as string[];

function firstExisting(candidates: readonly string[]): string | null {
  for (const c of candidates) {
    if (c === "ffmpeg" || c === "ffprobe") return c;
    if (existsSync(c)) return c;
  }
  return null;
}

function versionLine(executable: string): string {
  try {
    const out = execFileSync(executable, ["-version"], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    return out.split("\n")[0]?.trim() ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function resolveNativeFfmpegBinaries():
  | {
      readonly ok: true;
      readonly ffmpegExecutable: string;
      readonly ffmpegVersion: string;
      readonly ffprobeExecutable: string;
      readonly ffprobeVersion: string;
    }
  | { readonly ok: false; readonly message: string } {
  const ffmpegExecutable = firstExisting(CANDIDATE_FFMPEG);
  const ffprobeExecutable = firstExisting(CANDIDATE_FFPROBE);
  if (!ffmpegExecutable || !ffprobeExecutable) {
    return {
      ok: false,
      message: "Native ffmpeg/ffprobe executables are unavailable.",
    };
  }
  return {
    ok: true,
    ffmpegExecutable,
    ffmpegVersion: versionLine(ffmpegExecutable),
    ffprobeExecutable,
    ffprobeVersion: versionLine(ffprobeExecutable),
  };
}
