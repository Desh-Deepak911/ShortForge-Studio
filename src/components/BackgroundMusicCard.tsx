"use client";

import { Music, Upload } from "lucide-react";
import { useId, useRef } from "react";

import {
  applyStoryBackgroundMusic,
  BACKGROUND_MUSIC_LIBRARY_EMPTY_MESSAGE,
  BACKGROUND_MUSIC_LIBRARY_TRACKS,
  formatBackgroundMusicLibraryLicenseLabel,
  getStoryBackgroundMusic,
  percentToVolume,
  volumeToPercent,
} from "@/features/story/utils";
import type { BackgroundMusicSource, FootieScript } from "@/features/story/types";
import { revokeBlobUrl } from "@/lib/utils/blobUrl";
import {
  studioChip,
  studioChipActive,
  studioFieldLabel,
  studioPanel,
  studioRange,
  studioRangeTouchHost,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
  studioSubtleText,
} from "@/lib/utils/studioUi";

interface BackgroundMusicCardProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  disabled?: boolean;
}

const SOURCE_OPTIONS: { value: BackgroundMusicSource; label: string }[] = [
  { value: "none", label: "None" },
  { value: "upload", label: "Upload Music" },
  { value: "library", label: "Choose from Library" },
];

const ACCEPTED_AUDIO_TYPES =
  "audio/*,.mp3,.wav,.m4a,.aac,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg";

function SettingToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-border/15 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-surface-elevated/25"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground/90">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-accent"
      />
    </label>
  );
}

