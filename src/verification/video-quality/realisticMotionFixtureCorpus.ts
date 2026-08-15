/**
 * Provider-free realistic-motion fixture corpus for encode-quality audits.
 * Sources are synthetic lavfi compositions — never downloaded football footage.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

export const REALISTIC_MOTION_FIXTURE_DIR = join(
  process.cwd(),
  ".tmp/realistic-motion-fixtures",
);

export type RealisticMotionFixtureId =
  | "rapid_horizontal_pan"
  | "slower_camera_tracking"
  | "fine_grass_texture"
  | "dense_crowd_detail"
  | "shirt_edge_numbers"
  | "confetti_particles"
  | "low_light_gradient"
  | "bright_stadium_lights"
  | "rapid_scene_cuts"
  | "static_detailed_control"
  | "native_vertical_motion"
  | "native_vertical_4k"
  | "landscape_motion";

export interface RealisticMotionFixtureSpec {
  readonly id: RealisticMotionFixtureId;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationSec: number;
  /** lavfi graph that produces the source video. */
  readonly lavfi: string;
  readonly bitrateArg: string;
}

export interface RealisticMotionFixtureArtifact {
  readonly id: RealisticMotionFixtureId;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationSec: number;
  readonly codec: string;
  readonly pixelFormat: string;
  readonly bitrateArg: string;
  readonly byteLength: number;
  readonly sourceDigest: string;
  readonly description: string;
}

/** Short, repeatable corpus covering Prompt 5 motion/detail classes. */
export const REALISTIC_MOTION_FIXTURE_SPECS: readonly RealisticMotionFixtureSpec[] =
  [
    {
      id: "rapid_horizontal_pan",
      description: "Rapid horizontal camera pan across high-frequency pattern",
      width: 3840,
      height: 2160,
      fps: 30,
      durationSec: 2,
      bitrateArg: "40M",
      lavfi:
        "testsrc2=size=4480x2160:rate=30:duration=2,format=yuv420p,crop=3840:2160:'min(200\\,n)*3':0",
    },
    {
      id: "slower_camera_tracking",
      description: "Slower tracking pan with continuous detail",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 2,
      bitrateArg: "16M",
      lavfi:
        "testsrc2=size=2400x1080:rate=30:duration=2,format=yuv420p,crop=1920:1080:'min(400\\,n)*1':0",
    },
    {
      id: "fine_grass_texture",
      description: "Fine grass-like high-frequency green texture",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 1.5,
      bitrateArg: "20M",
      lavfi:
        "color=c=0x2f6b3a:s=1920x1080:r=30:d=1.5,noise=alls=28:allf=t+u,format=yuv420p",
    },
    {
      id: "dense_crowd_detail",
      description: "Dense crowd-like high-frequency checker noise field",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 1.5,
      bitrateArg: "20M",
      lavfi:
        "testsrc2=size=1920x1080:rate=30:duration=1.5,format=yuv420p,eq=contrast=1.4:saturation=1.2",
    },
    {
      id: "shirt_edge_numbers",
      description: "Moving shirt-like edges and high-contrast numbers",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 2,
      bitrateArg: "16M",
      lavfi:
        "color=c=0x1a5c2e:s=1920x1080:r=30:d=2[bg];color=c=0x0b3d91:s=380x480:r=30:d=2,drawbox=x=0:y=0:w=380:h=480:color=white@1:t=12,drawbox=x=140:y=160:w=100:h=160:color=white@1:t=fill[shirt];[bg][shirt]overlay=x='200+n*4':y=300,format=yuv420p",
    },
    {
      id: "confetti_particles",
      description: "Confetti / particle-like motion over pitch green",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 1.5,
      bitrateArg: "16M",
      lavfi:
        "color=c=0x2f6b3a:s=1920x1080:r=30:d=1.5,noise=alls=40:allf=t,format=yuv420p",
    },
    {
      id: "low_light_gradient",
      description: "Low-light stadium gradient with subtle noise",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 1.5,
      bitrateArg: "12M",
      lavfi:
        "color=c=0x0a1018:s=1920x1080:r=30:d=1.5,noise=alls=6:allf=t,format=yuv420p",
    },
    {
      id: "bright_stadium_lights",
      description: "Bright stadium-light gradients and clipped highlights",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 1.5,
      bitrateArg: "16M",
      lavfi:
        "color=c=0xfff2c8:s=1920x1080:r=30:d=1.5,format=yuv420p",
    },
    {
      id: "rapid_scene_cuts",
      description: "Rapid hard cuts between distinct patterns",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 2,
      bitrateArg: "16M",
      lavfi:
        "testsrc2=size=1920x1080:rate=30:duration=0.5[a];smptehdbars=size=1920x1080:rate=30:duration=0.5[b];testsrc=size=1920x1080:rate=30:duration=0.5[c];rgbtestsrc=size=1920x1080:rate=30:duration=0.5[d];[a][b][c][d]concat=n=4:v=1:a=0,format=yuv420p",
    },
    {
      id: "static_detailed_control",
      description: "Static detailed control frame (no motion)",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSec: 1,
      bitrateArg: "12M",
      lavfi:
        "smptehdbars=size=1920x1080:rate=30:duration=1,format=yuv420p",
    },
    {
      id: "native_vertical_motion",
      description: "Native vertical 1080×1920 moving detail",
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: 2,
      bitrateArg: "16M",
      lavfi:
        "testsrc2=size=1080x1920:rate=30:duration=2,format=yuv420p",
    },
    {
      id: "native_vertical_4k",
      description: "Native vertical 2160×3840 moving detail",
      width: 2160,
      height: 3840,
      fps: 30,
      durationSec: 1.5,
      bitrateArg: "40M",
      lavfi:
        "testsrc2=size=2160x3840:rate=30:duration=1.5,format=yuv420p",
    },
    {
      id: "landscape_motion",
      description: "Landscape 4K motion source for crop/zoom matrix",
      width: 3840,
      height: 2160,
      fps: 30,
      durationSec: 2,
      bitrateArg: "40M",
      lavfi:
        "testsrc2=size=3840x2160:rate=30:duration=2,format=yuv420p",
    },
  ];

