export type {
  AudioEngineSnapshot,
  BackgroundMusicTrack,
  VoiceoverBlobMaterialization,
  VoiceoverTrack,
} from "./types/audio-engine.types";

export type {
  AudioEngineState,
  AudioMix,
  AudioTrack,
  AudioTrackType,
} from "./types/audio.types";

export type { CanonicalVoiceover } from "./utils/canonical-voiceover.utils";

export {
  AudioEngine,
  buildAudioMixFromStory,
  getAudioEngine,
  getBackgroundTrack,
  getMasterAudioDurationMs,
  getVoiceoverTrack,
  resetAudioEngineForTests,
  resolveAudioEngineSnapshot,
  updateBackgroundTrack,
  updateVoiceoverTrack,
} from "./services/audio-engine.service";

export type { VoiceoverTrackUpdate } from "./services/audio-engine.service";

export { useAudioEngine, type UseAudioEngineResult } from "./hooks/useAudioEngine";

export { fetchAudioBlobFromUrl, normalizeVoiceoverBlob } from "./utils/audio-blob.utils";
export { getCanonicalVoiceover } from "./utils/canonical-voiceover.utils";
export {
  classifyAudioSrcType,
  getAudioEngineDebugState,
  isAudioDebugEnabled,
  logAudioEngineState,
  resolveExportAudioSource,
  type AudioEngineDebugState,
} from "./utils/audio-debug.utils";
