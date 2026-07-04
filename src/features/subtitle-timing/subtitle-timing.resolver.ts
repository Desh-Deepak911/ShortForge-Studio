import { getCanonicalVoiceover } from "@/features/audio/utils/canonical-voiceover.utils";
import type { FootieScript } from "@/features/story/types";

import type { SubtitleTimingStrategyId } from "./subtitle-timing.types";

function hasVoiceoverDurationMs(script: FootieScript): boolean {
  return (
    script.voiceoverDurationMs != null &&
    Number.isFinite(script.voiceoverDurationMs) &&
    script.voiceoverDurationMs > 0
  );
}

/** Selects narrated subtitle timing strategy from story voiceover availability. */
export function resolveSubtitleTimingStrategy(script: FootieScript): SubtitleTimingStrategyId {
  const canonicalVoiceover = getCanonicalVoiceover(script);

  if (canonicalVoiceover?.url || hasVoiceoverDurationMs(script)) {
    return "word_weighted";
  }

  return "equal";
}
