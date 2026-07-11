/**
 * FFmpeg poison / failure classification (Sprint 6D).
 */

export type ExportFfmpegFailureCode =
  | "FFMPEG_WORKER_ABORTED"
  | "FFMPEG_OUT_OF_MEMORY"
  | "FFMPEG_COMMAND_FAILED"
  | "FFMPEG_OUTPUT_MISSING"
  | "FFMPEG_RUNTIME_POISONED"
  | "FFMPEG_CANCELLED";

export function classifyExportFfmpegFailure(
  error: unknown,
): ExportFfmpegFailureCode {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error ?? "");
  const lower = message.toLowerCase();

  if (
    lower.includes("abort") ||
    lower.includes("terminated") ||
    lower.includes("worker")
  ) {
    return "FFMPEG_WORKER_ABORTED";
  }
  if (
    lower.includes("out of memory") ||
    lower.includes("oom") ||
    lower.includes("memory access out of bounds") ||
    lower.includes("cannot enlarge memory")
  ) {
    return "FFMPEG_OUT_OF_MEMORY";
  }
  if (
    lower.includes("poison") ||
    lower.includes("runtime poisoned")
  ) {
    return "FFMPEG_RUNTIME_POISONED";
  }
  if (
    lower.includes("missing") ||
    lower.includes("not found") ||
    lower.includes("no such file") ||
    lower.includes("output")
  ) {
    return "FFMPEG_OUTPUT_MISSING";
  }
  if (lower.includes("cancel")) {
    return "FFMPEG_CANCELLED";
  }
  return "FFMPEG_COMMAND_FAILED";
}

export function isExportFfmpegPoisonFailure(code: ExportFfmpegFailureCode): boolean {
  return (
    code === "FFMPEG_WORKER_ABORTED" ||
    code === "FFMPEG_OUT_OF_MEMORY" ||
    code === "FFMPEG_RUNTIME_POISONED"
  );
}
