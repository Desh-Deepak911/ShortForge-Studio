import "server-only";

import { spawn } from "node:child_process";

import ffmpegPath from "ffmpeg-static";

const OUTPUT_SAMPLE_RATE_HZ = 48_000;
const OUTPUT_BITRATE = "192k";
const MAX_DIAGNOSTIC_LENGTH = 2_000;
const RENDER_TIMEOUT_MS = 60_000;

export function shouldRenderPitchPreservedVoiceSpeed(speed: number): boolean {
  return Number.isFinite(speed) && speed > 0 && speed !== 1;
}

export function buildPitchPreservedVoiceSpeedFfmpegArgs(
  speed: number,
): readonly string[] {
  if (!shouldRenderPitchPreservedVoiceSpeed(speed)) {
    throw new Error("Pitch-preserved voice speed requires a positive non-1 speed.");
  }

  return Object.freeze([
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    "pipe:0",
    "-vn",
    "-af",
    `atempo=${speed}`,
    "-ar",
    String(OUTPUT_SAMPLE_RATE_HZ),
    "-ac",
    "1",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    OUTPUT_BITRATE,
    "-f",
    "mp3",
    "pipe:1",
  ]);
}

/**
 * Converts a clean, normal-speed lossless TTS result into the selected tempo.
 * Pitch is preserved by FFmpeg's speech-oriented `atempo` filter. The returned
 * MP3 is canonical: Preview, Browser export, and Headless never speed it again.
 */
export async function renderPitchPreservedVoiceSpeed(input: {
  readonly losslessAudio: ArrayBuffer;
  readonly speed: number;
}): Promise<ArrayBuffer> {
  const executable = ffmpegPath;
  if (!executable) {
    throw new Error("The voice-speed renderer is unavailable.");
  }

  const args = buildPitchPreservedVoiceSpeedFfmpegArgs(input.speed);

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
    });
    const output: Buffer[] = [];
    let diagnostic = "";
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error("Voice-speed rendering timed out."));
    }, RENDER_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      diagnostic = `${diagnostic}${chunk}`.slice(-MAX_DIAGNOSTIC_LENGTH);
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0 || output.length === 0) {
        fail(
          new Error(
            diagnostic.trim() ||
              `Voice-speed renderer exited with code ${code ?? "unknown"}.`,
          ),
        );
        return;
      }

      const rendered = Buffer.concat(output);
      settled = true;
      clearTimeout(timeout);
      resolve(
        rendered.buffer.slice(
          rendered.byteOffset,
          rendered.byteOffset + rendered.byteLength,
        ),
      );
    });

    child.stdin.on("error", fail);
    child.stdin.end(Buffer.from(input.losslessAudio));
  });
}
