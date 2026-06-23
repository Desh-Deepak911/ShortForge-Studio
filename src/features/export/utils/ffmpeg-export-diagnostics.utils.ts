/** Browser-only FFmpeg audio merge diagnostics for export failures. */

export interface FfmpegInputFileDiagnostics {
  filename: string;
  mimeType: string;
  size: number;
}

export interface FfmpegAudioMergeFailureDiagnostics {
  exitCode?: number;
  command: string;
  video: FfmpegInputFileDiagnostics;
  voiceover: FfmpegInputFileDiagnostics | null;
  backgroundMusic: FfmpegInputFileDiagnostics | null;
  stdout: string;
  stderr: string;
}

type FfmpegLogEvent = {
  type: string;
  message: string;
};

export interface FfmpegLogCapture {
  stdout: string;
  stderr: string;
  handleLog: (event: FfmpegLogEvent) => void;
}

export function describeFfmpegInputBlob(filename: string, blob: Blob): FfmpegInputFileDiagnostics {
  return {
    filename,
    mimeType: blob.type || "(empty)",
    size: blob.size,
  };
}

export function describeNormalizedFfmpegInput(
  filename: string,
  normalized: { mimeType: string; blob: Blob },
): FfmpegInputFileDiagnostics {
  return {
    filename,
    mimeType: normalized.mimeType,
    size: normalized.blob.size,
  };
}

/** Formats the argv array passed to `ffmpeg.exec()` as a single shell-like command. */
export function formatFfmpegExecCommand(args: readonly string[]): string {
  return `ffmpeg ${args.join(" ")}`;
}

/** Accumulates FFmpeg log events without truncation. */
export function createFfmpegLogCapture(): FfmpegLogCapture {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];

  const handleLog = ({ type, message }: FfmpegLogEvent) => {
    const normalizedType = type.toLowerCase();

    if (normalizedType === "stdout") {
      stdoutParts.push(message);
      return;
    }

    if (normalizedType === "stderr") {
      stderrParts.push(message);
      return;
    }

    // ffmpeg.wasm may label diagnostic output with other type strings.
    stderrParts.push(`[${type}] ${message}`);
  };

  return {
    get stdout() {
      return stdoutParts.join("");
    },
    get stderr() {
      return stderrParts.join("");
    },
    handleLog,
  };
}

/** Writes a complete, untruncated diagnostic dump when export audio merge fails. */
export function logFfmpegAudioMergeFailure(diagnostics: FfmpegAudioMergeFailureDiagnostics): void {
  const header = "[FootieBitz Export] FFmpeg audio merge failed";

  console.error(header);
  console.error("Exit code:", diagnostics.exitCode ?? "(unknown)");

  console.error("Video input filename:", diagnostics.video.filename);
  console.error("Video MIME type:", diagnostics.video.mimeType);
  console.error("Video size:", diagnostics.video.size);

  if (diagnostics.voiceover) {
    console.error("Voiceover filename:", diagnostics.voiceover.filename);
    console.error("Voiceover MIME type:", diagnostics.voiceover.mimeType);
    console.error("Voiceover size:", diagnostics.voiceover.size);
  } else {
    console.error("Voiceover filename:", "(none)");
    console.error("Voiceover MIME type:", "(none)");
    console.error("Voiceover size:", "(none)");
  }

  if (diagnostics.backgroundMusic) {
    console.error("Background music filename:", diagnostics.backgroundMusic.filename);
    console.error("Background MIME type:", diagnostics.backgroundMusic.mimeType);
    console.error("Background size:", diagnostics.backgroundMusic.size);
  } else {
    console.error("Background music filename:", "(none)");
    console.error("Background MIME type:", "(none)");
    console.error("Background size:", "(none)");
  }

  console.error("FFmpeg command:", diagnostics.command);
  console.error("FFmpeg stderr:\n", diagnostics.stderr);
  console.error("FFmpeg stdout:\n", diagnostics.stdout);
}