export type FramingMode = "fill" | "fit" | "fit_with_background";

export interface EncodeAuditCase {
  readonly id: string;
  readonly fixtureId: RealisticMotionFixtureId;
  readonly fitMode: FramingMode;
  readonly zoom: number;
  readonly targetResolution: "720p" | "1080p" | "4k";
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly trimStartMs: number;
  readonly contentDurationMs: number;
  readonly multiScene?: boolean;
  /** Headless end-to-end when true; otherwise encode-probe / ideal-ref only. */
  readonly runHeadlessE2E: boolean;
  readonly browserCandidate: boolean;
}

export const TARGET_PIXELS = {
  "720p": { width: 720, height: 1280 },
  "1080p": { width: 1080, height: 1920 },
  "4k": { width: 2160, height: 3840 },
} as const;

/** Required framing/output matrix (Prompt 5). */
export const ENCODE_AUDIT_CASES: readonly EncodeAuditCase[] = [
  {
    id: "v1080_to_v1080_fill_1x",
    fixtureId: "native_vertical_motion",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: true,
  },
  {
    id: "v4k_to_v4k_fill_1x",
    fixtureId: "native_vertical_4k",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "4k",
    targetWidth: TARGET_PIXELS["4k"].width,
    targetHeight: TARGET_PIXELS["4k"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: false,
  },
  {
    id: "l4k_to_v1080_fill_1x",
    fixtureId: "landscape_motion",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: true,
  },
  {
    id: "l4k_to_v1080_fill_1_25x",
    fixtureId: "landscape_motion",
    fitMode: "fill",
    zoom: 1.25,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: true,
  },
  {
    id: "l4k_to_v4k_fill_1x",
    fixtureId: "landscape_motion",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "4k",
    targetWidth: TARGET_PIXELS["4k"].width,
    targetHeight: TARGET_PIXELS["4k"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: false,
  },
  {
    id: "l4k_to_v4k_fill_1_25x",
    fixtureId: "landscape_motion",
    fitMode: "fill",
    zoom: 1.25,
    targetResolution: "4k",
    targetWidth: TARGET_PIXELS["4k"].width,
    targetHeight: TARGET_PIXELS["4k"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: false,
    browserCandidate: false,
  },
  {
    id: "l1080_to_v1080_fill_1x",
    fixtureId: "slower_camera_tracking",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: true,
  },
  {
    id: "landscape_to_fit",
    fixtureId: "landscape_motion",
    fitMode: "fit",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: true,
  },
  {
    id: "landscape_to_fit_with_background",
    fixtureId: "landscape_motion",
    fitMode: "fit_with_background",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: false,
  },
  {
    id: "trimmed_moving_video",
    fixtureId: "rapid_horizontal_pan",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 500,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: true,
  },
  {
    id: "rapid_cut_multi_scene",
    fixtureId: "rapid_scene_cuts",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 900,
    multiScene: true,
    runHeadlessE2E: true,
    browserCandidate: true,
  },
  {
    id: "grass_texture_1080_fill",
    fixtureId: "fine_grass_texture",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: false,
    browserCandidate: true,
  },
  {
    id: "crowd_detail_1080_fill",
    fixtureId: "dense_crowd_detail",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "1080p",
    targetWidth: TARGET_PIXELS["1080p"].width,
    targetHeight: TARGET_PIXELS["1080p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: false,
    browserCandidate: true,
  },
  {
    id: "shirt_numbers_720_fill",
    fixtureId: "shirt_edge_numbers",
    fitMode: "fill",
    zoom: 1,
    targetResolution: "720p",
    targetWidth: TARGET_PIXELS["720p"].width,
    targetHeight: TARGET_PIXELS["720p"].height,
    trimStartMs: 0,
    contentDurationMs: 600,
    runHeadlessE2E: true,
    browserCandidate: true,
  },
];

function runFfmpeg(ffmpeg: string, args: readonly string[]): void {
  const result = spawnSync(ffmpeg, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg failed (${result.status}): ${args.join(" ")}\n${result.stderr || result.stdout}`,
    );
  }
}

export function ensureRealisticMotionFixtures(ffmpeg: string): {
  readonly artifacts: readonly RealisticMotionFixtureArtifact[];
  readonly byId: Map<RealisticMotionFixtureId, RealisticMotionFixtureArtifact>;
} {
  mkdirSync(REALISTIC_MOTION_FIXTURE_DIR, { recursive: true });
  const artifacts: RealisticMotionFixtureArtifact[] = [];
  const byId = new Map<
    RealisticMotionFixtureId,
    RealisticMotionFixtureArtifact
  >();

  for (const spec of REALISTIC_MOTION_FIXTURE_SPECS) {
    const path = join(REALISTIC_MOTION_FIXTURE_DIR, `${spec.id}.mp4`);
    if (!existsSync(path) || statSync(path).size < 1024) {
      runFfmpeg(ffmpeg, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        spec.lavfi,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        spec.bitrateArg,
        "-movflags",
        "+faststart",
        path,
      ]);
    }
    const bytes = readFileSync(path);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const artifact: RealisticMotionFixtureArtifact = {
      id: spec.id,
      path,
      width: spec.width,
      height: spec.height,
      fps: spec.fps,
      durationSec: spec.durationSec,
      codec: "h264",
      pixelFormat: "yuv420p",
      bitrateArg: spec.bitrateArg,
      byteLength: bytes.length,
      sourceDigest: digest,
      description: spec.description,
    };
    artifacts.push(artifact);
    byId.set(spec.id, artifact);
  }

  writeFileSync(
    join(REALISTIC_MOTION_FIXTURE_DIR, "manifest.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), artifacts }, null, 2)}\n`,
  );

  return { artifacts, byId };
}

export function computeFillFitGeometry(input: {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly fitMode: "fit" | "fill";
  readonly zoom: number;
}): {
  readonly scaledWidth: number;
  readonly scaledHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
} {
  const contain = Math.min(
    input.targetWidth / input.sourceWidth,
    input.targetHeight / input.sourceHeight,
  );
  const cover = Math.max(
    input.targetWidth / input.sourceWidth,
    input.targetHeight / input.sourceHeight,
  );
  const activeScale =
    (input.fitMode === "fit" ? contain : cover) * input.zoom;
  const scaledWidth = Math.max(1, Math.round(input.sourceWidth * activeScale));
  const scaledHeight = Math.max(1, Math.round(input.sourceHeight * activeScale));
  return {
    scaledWidth,
    scaledHeight,
    offsetX: Math.round((input.targetWidth - scaledWidth) / 2),
    offsetY: Math.round((input.targetHeight - scaledHeight) / 2),
  };
}

/**
 * Ideal transformed reference frame — same Fit/Fill/zoom/target as export.
 * No title/caption/branding (text regions are excluded from encoder conclusions).
 */
export function buildIdealTransformedReferenceFrame(input: {
  readonly ffmpeg: string;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly fitMode: FramingMode;
  readonly zoom: number;
  readonly seekSec: number;
}): void {
  const mode = input.fitMode === "fit_with_background" ? "fit" : input.fitMode;
  const geometry = computeFillFitGeometry({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    targetWidth: input.targetWidth,
    targetHeight: input.targetHeight,
    fitMode: mode,
    zoom: input.zoom,
  });

  if (input.fitMode === "fit_with_background") {
    // Approximate Fit-with-background: blurred cover under sharp fit (ideal geometry).
    const cover = computeFillFitGeometry({
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      targetWidth: input.targetWidth,
      targetHeight: input.targetHeight,
      fitMode: "fill",
      zoom: 1,
    });
    const filter = [
      `[0:v]scale=${cover.scaledWidth}:${cover.scaledHeight}:flags=bicubic,boxblur=20:1,crop=${input.targetWidth}:${input.targetHeight}:(iw-ow)/2:(ih-oh)/2[bg]`,
      `[0:v]scale=${geometry.scaledWidth}:${geometry.scaledHeight}:flags=bicubic[fg]`,
      `[bg][fg]overlay=${geometry.offsetX}:${geometry.offsetY}`,
    ].join(";");
    runFfmpeg(input.ffmpeg, [
      "-y",
      "-ss",
      String(input.seekSec),
      "-i",
      input.sourcePath,
      "-filter_complex",
      filter,
      "-frames:v",
      "1",
      input.outputPath,
    ]);
    return;
  }

  const filter = [
    `color=c=black:s=${input.targetWidth}x${input.targetHeight}:r=30[base]`,
    `[0:v]setpts=PTS-STARTPTS,scale=${geometry.scaledWidth}:${geometry.scaledHeight}:flags=bicubic[scaled]`,
    `[base][scaled]overlay=${geometry.offsetX}:${geometry.offsetY}:shortest=1`,
  ].join(";");
  runFfmpeg(input.ffmpeg, [
    "-y",
    "-ss",
    String(input.seekSec),
    "-i",
    input.sourcePath,
    "-filter_complex",
    filter,
    "-frames:v",
    "1",
    input.outputPath,
  ]);
}
