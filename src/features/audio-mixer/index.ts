export type {
  MasterMixSettings,
  MusicMixSettings,
  ProjectAudioMixerSettings,
  ResolvedAudioMixSettings,
  VoiceMixSettings,
} from "./audio-mixer.types";

export {
  DEFAULT_DUCKING_STRENGTH,
  DEFAULT_FADE_IN_MS,
  DEFAULT_FADE_OUT_MS,
  DEFAULT_MASTER_MIX_VOLUME,
  DEFAULT_MUSIC_MIX_VOLUME,
  DEFAULT_VOICE_MIX_VOLUME,
  createDefaultAudioMixerSettings,
} from "./audio-mixer.defaults";

export { resolveAudioMixerSettings, applyStoryAudioMixer } from "./audio-mixer.utils";
export {
  clampHtmlMediaElementVolume,
  formatDuckingStrengthPercent,
  formatMixerVolumePercent,
  resolveMusicDuckingMultiplier,
  resolveMusicStemGain,
  resolveVoiceStemGain,
} from "./audio-mixer.utils";

export {
  buildExportFfmpegPeakLimiterFilterChain,
  configurePreviewPeakProtectionCompressor,
  EXPORT_FFMPEG_PEAK_LIMITER_FILTER,
  PEAK_PROTECTION_GAIN_THRESHOLD,
  PEAK_PROTECTION_OUTPUT_CEILING,
  resolvePeakProtectionFromMixer,
  resolvePreviewSafeVoiceOutputGain,
  shouldApplyPeakProtection,
} from "./audio-mixer.peak-protection.utils";

export { default as AudioMixerPanel } from "./AudioMixerPanel";
export { default as AudioMixerSlider } from "./AudioMixerSlider";
