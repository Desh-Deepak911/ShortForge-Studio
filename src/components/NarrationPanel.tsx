"use client";

import { ChevronDown, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { revokeBlobUrl } from "@/lib/blobUrl";
import {
  studioActionButton,
  studioError,
  studioGlass,
  studioLabel,
  studioSectionDesc,
  studioSectionTitle,
  studioSelect,
  studioSelectChevron,
  studioStepLabel,
  studioSubtleText,
  studioSuccessPanel,
} from "@/lib/studioUi";
import { syncFootieScript } from "@/lib/voiceover";
import {
  VOICEOVER_VOICE_OPTIONS,
  type VoiceoverVoiceOption,
} from "@/lib/voiceoverOptions";
import type { FootieScript } from "@/types/footiebitz";

interface NarrationPanelProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function NarrationPanel({
  script,
  onScriptChange,
  disabled = false,
  compact = false,
}: NarrationPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [voice, setVoice] = useState<VoiceoverVoiceOption>("alloy");
  const managedVoiceoverUrl = useRef<string | null>(null);

  const narrationText = script.narration.trim();

  useEffect(() => {
    const managedUrl = managedVoiceoverUrl.current;
    return () => {
      revokeBlobUrl(managedUrl);
      managedVoiceoverUrl.current = null;
    };
  }, []);

  useEffect(() => {
    if (!script.voiceoverUrl) {
      revokeBlobUrl(managedVoiceoverUrl.current);
      managedVoiceoverUrl.current = null;
    }
  }, [script.voiceoverUrl]);

  const revokeManagedVoiceoverUrl = () => {
    revokeBlobUrl(managedVoiceoverUrl.current);
    managedVoiceoverUrl.current = null;
  };

  const handleCreateNarration = async () => {
    setError(null);

    if (!narrationText) {
      setError("Add narration to your story before creating audio.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/generate-voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: narrationText, voice }),
      });

      if (!response.ok) {
        let message = "Failed to create narration";
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // Non-JSON error body
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.includes("audio")) {
        throw new Error("Narration returned an unexpected response format");
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Narration audio is empty");
      }

      const audioBlob = blob.type.includes("audio")
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: "audio/mpeg" });

      if (
        script.voiceoverUrl &&
        script.voiceoverUrl !== managedVoiceoverUrl.current
      ) {
        revokeBlobUrl(script.voiceoverUrl);
      }
      revokeManagedVoiceoverUrl();
      const voiceoverUrl = URL.createObjectURL(audioBlob);
      managedVoiceoverUrl.current = voiceoverUrl;

      onScriptChange(
        syncFootieScript({
          ...script,
          voiceoverUrl,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create narration");
    } finally {
      setLoading(false);
    }
  };

  const isBusy = loading || disabled;

  return (
    <div className={compact ? "space-y-4 sm:space-y-5" : "space-y-6 sm:space-y-7"}>
      {!compact ? (
        <div>
          <p className={studioStepLabel}>Step 4</p>
          <h2 className={studioSectionTitle}>Narration</h2>
          <p className={studioSectionDesc}>
            Turn your story narration into spoken audio for preview and export.
          </p>
        </div>
      ) : null}

      {!compact ? (
        <div className={studioGlass}>
          <p className={studioSubtleText}>
            FootieBitz will read the full narration while scenes change in sequence.
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="narration-voice" className={studioLabel}>
          Narrator voice
        </label>
        <div className="relative w-full">
          <select
            id="narration-voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value as VoiceoverVoiceOption)}
            disabled={isBusy}
            className={`${studioSelect} capitalize`}
          >
            {VOICEOVER_VOICE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevron} />
        </div>
      </div>

      <button
        type="button"
        onClick={handleCreateNarration}
        disabled={isBusy || !narrationText}
        className={`${studioActionButton} w-full`}
      >
        <Mic className="h-4 w-4" strokeWidth={1.75} />
        {loading
          ? "Creating narration..."
          : script.voiceoverUrl
            ? "Recreate Narration"
            : "Create Narration"}
      </button>

      {script.voiceoverUrl && (
        <div className={studioSuccessPanel}>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Audio preview
          </p>
          <audio controls src={script.voiceoverUrl} className="w-full" preload="metadata">
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {error && (
        <div className={studioError}>
          <p className="text-xs leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}
