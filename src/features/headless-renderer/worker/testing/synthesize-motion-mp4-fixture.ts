/**
 * Deterministic short MP4 with visible motion for headless video parity tests.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveNativeFfmpegBinaries } from "../ffmpeg/resolve-ffmpeg-binaries";

export type MotionMp4Fixture = {
  readonly bytes: Uint8Array;
  readonly durationSec: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
};

export function synthesizeMotionMp4Fixture(input?: {
  readonly durationSec?: number;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly pattern?: "testsrc" | "smptehdbars";
}): MotionMp4Fixture {
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!ffmpeg.ok) {
    throw new Error(ffmpeg.message);
  }
  const durationSec = input?.durationSec ?? 20;
  const width = input?.width ?? 320;
  const height = input?.height ?? 240;
  const fps = input?.fps ?? 30;
  const dir = mkdtempSync(join(tmpdir(), "hf-motion-mp4-"));
  const out = join(dir, "motion.mp4");
  const pattern = input?.pattern ?? "testsrc";
  const lavfi = `${pattern}=size=${width}x${height}:rate=${fps}:duration=${durationSec.toFixed(3)}`;
  const result = spawnSync(
    ffmpeg.ffmpegExecutable,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      lavfi,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      out,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error("Failed to synthesize motion MP4 fixture.");
  }
  const bytes = new Uint8Array(readFileSync(out));
  rmSync(dir, { recursive: true, force: true });
  return { bytes, durationSec, width, height, fps };
}

export function writeMotionMp4FixtureToDirectory(input: {
  readonly directory: string;
  readonly fileName?: string;
  readonly durationSec?: number;
}): MotionMp4Fixture & { readonly filePath: string } {
  const fixture = synthesizeMotionMp4Fixture({
    durationSec: input.durationSec,
  });
  const fileName = input.fileName ?? "motion.mp4";
  const filePath = join(input.directory, fileName);
  writeFileSync(filePath, fixture.bytes);
  return { ...fixture, filePath };
}
