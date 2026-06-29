"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getAudioEngine, getCanonicalVoiceover } from "@/features/audio";
import { getStoryVoiceSettings } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";
import {
  applyVoiceoverRegeneration,
  resolveVoiceoverDurationFromBlob,
} from "@/lib/utils/voiceover";
import { DEFAULT_VOICEOVER_VOICE } from "@/lib/utils/voiceoverOptions";

function restoreVoiceoverBaseline(
  current: FootieScript,
  baseline: FootieScript,
): FootieScript {
  return {
    ...current,
    voiceoverUrl: baseline.voiceoverUrl,
    voiceoverDurationMs: baseline.voiceoverDurationMs,
    voiceSettings: baseline.voiceSettings,
  };
}

export function useStoryVoiceoverApply(
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

  useEffect(() => {
    return () => {
      audioEngine.releaseManagedVoiceoverUrls();
    };
  }, [audioEngine]);

  useEffect(() => {
    if (!audioEngine.hasVoiceover(script)) {
      audioEngine.releaseManagedVoiceoverUrls();
    }
  }, [audioEngine, script]);

  const applyVoiceoverChanges = async () => {
    setError(null);

    const baseline = scriptRef.current;
    const narrationText = baseline.narration.trim();
    if (!narrationText) {
      setError("Add narration to your story before applying voice settings.");
      return;
    }

    const voiceSettings = getStoryVoiceSettings(baseline);
    const voice = voiceSettings.voice ?? DEFAULT_VOICEOVER_VOICE;
    const speed = voiceSettings.speed;

    setLoading(true);

    let pendingVoiceoverUrl: string | null = null;

    try {
      const response = await fetch("/api/generate-voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          narration: narrationText,
          voice,
          speed,
        }),
      });

      if (!response.ok) {
        let message = "Could not update the voiceover. Please try again.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error?.trim()) {
            message = data.error.trim();
          }
        } catch {
          // Non-JSON error body
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.includes("audio")) {
        throw new Error("Voiceover returned an unexpected response. Please try again.");
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Voiceover audio was empty. Please try again.");
      }

      const audioBlob = blob.type.includes("audio")
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: "audio/mpeg" });

      pendingVoiceoverUrl = audioEngine.materializeVoiceoverBlob(audioBlob);

      const headerDurationMs = Number(response.headers.get("X-Voiceover-Duration-Ms"));
      const voiceoverDurationMs =
        Number.isFinite(headerDurationMs) && headerDurationMs > 0
          ? Math.round(headerDurationMs)
          : await resolveVoiceoverDurationFromBlob(audioBlob, narrationText);

      const previousVoiceoverUrl = getCanonicalVoiceover(baseline)?.url;

      onScriptChange(
        applyVoiceoverRegeneration(baseline, {
          voiceoverUrl: pendingVoiceoverUrl,
          voiceoverDurationMs,
          voiceSettings: { voice, speed },
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
          : "Could not update the voiceover. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    applyVoiceoverChanges,
    loading,
    error,
    clearError: () => setError(null),
  };
}
