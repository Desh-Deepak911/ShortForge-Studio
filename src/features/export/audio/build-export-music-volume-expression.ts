/**
 * Shared FFmpeg music volume expression (Sprint 11E 2G.24D).
 * Mirrors `resolveExportMusicEnvelopeGainAtSec` including duck release ramp.
 */

import {
  EXPORT_DUCKING_RELEASE_MS,
  resolveExportMusicEnvelopeGainAtSec,
  type ExportMusicEnvelopeInput,
} from "@/features/export/utils/export-music-envelope.utils";

function formatSec(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function formatGain(gain: number): string {
  return gain.toFixed(4);
}

function duckedGain(musicGain: number, duckingStrength: number): number {
  return Math.max(0, musicGain * duckingStrength);
}

/**
 * Closed-form FFmpeg `volume` expression matching the canonical envelope authority.
 */
export function buildExportMusicVolumeExpression(
  settings: ExportMusicEnvelopeInput,
): string {
  const durationSec = formatSec(settings.exportDurationMs);
  const full = formatGain(settings.musicGain);
  const voiceDurSec = formatSec(settings.voiceoverDurationSec * 1000);
  const fadeInSec = formatSec(settings.fadeInSec * 1000);
  const fadeOutSec = formatSec(settings.fadeOutSec * 1000);
  const rampSec = formatSec(EXPORT_DUCKING_RELEASE_MS);

  let base = full;
  if (
    settings.applyDucking &&
    settings.duckingEnabled &&
    settings.voiceoverDurationSec > 0
  ) {
    const ducked = formatGain(
      duckedGain(settings.musicGain, settings.duckingStrength),
    );
    const releaseStartSec = formatSec(
      Math.max(0, settings.voiceoverDurationSec * 1000 - EXPORT_DUCKING_RELEASE_MS),
    );
    base = `if(lt(t\\,${releaseStartSec})\\,${ducked}\\,if(lt(t\\,${voiceDurSec})\\,${ducked}+(${full}-${ducked})*((t-${releaseStartSec})/${rampSec})\\,${full}))`;
  }

  const fadeIn =
    settings.fadeIn && settings.fadeInSec > 0
      ? `*if(lt(t\\,${fadeInSec})\\,t/${fadeInSec}\\,1)`
      : "";

  const fadeOutStartMs =
    settings.exportDurationMs -
    (settings.fadeOut && settings.fadeOutSec > 0 ? settings.fadeOutSec * 1000 : 0);
  const fadeOut =
    settings.fadeOut && settings.fadeOutSec > 0 && fadeOutStartMs > 0
      ? `*if(gt(t\\,${formatSec(fadeOutStartMs)})\\,(${durationSec}-t)/${fadeOutSec}\\,1)`
      : "";

  return `${base}${fadeIn}${fadeOut}`;
}

/** Sample canonical envelope at a checkpoint (parity fixtures). */
export function sampleExportMusicVolumeExpressionGain(
  settings: ExportMusicEnvelopeInput,
  timeSec: number,
): number {
  return resolveExportMusicEnvelopeGainAtSec(settings, timeSec);
}
