"use client";

import { useMemo } from "react";

import type { FootieScript } from "@/features/story/types";

import {
  getAudioEngine,
  resolveAudioEngineSnapshot,
} from "../services/audio-engine.service";
import type { AudioEngineSnapshot } from "../types/audio-engine.types";
import { getCanonicalVoiceover } from "../utils/canonical-voiceover.utils";

export interface UseAudioEngineResult {
  engine: ReturnType<typeof getAudioEngine>;
  snapshot: AudioEngineSnapshot | null;
  hasVoiceover: boolean;
  voiceoverUrl: string | undefined;
  backgroundMusicUrl: string | null;
}

/**
 * React hook for the shared AudioEngine snapshot derived from FootieScript.
 * Preview, export, and voice apply flows should read audio URLs through this hook
 * or getAudioEngine() directly — not from ad hoc script field reads.
 */
export function useAudioEngine(
  script: FootieScript | null | undefined,
): UseAudioEngineResult {
  const engine = useMemo(() => getAudioEngine(), []);

  const snapshot = useMemo(() => resolveAudioEngineSnapshot(script), [script]);
  const canonicalVoiceover = useMemo(() => getCanonicalVoiceover(script), [script]);

  return useMemo(
    () => ({
      engine,
      snapshot,
      hasVoiceover: Boolean(canonicalVoiceover?.url),
      voiceoverUrl: canonicalVoiceover?.url,
      backgroundMusicUrl: snapshot?.backgroundMusic?.url ?? null,
    }),
    [engine, snapshot, canonicalVoiceover?.url],
  );
}
