"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getAudioEngine, getCanonicalVoiceover } from "@/features/audio";
import { embedVoiceoverBlobInScript, type DraftPersistedScript } from "@/features/drafts";
import { getStoryVoiceSettings } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";
import {
  applyVoiceoverRegeneration,
  resolveVoiceoverDurationFromBlob,
} from "@/lib/utils/voiceover";

const ACCEPTED_AUDIO_PATTERN = /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i;

function restoreVoiceoverBaseline(
  current: FootieScript,
  baseline: FootieScript,
): FootieScript {
  const baselinePersisted = baseline as DraftPersistedScript;
  const next: DraftPersistedScript = {
    ...current,
    voiceoverUrl: baseline.voiceoverUrl,
    voiceoverDurationMs: baseline.voiceoverDurationMs,
    voiceoverNarration: baseline.voiceoverNarration,
    voiceoverVoiceSettings: baseline.voiceoverVoiceSettings,
    voiceoverSourceKind: baseline.voiceoverSourceKind,
    voiceSettings: baseline.voiceSettings,
  };

  if (baselinePersisted.voiceoverAudioBase64) {
    next.voiceoverAudioBase64 = baselinePersisted.voiceoverAudioBase64;
  } else {
    delete next.voiceoverAudioBase64;
  }

  return next;
}

function normalizeUploadedAudioBlob(file: File): Promise<Blob> {
  if (file.type.includes("audio")) {
    return Promise.resolve(file);
  }

  if (ACCEPTED_AUDIO_PATTERN.test(file.name)) {
    return file.arrayBuffer().then(
      (buffer) => new Blob([buffer], { type: "audio/mpeg" }),
    );
  }

  return Promise.reject(
    new Error("Please choose an audio file (MP3, WAV, M4A, AAC, or OGG)."),
  );
}

export function useStoryVoiceoverUpload(
  script: FootieScript,
  onScriptChange: (script: FootieScript) => void,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioEngine = useMemo(() => getAudioEngine(), []);
  const scriptRef = useRef(script);

  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  const applyUploadedVoiceover = async (file: File) => {
    setError(null);

    const baseline = scriptRef.current;
    setLoading(true);

    let pendingVoiceoverUrl: string | null = null;

    try {
      const audioBlob = await normalizeUploadedAudioBlob(file);

      if (audioBlob.size === 0) {
        throw new Error("Uploaded audio file is empty.");
      }

      pendingVoiceoverUrl = audioEngine.materializeVoiceoverBlob(audioBlob);

      const voiceoverDurationMs = await resolveVoiceoverDurationFromBlob(
        audioBlob,
        baseline.narration.trim(),
      );

      const voiceSettings = getStoryVoiceSettings(baseline);
      const previousVoiceoverUrl = getCanonicalVoiceover(baseline)?.url;

      const withEmbeddedVoiceover = await embedVoiceoverBlobInScript(baseline, audioBlob);

      onScriptChange(
        applyVoiceoverRegeneration(withEmbeddedVoiceover, {
          voiceoverUrl: pendingVoiceoverUrl,
          voiceoverDurationMs,
          voiceSettings: {
            voice: voiceSettings.voice,
            speed: voiceSettings.speed,
          },
          sourceKind: "uploaded",
        }),
      );

      audioEngine.handleVoiceoverReplacement({
        previousUrl: previousVoiceoverUrl,
        nextUrl: pendingVoiceoverUrl,
      });

      pendingVoiceoverUrl = null;
    } catch (err) {
      audioEngine.revokeVoiceoverUrl(pendingVoiceoverUrl);

      onScriptChange(restoreVoiceoverBaseline(scriptRef.current, baseline));

      setError(
        err instanceof Error
          ? err.message
          : "Could not upload voiceover audio. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    applyUploadedVoiceover,
    loading,
    error,
    clearError: () => setError(null),
  };
}
