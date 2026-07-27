"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { getCanonicalVoiceover } from "@/features/audio";
import { StudioStatus } from "@/components/studio-status";
import {
  resolveVoiceLibraryDisplayName,
  VoiceLibraryPanel,
} from "@/features/voice-library";
import { SpeechStylePanel } from "@/features/speech-style";
import { getStoryVoiceSettings } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";
import { useStoryVoiceoverApply } from "@/hooks/useStoryVoiceoverApply";
import { applyStoryVoiceSettings } from "@/lib/utils/voiceover";
import {
  studioChip,
  studioChipActive,
  studioFieldLabel,
  studioPanel,
  studioPrimaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import {
  DEFAULT_VOICEOVER_VOICE,
  VOICEOVER_SPEED_OPTIONS,
  VOICE_SPEED_LABELS,
  type VoiceoverSpeedOption,
} from "@/lib/utils/voiceoverOptions";

interface VoiceSettingsCardProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  disabled?: boolean;
  /** Review flow uses Create/Update Narration; editor uses ProjectAudioVoiceoverSection CTAs. */
  variant?: "editor" | "review";
  /** When false, apply CTA is omitted (e.g. review shell header owns primary action). */
  showApplyButton?: boolean;
  /** Exposes apply handler state for an external primary CTA. */
  onApplyControlReady?: (control: {
    apply: () => void;
    canApply: boolean;
    loading: boolean;
    label: string;
  }) => void;
}

export default function VoiceSettingsCard({
  script,
  onScriptChange,
  disabled = false,
  variant = "editor",
  showApplyButton = true,
  onApplyControlReady,
}: VoiceSettingsCardProps) {
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(
    variant !== "review",
  );
  const { applyVoiceoverChanges, loading, error } = useStoryVoiceoverApply(
    script,
    onScriptChange,
  );
  const voiceSettings = getStoryVoiceSettings(script);
  const selectedVoice = voiceSettings.voice ?? DEFAULT_VOICEOVER_VOICE;
  const selectedSpeed = voiceSettings.speed;
  const selectedStylePreset = voiceSettings.stylePreset;
  const expressiveDelivery = voiceSettings.expressiveDelivery;
  const controlsDisabled = disabled;
  const hasNarration = script.narration.trim().length > 0;
  const hasVoiceover = Boolean(getCanonicalVoiceover(script)?.url);
  const applyButtonLabel =
    variant === "review"
      ? hasVoiceover
        ? "Update Narration"
        : "Create Narration"
      : "Apply Changes";

  useEffect(() => {
    if (!onApplyControlReady) {
      return;
    }

    onApplyControlReady({
      apply: () => {
        void applyVoiceoverChanges();
      },
      canApply: hasNarration && !controlsDisabled,
      loading,
      label: applyButtonLabel,
    });
  }, [
    applyButtonLabel,
    applyVoiceoverChanges,
    controlsDisabled,
    hasNarration,
    loading,
    onApplyControlReady,
  ]);

  return (
    <div className={`${studioPanel} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Voice Settings
        </h3>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className={studioChip}>
            {resolveVoiceLibraryDisplayName(selectedVoice)}
          </span>
          <span className={studioChip}>
            {VOICE_SPEED_LABELS[selectedSpeed as VoiceoverSpeedOption]}
          </span>
        </div>
      </div>

      <details
        className="group rounded-xl bg-background/25 p-3 ring-1 ring-border/20"
        open={voiceLibraryOpen}
        onToggle={(event) => setVoiceLibraryOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-foreground/90 [&::-webkit-details-marker]:hidden">
          Change voice and delivery
          <ChevronDown className="h-3.5 w-3.5 text-muted transition group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-4 border-t border-border/20 pt-3">
          <VoiceLibraryPanel
            labelledBy="story-voice-label"
            selectedVoiceId={selectedVoice}
            previewSpeed={selectedSpeed}
            previewStylePreset={selectedStylePreset}
            previewExpressiveDelivery={expressiveDelivery}
            disabled={controlsDisabled}
            compact
            onVoiceSelect={(voice) =>
              onScriptChange(
                applyStoryVoiceSettings(script, {
                  voice,
                }),
              )
            }
          />
          <span id="story-voice-label" className="sr-only">
            Voice
          </span>

          <SpeechStylePanel
            stylePreset={selectedStylePreset}
            expressiveDelivery={expressiveDelivery}
            disabled={controlsDisabled}
            compact
            onStylePresetChange={(stylePreset) =>
              onScriptChange(
                applyStoryVoiceSettings(script, {
                  stylePreset,
                }),
              )
            }
            onExpressiveDeliveryChange={(nextExpressiveDelivery) =>
              onScriptChange(
                applyStoryVoiceSettings(script, {
                  expressiveDelivery: nextExpressiveDelivery,
                }),
              )
            }
          />
        </div>
      </details>

      <div>
        <span className={studioFieldLabel}>Voice speed</span>
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

      {showApplyButton ? (
        <button
          type="button"
          onClick={() => void applyVoiceoverChanges()}
          disabled={loading || controlsDisabled || !hasNarration}
          className={`${studioPrimaryButton} w-full`}
        >
          {loading
            ? variant === "review"
              ? "Creating narration..."
              : "Updating narration..."
            : applyButtonLabel}
        </button>
      ) : null}

      {loading ? (
        <p
          className={`${studioSubtleText} text-center tabular-nums`}
          role="status"
          aria-live="polite"
        >
          {variant === "review"
            ? "Recording narration from your script..."
            : "Updating narration..."}
        </p>
      ) : (
        <p className={studioSubtleText}>
          {variant === "review"
            ? showApplyButton
              ? hasVoiceover
                ? "Updates spoken audio at the selected speed. Scene timings stay the same."
                : "No narration yet. Add script text above, then create narration here."
              : hasVoiceover
                ? "Use the header action to update narration after changing voice or speed."
                : "Use the header action to create narration from your script."
            : "Updates spoken audio at the selected speed. Scene timings stay the same."}
        </p>
      )}

      {error ? (
        <StudioStatus
          variant="error"
          layout="panel"
          title="Couldn't update narration"
          description={error}
        />
      ) : null}
    </div>
  );
}
