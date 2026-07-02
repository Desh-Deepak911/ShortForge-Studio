import {
  MAX_MIX_VOLUME,
  MIN_MIX_VOLUME,
} from "@/features/audio-mixer/audio-mixer.defaults";
import { resolvePeakProtectionFromMixer, resolvePreviewSafeVoiceOutputGain } from "@/features/audio-mixer/audio-mixer.peak-protection.utils";
import {
  resolveAudioMixerSettings,
  resolveMusicStemGain,
  resolveVoiceStemGain,
} from "@/features/audio-mixer/audio-mixer.utils";
import type { FootieScript } from "@/features/story/types";

/** Preview voice stem gain — matches export: `voice.volume * master.volume`. */
export function resolvePreviewVoiceStemGain(
  script: FootieScript | null | undefined,
): number {
  if (!script) {
    return 1;
  }

  const stemGain = resolveVoiceStemGain(resolveAudioMixerSettings(script));
  return Math.min(MAX_MIX_VOLUME, Math.max(MIN_MIX_VOLUME, stemGain));
}

/**
 * Element `volume` for the direct HTMLMediaElement path (gain <= 1.0, no Web Audio route).
 * Values above 1.0 must use a GainNode instead.
 */
export function resolvePreviewVoiceElementVolume(stemGain: number): number {
  return Math.min(1, Math.max(0, stemGain));
}

/** True when preview should limit peaks on the voice Web Audio route. */
export function resolvePreviewPeakProtectionActive(
  script: FootieScript | null | undefined,
): boolean {
  if (!script) {
    return false;
  }

  const mixer = resolveAudioMixerSettings(script);
  return resolvePeakProtectionFromMixer(
    mixer,
    resolveVoiceStemGain(mixer),
    resolveMusicStemGain(mixer),
  );
}

/** Reports preview voice stem gain and whether a safe output ceiling applies. */
export function resolvePreviewVoiceSafeOutputGain(
  script: FootieScript | null | undefined,
) {
  const stemGain = resolvePreviewVoiceStemGain(script);
  return resolvePreviewSafeVoiceOutputGain(
    stemGain,
    resolvePreviewPeakProtectionActive(script),
  );
}

/** True when preview must route narration through Web Audio GainNode. */
export function shouldRoutePreviewVoiceThroughGainNode(
  stemGain: number,
  hasGainRoute: boolean,
  applyPeakProtection = false,
): boolean {
  return hasGainRoute || stemGain > 1 || applyPeakProtection;
}

/** Legacy helper — element volume only; use stem gain + gain node for boost. */
export function resolvePreviewVoicePlaybackVolume(
  script: FootieScript | null | undefined,
): number {
  return resolvePreviewVoiceElementVolume(resolvePreviewVoiceStemGain(script));
}
