/**
 * Export audio public API (Sprint 6E).
 */

export type {
  ExportAudioEndPolicy,
  ExportAudioFilterGraph,
  ExportAudioOutputCodec,
  ExportPreparedAudioMode,
  PreparedAudioTrack,
  PreparedExportAudio,
  ProbedExportAudioDurations,
} from "./export-audio.types";

export {
  EXPORT_AUDIO_DURATION_PROBE_TOLERANCE_MS,
  EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS,
} from "./export-audio.types";

export {
  assertExportDoesNotApplyVoiceSpeed,
  assertFilterGraphForbidsVoiceSpeed,
  resolveExportAudioEndPolicy,
} from "./resolve-export-audio-end-policy";

export {
  buildExportAudioFilterGraph,
  EXPORT_AUDIO_TARGET_CHANNELS,
  EXPORT_AUDIO_TARGET_SAMPLE_RATE_HZ,
  resolveClampedMusicFadeMs,
} from "./build-export-audio-filter";

export {
  prepareExportAudio,
  validatePreparedExportAudio,
  type PrepareExportAudioOptions,
} from "./prepare-export-audio";
