/**
 * Prompt 6 matched-timestamp comparison for Preview / Browser / Headless frames.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS } from "@/features/preview/runtime-parity/preview-runtime-parity-integrated-timestamps";

const ARTIFACT_DIR = join(process.cwd(), ".tmp/preview-runtime-parity");

function sampleCenterRgb(
  ffmpeg: string,
  path: string,
): { r: number; g: number; b: number } | null {
  if (!existsSync(path)) return null;
  const result = spawnSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      "crop=iw/3:ih/3:(iw-iw/3)/2:(ih-ih/3)/2,scale=1:1",
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
  if (!bytes || bytes.length < 3) return null;
  return { r: bytes[0]!, g: bytes[1]!, b: bytes[2]! };
}

function classifyColor(rgb: { r: number; g: number; b: number } | null): string {
  if (!rgb) return "missing";
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  if (max < 18) return "black";
  if (r > 140 && g < 80 && b < 90) return "red-a";
  if (g > 100 && r < 90 && b < 110) return "green-b";
  if (b > 130 && r < 90 && g < 120) return "blue-c";
  if (r > 160 && g > 70 && g < 160 && b < 70) return "orange-p";
  if (r > 80 && b > 140 && g < 110) return "purple-q";
  return `mixed:${r},${g},${b}`;
}

function expectedColor(mediaId: string | null, phase: string): string[] {
  if (phase === "terminal-hidden") return ["black"];
  if (phase === "brand-sting" || phase === "brand-sting-last-visible") {
    return ["black", "mixed"];
  }
  if (phase.includes("transition")) return ["red-a", "green-b", "blue-c", "orange-p", "mixed"];
  if (!mediaId) return ["mixed", "black"];
  if (mediaId.includes("video-a")) return ["red-a", "mixed"];
  if (mediaId.includes("video-b")) return ["green-b", "mixed"];
  if (mediaId.includes("video-c")) return ["blue-c", "mixed"];
  if (mediaId.includes("image-p")) return ["orange-p", "purple-q", "mixed"];
  if (mediaId.includes("image-q")) return ["purple-q", "mixed"];
  return ["mixed"];
}

function classesAgree(left: string, right: string): boolean {
  if (left === "missing" || right === "missing") return false;
  if (left === right) return true;
  return left.startsWith("mixed") || right.startsWith("mixed");
}

function main(): void {
  const ffmpeg = resolveNativeFfmpegBinaries();
  const rows: Record<string, unknown>[] = [];
  let failures = 0;
  if (!ffmpeg.ok) {
    writeFileSync(
      join(ARTIFACT_DIR, "prompt6b-matched-timestamp-matrix.json"),
      `${JSON.stringify({ ok: false, blocker: ffmpeg.message }, null, 2)}\n`,
    );
    console.log(`MATRIX: blocked (${ffmpeg.message})`);
    return;
  }

  const studio = existsSync(join(ARTIFACT_DIR, "prompt6b-integrated-cert.json"))
    ? JSON.parse(readFileSync(join(ARTIFACT_DIR, "prompt6b-integrated-cert.json"), "utf8"))
    : null;
  const previewFrames = studio?.studio?.previewFrames ?? {};

  for (const sample of PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS) {
    const previewPath = join(ARTIFACT_DIR, `prompt6b-preview-${sample.id}.png`);
    const browserPath = join(ARTIFACT_DIR, `prompt6b-browser-${sample.id}.png`);
    const headlessPath = join(ARTIFACT_DIR, `prompt6b-headless-${sample.id}.png`);
    const previewRgb = sampleCenterRgb(ffmpeg.ffmpegExecutable, previewPath);
    const browserRgb = sampleCenterRgb(ffmpeg.ffmpegExecutable, browserPath);
    const headlessRgb = sampleCenterRgb(ffmpeg.ffmpegExecutable, headlessPath);
    const previewClass = classifyColor(previewRgb);
    const browserClass = classifyColor(browserRgb);
    const headlessClass = classifyColor(headlessRgb);
    const allowed = expectedColor(sample.expectedMediaId, sample.phase);
    const previewHud = previewFrames[sample.id] ?? null;
    const mediaOk =
      allowed.some((entry) => previewClass.startsWith(entry)) &&
      allowed.some((entry) => browserClass.startsWith(entry)) &&
      allowed.some((entry) => headlessClass.startsWith(entry));
    const encodedAgree = classesAgree(browserClass, headlessClass);
    const laterSceneOk =
      sample.ms < 9000 ||
      sample.phase.includes("brand-sting") ||
      sample.phase.includes("terminal") ||
      (typeof previewHud?.activeSceneId === "string" &&
        !previewHud.activeSceneId.includes("parity-scene-three-transition"));
    const present =
      existsSync(previewPath) && existsSync(browserPath) && existsSync(headlessPath);
    const rowOk = present && mediaOk && encodedAgree && laterSceneOk;
    if (!rowOk) failures += 1;
    rows.push({
      id: sample.id,
      ms: sample.ms,
      expectedMediaId: sample.expectedMediaId,
      phase: sample.phase,
      previewClass,
      browserClass,
      headlessClass,
      present,
      mediaOk,
      encodedAgree,
      laterSceneOk,
      inspectionActive: previewHud?.inspectionActive ?? null,
      activeSceneId: previewHud?.activeSceneId ?? null,
      captionBounds: previewHud?.captionBounds ?? null,
      ctaBounds: previewHud?.ctaBounds ?? null,
    });
  }

  const result = {
    ok: failures === 0,
    failures,
    rows,
    browserArtifact: existsSync(join(ARTIFACT_DIR, "prompt6b-browser-1080.webm")),
    headlessArtifact: existsSync(join(ARTIFACT_DIR, "prompt6b-headless-1080.webm")),
    nearestFramePolicy: "round(sampleMs / (1000/30)) * (1000/30) at 30 fps",
  };
  writeFileSync(
    join(ARTIFACT_DIR, "prompt6b-matched-timestamp-matrix.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(`MATRIX: ${result.ok ? "ok" : "failed"} (${failures} timestamp issues)`);
}

main();
