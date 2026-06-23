"use client";

import { ChevronDown } from "lucide-react";

import { getStoryVoiceSettings } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";
import { useStoryVoiceoverApply } from "@/hooks/useStoryVoiceoverApply";
import { applyStoryVoiceSettings } from "@/lib/voiceover";
import {
  studioChip,
  studioChipActive,
  studioError,
  studioFieldLabel,
  studioPanel,
  studioPrimaryButton,
  studioSelect,
  studioSelectChevron,
  studioSubtleText,
} from "@/lib/studioUi";
import {
  DEFAULT_VOICEOVER_VOICE,
  VOICEOVER_SPEED_OPTIONS,
  VOICEOVER_VOICE_OPTIONS,
  VOICE_SPEED_LABELS,
  type VoiceoverSpeedOption,
  type VoiceoverVoiceOption,
} from "@/lib/voiceoverOptions";

interface VoiceSettingsCardProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  disabled?: boolean;
}

export default function VoiceSettingsCard({
  script,
  onScriptChange,
  disabled = false,
}: VoiceSettingsCardProps) {
  const { applyVoiceoverChanges, loading, error } = useStoryVoiceoverApply(
    script,
    onScriptChange,
  );
  const voiceSettings = getStoryVoiceSettings(script);
  const selectedVoice = (voiceSettings.voice ?? DEFAULT_VOICEOVER_VOICE) as VoiceoverVoiceOption;
  const selectedSpeed = voiceSettings.speed;
  const controlsDisabled = disabled;
  const hasNarration = script.narration.trim().length > 0;

  return (
    <div className={`${studioPanel} space-y-4`}>
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Voice Settings</h3>
      </div>

      <div>
        <label htmlFor="story-voice" className={studioFieldLabel}>
          Voice
        </label>
        <div className="relative mt-1.5 w-full">
          <select
            id="story-voice"
            value={selectedVoice}
            onChange={(e) =>
              onScriptChange(
                applyStoryVoiceSettings(script, {
                  voice: e.target.value,
                }),
              )
            }
            disabled={controlsDisabled}
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

      <div>
        <span className={studioFieldLabel}>Voice Speed</span>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {VOICEOVER_SPEED_OPTIONS.map((option) => {
            const active = selectedSpeed === option;
            return (
              <button
                key={option}
                type="button"
                disabled={controlsDisabled}
                onClick={() =>
                  onScriptChange(
                    applyStoryVoiceSettings(script, {
                      speed: option as VoiceoverSpeedOption,
                    }),
                  )
                }
                className={`${active ? studioChipActive : studioChip} justify-center px-2 py-2 text-center`}
              >
                {VOICE_SPEED_LABELS[option]}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void applyVoiceoverChanges()}
        disabled={loading || controlsDisabled || !hasNarration}
        className={`${studioPrimaryButton} w-full`}
      >
        Apply Changes
      </button>

      {loading ? (
        <p className={`${studioSubtleText} text-center tabular-nums`} role="status" aria-live="polite">
          Updating voiceover...
        </p>
      ) : (
        <p className={studioSubtleText}>
          Regenerates the voiceover audio at the selected speed. Scene timings and subtitles stay as they are.
        </p>
      )}

      {error ? (
        <div className={studioError} role="alert">
          <p className="text-xs font-medium leading-relaxed">Voiceover update failed</p>
          <p className="mt-1 text-xs leading-relaxed">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
