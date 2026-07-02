"use client";

import { useId, type ReactNode } from "react";

import AudioMixerSlider from "@/features/audio-mixer/AudioMixerSlider";
import {
  MAX_DUCKING_STRENGTH,
  MAX_MIX_VOLUME,
  MIN_DUCKING_STRENGTH,
  MIN_MIX_VOLUME,
} from "@/features/audio-mixer/audio-mixer.defaults";
import {
  applyStoryAudioMixer,
  resolveAudioMixerSettings,
} from "@/features/audio-mixer/audio-mixer.utils";
import type { FootieScript } from "@/features/story/types";
import {
  studioFieldLabel,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface AudioMixerPanelProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  disabled?: boolean;
}

const VOLUME_STEP = 0.05;
const DUCKING_STEP = 0.05;

function ComingSoonBadge() {
  return (
    <span className="rounded-md bg-surface-elevated/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted ring-1 ring-border/15">
      Coming soon
    </span>
  );
}

function MixerToggleRow({
  label,
  description,
  checked,
  disabled,
  comingSoon,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 py-1 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="block text-[11px] font-medium text-foreground/90">{label}</span>
          {comingSoon ? <ComingSoonBadge /> : null}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="h-3.5 w-3.5 shrink-0 accent-accent"
      />
    </label>
  );
}

function MixerSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5 border-t border-border/15 pt-3 first:border-t-0 first:pt-0">
      <p className={studioFieldLabel}>{title}</p>
      {children}
    </section>
  );
}

/**
 * Project audio mixer controls — voice, music, and master bus volumes.
 * Binds to `script.audioMixer`; playback uses resolved settings from 3.9.2B-2.
 */
export default function AudioMixerPanel({
  script,
  onScriptChange,
  disabled = false,
}: AudioMixerPanelProps) {
  const voiceVolumeId = useId();
  const musicVolumeId = useId();
  const duckingStrengthId = useId();
  const masterVolumeId = useId();

  const mixer = resolveAudioMixerSettings(script);

  const patchMixer = (patch: Parameters<typeof applyStoryAudioMixer>[1]) => {
    onScriptChange(applyStoryAudioMixer(script, patch));
  };

  return (
    <div className="space-y-1">
      <p className={`${studioSubtleText} text-[11px]`}>
        Independent voice, music, and master levels for preview and export.
      </p>

      <MixerSection title="Voice">
        <AudioMixerSlider
          id={voiceVolumeId}
          label="Voice Volume"
          value={mixer.voice.volume}
          min={MIN_MIX_VOLUME}
          max={MAX_MIX_VOLUME}
          step={VOLUME_STEP}
          disabled={disabled}
          minLabel="0%"
          midLabel="100%"
          maxLabel="200%"
          onChange={(volume) => patchMixer({ voice: { volume } })}
        />

        <MixerToggleRow
          label="Normalize Voice"
          checked={mixer.voice.normalize}
          disabled
          comingSoon
        />
      </MixerSection>

      <MixerSection title="Music">
        <AudioMixerSlider
          id={musicVolumeId}
          label="Music Volume"
          value={mixer.music.volume}
          min={MIN_MIX_VOLUME}
          max={MAX_MIX_VOLUME}
          step={VOLUME_STEP}
          disabled={disabled}
          minLabel="0%"
          midLabel="100%"
          maxLabel="200%"
          onChange={(volume) => patchMixer({ music: { volume } })}
        />

        <MixerToggleRow
          label="Enable Ducking"
          description="Lowers music while narration plays in preview"
          checked={mixer.music.duckingEnabled}
          disabled={disabled}
          onChange={(duckingEnabled) => patchMixer({ music: { duckingEnabled } })}
        />

        {mixer.music.duckingEnabled ? (
          <AudioMixerSlider
            id={duckingStrengthId}
            label="Ducking Strength"
            value={mixer.music.duckingStrength}
            min={MIN_DUCKING_STRENGTH}
            max={MAX_DUCKING_STRENGTH}
            step={DUCKING_STEP}
            disabled={disabled}
            duckingStrength
            onChange={(duckingStrength) => patchMixer({ music: { duckingStrength } })}
          />
        ) : null}
      </MixerSection>

      <MixerSection title="Master">
        <AudioMixerSlider
          id={masterVolumeId}
          label="Master Volume"
          value={mixer.master.volume}
          min={MIN_MIX_VOLUME}
          max={MAX_MIX_VOLUME}
          step={VOLUME_STEP}
          disabled={disabled}
          minLabel="0%"
          midLabel="100%"
          maxLabel="200%"
          onChange={(volume) => patchMixer({ master: { volume } })}
        />

        <MixerToggleRow
          label="Limiter"
          checked={mixer.master.limiterEnabled}
          disabled
          comingSoon
        />
        <MixerToggleRow
          label="Peak Protection"
          description="Limits loud peaks in preview and export"
          checked={mixer.master.peakProtection}
          disabled={disabled}
          onChange={(peakProtection) => patchMixer({ master: { peakProtection } })}
        />
      </MixerSection>

      <p className={`${studioSubtleText} pt-1 text-[10px]`}>
        Stem output: voice {Math.round(mixer.voice.volume * mixer.master.volume * 100)}% · music{" "}
        {Math.round(mixer.music.volume * mixer.master.volume * 100)}%
      </p>
    </div>
  );
}
