/**
 * Local binary capability preflight — no provider contact.
 * Reports bounded facts only (presence / encoder names / sandbox policy).
 */

import { existsSync } from "node:fs";

import { buildHeadlessChromeLaunchArgs } from "../chromium/chrome-launch-args";
import { assertFfmpegEncodersPresent } from "../ffmpeg/list-ffmpeg-encoders";
import type { HeadlessConfiguredHostedWorkerEnvironment } from "./hosted-environment";

export type HeadlessHostedBinaryPreflightResult =
  | {
      readonly ok: true;
      readonly facts: {
        readonly chromePresent: true;
        readonly ffmpegPresent: true;
        readonly ffprobePresent: true;
        readonly encoders: readonly string[];
        readonly noSandboxDefault: false;
        readonly noSandboxAllowed: boolean;
      };
    }
  | {
      readonly ok: false;
      readonly reasonId:
        | "chrome_missing"
        | "ffmpeg_missing"
        | "ffprobe_missing"
        | "encoder_missing"
        | "chrome_launch_policy_invalid";
      readonly facts: Readonly<Record<string, string | number | boolean | null>>;
    };

const REQUIRED_ENCODERS = Object.freeze([
  "libvpx-vp9",
  "libx264",
  "libopus",
  "aac",
] as const);

/**
 * Prove Chromium + FFmpeg + ffprobe + required codecs before queue consumption.
 * Never returns executable paths in facts (presence booleans / counts only).
 */
export function runHostedBinaryPreflight(
  config: HeadlessConfiguredHostedWorkerEnvironment,
): HeadlessHostedBinaryPreflightResult {
  if (!existsSync(config.chromeExecutable)) {
    return {
      ok: false,
      reasonId: "chrome_missing",
      facts: { chromePresent: false },
    };
  }
  if (!existsSync(config.ffmpegExecutable)) {
    return {
      ok: false,
      reasonId: "ffmpeg_missing",
      facts: { ffmpegPresent: false },
    };
  }
  if (!existsSync(config.ffprobeExecutable)) {
    return {
      ok: false,
      reasonId: "ffprobe_missing",
      facts: { ffprobePresent: false },
    };
  }

  const encoders = assertFfmpegEncodersPresent({
    ffmpegExecutable: config.ffmpegExecutable,
    required: REQUIRED_ENCODERS,
  });
  if (!encoders.ok) {
    return {
      ok: false,
      reasonId: "encoder_missing",
      facts: {
        missingEncoderCount: encoders.missing.length,
        requiredEncoderCount: REQUIRED_ENCODERS.length,
      },
    };
  }

  const defaultArgs = buildHeadlessChromeLaunchArgs({});
  if (defaultArgs.includes("--no-sandbox")) {
    return {
      ok: false,
      reasonId: "chrome_launch_policy_invalid",
      facts: { noSandboxDefault: true },
    };
  }

  return {
    ok: true,
    facts: {
      chromePresent: true,
      ffmpegPresent: true,
      ffprobePresent: true,
      encoders: REQUIRED_ENCODERS,
      noSandboxDefault: false,
      noSandboxAllowed: config.allowNoSandboxWithExternalIsolation,
    },
  };
}
