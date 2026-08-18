import { spawnSync } from "node:child_process";

import {
  PER_MEDIA_VIDEO_TRIM_SECTIONS,
  type PerMediaVideoTrimSample,
} from "@/features/preview/video-trim-preview/per-media-video-trim-contract";

export interface ClassifiedTimecodeSection {
  readonly label: string;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly distance: number;
}

function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.replace("#", "");
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function classifyRgb(r: number, g: number, b: number): ClassifiedTimecodeSection {
  let best: (typeof PER_MEDIA_VIDEO_TRIM_SECTIONS)[number] =
    PER_MEDIA_VIDEO_TRIM_SECTIONS[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const section of PER_MEDIA_VIDEO_TRIM_SECTIONS) {
    const expected = parseHex(section.color);
    const distance =
      (r - expected.r) ** 2 + (g - expected.g) ** 2 + (b - expected.b) ** 2;
    if (distance < bestDistance) {
      best = section;
      bestDistance = distance;
    }
  }
  return { label: best.label, r, g, b, distance: bestDistance };
}

export function samplePngCenterRgb(
  ffmpegExecutable: string,
  pngPath: string,
): { r: number; g: number; b: number } | null {
  const result = spawnSync(
    ffmpegExecutable,
    [
      "-v",
      "error",
      "-i",
      pngPath,
      "-vf",
      "scale=1080:1920,crop=8:8:160:360",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { encoding: "buffer" },
  );
  const bytes = result.stdout;
  if (!bytes || bytes.length < 3) {
    return null;
  }
  return { r: bytes[0]!, g: bytes[1]!, b: bytes[2]! };
}

export function samplePngCaptionBandLuma(
  ffmpegExecutable: string,
  pngPath: string,
): { r: number; g: number; b: number } | null {
  const result = spawnSync(
    ffmpegExecutable,
    [
      "-v",
      "error",
      "-i",
      pngPath,
      "-vf",
      "scale=1080:1920,crop=80:40:200:1680",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { encoding: "buffer" },
  );
  const bytes = result.stdout;
  if (!bytes || bytes.length < 3) {
    return null;
  }
  return { r: bytes[0]!, g: bytes[1]!, b: bytes[2]! };
}

export function captionBandLooksOpaqueBlack(rgb: { r: number; g: number; b: number }): boolean {
  return rgb.r < 28 && rgb.g < 28 && rgb.b < 28;
}

export function labelsAgree(
  actual: string,
  sample: Pick<PerMediaVideoTrimSample, "expectedLabel">,
): boolean {
  return actual === sample.expectedLabel;
}