export default function BackgroundMusicCard({
  script,
  onScriptChange,
  disabled = false,
}: BackgroundMusicCardProps) {
  const uploadInputId = useId();
  const volumeInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundMusic = getStoryBackgroundMusic(script);
  const activeSource = backgroundMusic.enabled ? backgroundMusic.source : "none";
  const controlsDisabled = disabled;
  const settingsDisabled = controlsDisabled || activeSource === "none";
  const volumePercent = volumeToPercent(backgroundMusic.volume);

  const updateBackgroundMusic = (patch: Parameters<typeof applyStoryBackgroundMusic>[1]) => {
    onScriptChange(applyStoryBackgroundMusic(script, patch));
  };

  const handleSourceChange = (source: BackgroundMusicSource) => {
    if (source === "none") {
      revokeBlobUrl(backgroundMusic.fileUrl);
      updateBackgroundMusic({
        enabled: false,
        source: "none",
        fileUrl: undefined,
        fileName: undefined,
        trackId: undefined,
        trackName: undefined,
        artist: undefined,
        license: undefined,
        attributionRequired: undefined,
        attributionText: undefined,
      });
      return;
    }

    if (source === "upload") {
      updateBackgroundMusic({
        enabled: true,
        source: "upload",
        trackId: undefined,
        trackName: undefined,
        artist: undefined,
        license: undefined,
        attributionRequired: undefined,
        attributionText: undefined,
      });
      return;
    }

    revokeBlobUrl(backgroundMusic.fileUrl);
    updateBackgroundMusic({
      enabled: true,
      source: "library",
      fileUrl: undefined,
      fileName: undefined,
    });
  };

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    revokeBlobUrl(backgroundMusic.fileUrl);
    const fileUrl = URL.createObjectURL(file);

    updateBackgroundMusic({
      enabled: true,
      source: "upload",
      fileUrl,
      fileName: file.name,
      trackId: undefined,
      trackName: undefined,
      artist: undefined,
      license: undefined,
      attributionRequired: undefined,
      attributionText: undefined,
    });
  };

  const handleLibrarySelect = (trackId: string) => {
    const track = BACKGROUND_MUSIC_LIBRARY_TRACKS.find((item) => item.id === trackId);
    if (!track) {
      return;
    }

    revokeBlobUrl(backgroundMusic.fileUrl);
    updateBackgroundMusic({
      enabled: true,
      source: "library",
      fileUrl: track.fileUrl,
      fileName: undefined,
      trackId: track.id,
      trackName: track.name,
      artist: track.artist,
      license: track.license,
      attributionRequired: track.attributionRequired,
      attributionText: track.attributionText,
    });
  };

  const hasLibraryTracks = BACKGROUND_MUSIC_LIBRARY_TRACKS.length > 0;

  return (
    <div className={`${studioPanel} space-y-4`}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated/70 ring-1 ring-border/20">
          <Music className="h-4 w-4 text-accent" strokeWidth={1.75} />
        </div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Background Music</h3>
      </div>

      <div
        className={studioSegmentedControl}
        role="tablist"
        aria-label="Background music source"
      >
        {SOURCE_OPTIONS.map((option) => {
          const active = activeSource === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={controlsDisabled}
              onClick={() => handleSourceChange(option.value)}
              className={active ? studioSegmentActive : studioSegment}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {activeSource === "upload" ? (
        <div className="space-y-2 rounded-xl bg-surface-elevated/25 px-3 py-3 ring-1 ring-border/15">
          <input
            ref={fileInputRef}
            id={uploadInputId}
            type="file"
            accept={ACCEPTED_AUDIO_TYPES}
            className="sr-only"
            disabled={controlsDisabled}
            onChange={handleUploadChange}
          />
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={() => fileInputRef.current?.click()}
            className={`${studioChip} inline-flex w-full items-center justify-center gap-2`}
          >
            <Upload className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            Choose audio file
          </button>
          <p className="truncate text-center text-xs text-muted">
            {backgroundMusic.fileName ?? "No file selected"}
          </p>
        </div>
      ) : null}

      {activeSource === "library" ? (
        <div className="space-y-2 rounded-xl bg-surface-elevated/25 px-3 py-3 ring-1 ring-border/15">
          <p className={studioFieldLabel}>Library tracks</p>
          {hasLibraryTracks ? (
            <div className="space-y-1.5">
              {BACKGROUND_MUSIC_LIBRARY_TRACKS.map((track) => {
                const active = backgroundMusic.trackId === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => handleLibrarySelect(track.id)}
                    className={`${active ? studioChipActive : studioChip} w-full justify-start px-3 py-2.5 text-left`}
                  >
                    <span className="block truncate text-sm font-medium text-foreground/90">
                      {track.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {track.artist} · {track.mood}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted/80">
                      {formatBackgroundMusicLibraryLicenseLabel(track)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted">{BACKGROUND_MUSIC_LIBRARY_EMPTY_MESSAGE}</p>
          )}
        </div>
      ) : null}

      <div
        className={`space-y-3 rounded-xl bg-surface-elevated/20 px-3 py-3 ring-1 ring-border/15 ${
          settingsDisabled ? "opacity-50" : ""
        }`}
      >
        <p className={studioFieldLabel}>Settings</p>

        <section aria-label="Background music volume">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor={volumeInputId} className="text-sm font-medium text-foreground/90">
              Volume
            </label>
            <span className="text-[11px] font-medium tabular-nums text-muted sm:text-xs">
              {volumePercent}%
            </span>
          </div>
          <div className={studioRangeTouchHost}>
            <input
              id={volumeInputId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={volumePercent}
              disabled={settingsDisabled}
              onChange={(event) =>
                updateBackgroundMusic({ volume: percentToVolume(Number(event.target.value)) })
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={volumePercent}
              className={studioRange}
            />
          </div>
        </section>

        <div className="space-y-1.5">
          <SettingToggleRow
            label="Duck under voiceover"
            description="Lowers music while narration plays"
            checked={backgroundMusic.duckingEnabled}
            disabled={settingsDisabled}
            onChange={(duckingEnabled) => updateBackgroundMusic({ duckingEnabled })}
          />
          <SettingToggleRow
            label="Fade in"
            checked={backgroundMusic.fadeIn}
            disabled={settingsDisabled}
            onChange={(fadeIn) => updateBackgroundMusic({ fadeIn })}
          />
          <SettingToggleRow
            label="Fade out"
            checked={backgroundMusic.fadeOut}
            disabled={settingsDisabled}
            onChange={(fadeOut) => updateBackgroundMusic({ fadeOut })}
          />
        </div>
      </div>

      <p className={studioSubtleText}>
        Background music settings are saved with your story. Voiceover audio is not changed.
      </p>
    </div>
  );
}
