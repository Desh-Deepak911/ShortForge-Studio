/**
 * Export audio preparation types (Sprint 6E).
 * Semantic config stays on ExportManifest.audio; this is runtime-ready metadata.
 */

export type ExportPreparedAudioMode = "silent" | "voice" | "voice-with-music";

export type ExportAudioOutputCodec = "opus" | "aac" | "none";

export interface PreparedAudioTrack {
  readonly source: string;
  readonly sourceDurationMs: number;
  readonly targetDurationMs: number;
  readonly volume: number;
  /** Model A: generated file already has TTS speed; never apply atempo. */
  readonly generatedPlaybackRate: 1;
  readonly sourceVoiceSpeed: number;
  readonly masteringProfile?: "generated_speech_v1";
}

export interface PreparedExportAudio {
  readonly mode: ExportPreparedAudioMode;
  /** Canonical project end — always manifest.project.renderDurationMs. */
  readonly durationMs: number;
  readonly voiceover: PreparedAudioTrack | null;
  readonly music: PreparedAudioTrack | null;
  readonly outputCodec: ExportAudioOutputCodec;
  readonly endPolicy: ExportAudioEndPolicy;
  readonly sourceVideoAudioMuted: true;
}

export interface ProbedExportAudioDurations {
  readonly voiceoverProbeMs: number | null;
  readonly musicProbeMs: number | null;
}

export interface ExportAudioEndPolicy {
  readonly projectEndMs: number;
  readonly voiceover: {
    readonly action: "none" | "pad" | "block";
    readonly padDurationMs?: number;
    readonly detail?: string;
  };
  readonly music: {
    readonly action: "none" | "loop-and-trim" | "trim" | "pad";
    readonly detail?: string;
  };
}

/** Tolerance when voiceover is slightly longer than project (ms). */
export const EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS = 150;

/** Tolerance when metadata duration disagrees with probe (ms). */
export const EXPORT_AUDIO_DURATION_PROBE_TOLERANCE_MS = 500;

export interface ExportAudioFilterGraph {
  readonly description: readonly string[];
  /** True when graph must never include atempo / asetrate speed changes. */
  readonly forbidsVoiceSpeedFilters: true;
  readonly sampleRateHz: 48000;
  readonly channels: 2;
  readonly projectEndMs: number;
}
