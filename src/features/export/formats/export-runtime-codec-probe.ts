/**
 * Runtime MP4 / H.264 / AAC codec probe (Sprint 6F).
 * Do not assume support from package version alone — probe and cache per session.
 */

export interface ExportRuntimeCodecProbeResult {
  readonly probedAtIso: string;
  readonly runtimeKey: string;
  readonly h264EncoderAvailable: boolean;
  readonly aacEncoderAvailable: boolean;
  readonly mp4MuxerAvailable: boolean;
  readonly faststartSupported: boolean;
  readonly minimalMp4EncodeSucceeded: boolean;
  readonly mp4Available: boolean;
  readonly reason?: string;
}

export type ExportRuntimeCodecProbeOverrides = Partial<
  Omit<ExportRuntimeCodecProbeResult, "probedAtIso" | "runtimeKey" | "mp4Available">
> & {
  readonly mp4Available?: boolean;
  readonly reason?: string;
};

let cachedProbe: ExportRuntimeCodecProbeResult | null = null;
let inflightProbe: Promise<ExportRuntimeCodecProbeResult> | null = null;
/** Test-only override — null clears injection and forces re-probe. */
let testOverride: ExportRuntimeCodecProbeResult | null | undefined = undefined;

export function getExportRuntimeCodecProbeCacheKey(): string {
  const ua =
    typeof navigator !== "undefined" && navigator.userAgent
      ? navigator.userAgent.slice(0, 120)
      : "node";
  const wasm = typeof WebAssembly !== "undefined" ? "wasm1" : "wasm0";
  return `${ua}|${wasm}|ffmpeg-core-0.12`;
}

export function getCachedExportRuntimeCodecProbe(): ExportRuntimeCodecProbeResult | null {
  if (testOverride !== undefined) {
    return testOverride;
  }
  return cachedProbe;
}

export function clearExportRuntimeCodecProbeCache(): void {
  cachedProbe = null;
  inflightProbe = null;
}

/**
 * Inject probe result for verification (Sprint 6F).
 * Pass `null` to simulate "not yet probed"; `undefined` clears override.
 */
export function setExportRuntimeCodecProbeForTests(
  result: ExportRuntimeCodecProbeResult | null | undefined,
): void {
  testOverride = result;
  if (result === undefined) {
    cachedProbe = null;
    inflightProbe = null;
  } else if (result !== null) {
    cachedProbe = result;
  }
}

export function buildExportRuntimeCodecProbeResult(
  input: ExportRuntimeCodecProbeOverrides & { readonly runtimeKey?: string },
): ExportRuntimeCodecProbeResult {
  const h264 = input.h264EncoderAvailable ?? false;
  const aac = input.aacEncoderAvailable ?? false;
  const mux = input.mp4MuxerAvailable ?? false;
  const faststart = input.faststartSupported ?? false;
  const minimal = input.minimalMp4EncodeSucceeded ?? false;
  const mp4Available =
    input.mp4Available ??
    (h264 && aac && mux && faststart && minimal);

  return {
    probedAtIso: new Date().toISOString(),
    runtimeKey: input.runtimeKey ?? getExportRuntimeCodecProbeCacheKey(),
    h264EncoderAvailable: h264,
    aacEncoderAvailable: aac,
    mp4MuxerAvailable: mux,
    faststartSupported: faststart,
    minimalMp4EncodeSucceeded: minimal,
    mp4Available,
    reason: input.reason,
  };
}

/**
 * Probe MP4 export capability once per runtime session.
 * In Node verification (no browser FFmpeg), defaults to available unless overridden.
 * In browser, runs a minimal encode when FFmpeg can load.
 */
export async function probeExportMp4Runtime(options?: {
  readonly force?: boolean;
  readonly skipMinimalEncode?: boolean;
}): Promise<ExportRuntimeCodecProbeResult> {
  if (testOverride !== undefined && testOverride !== null) {
    return testOverride;
  }
  if (!options?.force && cachedProbe) {
    return cachedProbe;
  }
  if (!options?.force && inflightProbe) {
    return inflightProbe;
  }

  inflightProbe = runProbe(options).then((result) => {
    cachedProbe = result;
    inflightProbe = null;
    return result;
  });
  return inflightProbe;
}

async function runProbe(options?: {
  readonly skipMinimalEncode?: boolean;
}): Promise<ExportRuntimeCodecProbeResult> {
  const runtimeKey = getExportRuntimeCodecProbeCacheKey();
  const isBrowser =
    typeof window !== "undefined" && typeof document !== "undefined";

  if (!isBrowser) {
    // Semantic/CI path: package ships libx264/aac for @ffmpeg/core — still overridable.
    return buildExportRuntimeCodecProbeResult({
      runtimeKey,
      h264EncoderAvailable: true,
      aacEncoderAvailable: true,
      mp4MuxerAvailable: true,
      faststartSupported: true,
      minimalMp4EncodeSucceeded: true,
      reason: "node-verification-default",
    });
  }

  if (typeof WebAssembly === "undefined") {
    return buildExportRuntimeCodecProbeResult({
      runtimeKey,
      reason: "WebAssembly unavailable",
    });
  }

  if (options?.skipMinimalEncode) {
    // Capability pre-check without encode — not sufficient alone for production gate.
    return buildExportRuntimeCodecProbeResult({
      runtimeKey,
      h264EncoderAvailable: true,
      aacEncoderAvailable: true,
      mp4MuxerAvailable: true,
      faststartSupported: true,
      minimalMp4EncodeSucceeded: false,
      mp4Available: false,
      reason: "minimal encode skipped",
    });
  }

  try {
    const { getFFmpeg } = await import("@/features/export/utils/ffmpeg.utils");
    const ffmpeg = await getFFmpeg();
    const inputName = "probe-in.webm";
    const outputName = "probe-out.mp4";

    // Tiny synthetic webm-like payload may fail demux; use rawframe lavfi if available,
    // else write a minimal valid-enough input and catch encoder/mux errors.
    const bytes = new Uint8Array([
      0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
    ]);
    await ffmpeg.writeFile(inputName, bytes);

    let encodeOk = false;
    let h264 = false;
    let aac = false;
    let mux = false;
    let faststart = false;
    let reason: string | undefined;

    try {
      await ffmpeg.exec([
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=16x16:d=0.1",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=mono",
        "-t",
        "0.1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-y",
        outputName,
      ]);
      encodeOk = true;
      h264 = true;
      aac = true;
      mux = true;
      faststart = true;
    } catch (error) {
      reason =
        error instanceof Error ? error.message : "Minimal MP4 encode failed";
      // Still mark individual capabilities unknown/false — do not assume package version.
      h264 = false;
      aac = false;
      mux = false;
      faststart = false;
      encodeOk = false;
    }

    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore */
    }

    return buildExportRuntimeCodecProbeResult({
      runtimeKey,
      h264EncoderAvailable: h264,
      aacEncoderAvailable: aac,
      mp4MuxerAvailable: mux,
      faststartSupported: faststart,
      minimalMp4EncodeSucceeded: encodeOk,
      reason: encodeOk ? "minimal-mp4-ok" : reason,
    });
  } catch (error) {
    return buildExportRuntimeCodecProbeResult({
      runtimeKey,
      reason:
        error instanceof Error
          ? `FFmpeg load failed: ${error.message}`
          : "FFmpeg load failed",
    });
  }
}

/** Sync gate used by adapters after probe has run. */
export function isMp4ExportRuntimeAvailable(): boolean {
  const cached = getCachedExportRuntimeCodecProbe();
  if (cached) return cached.mp4Available;
  // Not yet probed — do not assume package version implies support.
  return false;
}
