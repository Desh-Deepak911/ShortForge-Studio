/**
 * Worker-owned frame-stream contract for PNG image2pipe encode.
 * No duration-proportional in-memory frame arrays.
 */

export interface HeadlessStreamFrameMetrics {
  readonly totalFramesProduced: number;
  readonly totalFramesAccepted: number;
  readonly totalFrameBytesStreamed: number;
  readonly peakSingleFrameBytes: number;
  readonly peakWritableBufferedBytes: number;
  readonly chromiumRenderElapsedMs: number | null;
  readonly ffmpegEncodeElapsedMs: number | null;
  readonly overlappedRenderEncodeElapsedMs: number | null;
}

export interface HeadlessAcceptedStreamFrame {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly pngBytes: Uint8Array;
}

export type HeadlessFrameStreamRejectReason =
  | "malformed_png"
  | "wrong_dimensions"
  | "frame_too_large"
  | "missing_frame"
  | "duplicate_frame"
  | "reordered_frame"
  | "extra_frame"
  | "aborted"
  | "epipe"
  | "write_timeout"
  | "ffmpeg_early_exit"
  | "stdin_closed";

export interface HeadlessFrameStreamLimits {
  readonly expectedFrameCount: number;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly maxSingleFrameBytes: number;
  /** Logical total streamed-byte ceiling (not disk-resident PNG aggregate). */
  readonly maxTotalStreamedFrameBytes: number;
  /** Max bytes waiting in the writable high-water buffer. */
  readonly maxWritableBufferedBytes: number;
  readonly writeDrainTimeoutMs: number;
}
