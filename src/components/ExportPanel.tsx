"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Download,
  Film,
  Loader2,
} from "lucide-react";
import { useMemo, useState, useEffect, type ReactNode } from "react";

import { buildAudioMixFromStory } from "@/features/audio";
import {
  applyStoryBackgroundMusic,
} from "@/features/story/utils";
import {
  buildExportDownloadFileName,
  exportFootieShort,
  getDefaultExportAudioMode,
  isExportQualityTier,
  isExportResolution,
  isHighQualityExportSettings,
  isWebmExportAvailable,
  normalizeExportSettings,
  resolveExportPath,
  resolveExportPathFormatNotice,
  resolveExportSettings,
  resolveWebmBackgroundMusicExportNotice,
  type ExportAudioMode,
  type ExportProgress,
} from "@/features/export/services";
import {
  EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING,
  hasNarrationVoiceoverMismatch,
} from "@/features/export/utils/export-narration-voiceover.utils";
import {
  EXPORT_AUDIO_VOICE_ONLY_FALLBACK_WARNING,
  isExportBackgroundMusicActiveFromMix,
} from "@/features/export/utils/export-background-music.utils";
import {
  studioBadge,
  studioChecklistItem,
  studioError,
  studioFieldLabel,
  studioGlass,
  studioIconBox,
  studioInput,
  studioOptionRow,
  studioPanel,
  studioPrimaryButton,
  studioSectionDesc,
  studioSectionTitle,
  studioSelect,
  studioSelectChevron,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
  studioSegmentedControlStacked,
  studioStepLabel,
  studioStickyMobileFooterAboveBar,
  studioSubtleText,
  studioWarningPanel,
} from "@/lib/utils/studioUi";
import { CREATOR_BRAND } from "@/lib/constants/product-brand";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { sceneHasImage } from "@/features/story/utils";
import type { ExportSettings, FootieScript } from "@/features/story/types";

interface ExportPanelProps {
  script: FootieScript;
  disabled?: boolean;
  compact?: boolean;
  /** Called when export settings change so drafts can persist them on save. */
  onExportSettingsChange?: (settings: ExportSettings) => void;
  /** Optional — toggling background music updates the story via existing settings. */
  onScriptChange?: (script: FootieScript) => void;
  /** Optional — notifies parent when export is in progress (presentation gating). */
  onExportActiveChange?: (active: boolean) => void;
}

interface ChecklistItem {
  label: string;
  done: boolean;
  detail?: string;
}

type ExportState = ExportProgress["status"] | "idle";

const FORMAT_HELPERS: Record<ExportSettings["format"], string> = {
  webm: "Faster export",
  mp4: "Wider compatibility",
};

function ExportSettingsSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-3 border-t border-border/20 pt-5 first:border-t-0 first:pt-0 ${className}`}>
      <div>
        <p className={`${studioFieldLabel} mb-0`}>{title}</p>
        {description ? <p className={`${studioSubtleText} mt-1`}>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function ExportPanel({
  script,
  disabled = false,
  compact = false,
  onExportSettingsChange,
  onScriptChange,
  onExportActiveChange,
}: ExportPanelProps) {
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [exportResultKind, setExportResultKind] = useState<ExportProgress["resultKind"]>("default");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [includeNarrationPreference, setIncludeNarrationPreference] = useState(true);
  const baseExportSettings = useMemo(
    (): ExportSettings => resolveExportSettings(script),
    [script],
  );

  const scriptSettingsKey = useMemo(
    () => `${script.title}|${JSON.stringify(script.exportSettings ?? null)}`,
    [script.title, script.exportSettings],
  );

  const [userExportSettings, setUserExportSettings] = useState<{
    key: string;
    settings: ExportSettings;
  } | null>(null);

  const exportSettings = useMemo(() => {
    if (userExportSettings?.key === scriptSettingsKey) {
      return userExportSettings.settings;
    }
    return baseExportSettings;
  }, [baseExportSettings, userExportSettings, scriptSettingsKey]);

  const updateExportSettings = (patch: Partial<ExportSettings>) => {
    setUserExportSettings((current) => {
      const base =
        current?.key === scriptSettingsKey ? current.settings : baseExportSettings;
      const next = { ...base, ...patch };
      onExportSettingsChange?.(next);
      return { key: scriptSettingsKey, settings: next };
    });
  };

  const resolvedExportPath = useMemo(
    () => resolveExportPath(exportSettings),
    [exportSettings],
  );

  const sceneCount = script.scenes.length;
  const uploadedCount = script.scenes.filter((scene) => sceneHasImage(scene)).length;
  const allImagesUploaded = sceneCount > 0 && uploadedCount === sceneCount;
  const totalDuration = script.totalDuration;
  const isExporting =
    exportState === "preparing" ||
    exportState === "rendering" ||
    exportState === "loading-voiceover" ||
    exportState === "combining" ||
    exportState === "finalizing";

  useEffect(() => {
    onExportActiveChange?.(isExporting);
    return () => onExportActiveChange?.(false);
  }, [isExporting, onExportActiveChange]);

  const audioMix = useMemo(() => buildAudioMixFromStory(script), [script]);
  const voiceoverSrc = audioMix.voiceover?.src;
  const narrationVoiceoverMismatch = useMemo(
    () => hasNarrationVoiceoverMismatch(script),
    [script],
  );
  const webmBackgroundMusicNotice = useMemo(
    () =>
      resolveWebmBackgroundMusicExportNotice({
        exportPath: resolvedExportPath.path,
        backgroundMusicActive: isExportBackgroundMusicActiveFromMix(audioMix),
      }),
    [audioMix, resolvedExportPath.path],
  );
  const checklist = useMemo<ChecklistItem[]>(
    () => [
      {
        label: "Story ready",
        done: Boolean(script.title && script.narration),
        detail: script.title,
      },
      {
        label: "Timeline complete",
        done: sceneCount > 0,
        detail: `${sceneCount} scenes · ${totalDuration}s total`,
      },
      {
        label: "Images uploaded",
        done: allImagesUploaded,
        detail: `${uploadedCount} of ${sceneCount} scenes`,
      },
      {
        label: voiceoverSrc ? "Narration ready" : "Narration",
        done: Boolean(voiceoverSrc),
        detail: voiceoverSrc
          ? "Ready for preview and download"
          : "No narration yet — create it from your script.",
      },
      {
        label: "Ready to export",
        done: sceneCount > 0,
        detail: allImagesUploaded ? "All scenes have images" : "Placeholders used for missing images",
      },
    ],
    [script.title, script.narration, voiceoverSrc, sceneCount, totalDuration, uploadedCount, allImagesUploaded],
  );

  const readyCount = checklist.filter((item) => item.done).length;
  const hasNarration = Boolean(voiceoverSrc);
  const includeNarration = hasNarration && includeNarrationPreference;
  const hasBackgroundMusicConfigured = Boolean(audioMix.background?.src);
  const includeBackgroundMusic =
    hasBackgroundMusicConfigured && Boolean(audioMix.background?.enabled);
  const exportAudioMode = useMemo((): ExportAudioMode => {
    if (!includeNarration) return "silent";
    return getDefaultExportAudioMode(true);
  }, [includeNarration]);
  const exportWithNarration = exportAudioMode === "with-voice" && hasNarration;
  const showAudioMergeNote =
    exportWithNarration && isHighQualityExportSettings(exportSettings);
  const downloadFileName = buildExportDownloadFileName(exportSettings);
  const [exportWidth, exportHeight] = exportSettings.resolution
    .split("x")
    .map(Number);
  const isBusy = isExporting || disabled;
  const activeFormat = exportSettings.format;
  const webmAvailable = isWebmExportAvailable();

  const handleBackgroundMusicToggle = (enabled: boolean) => {
    if (!onScriptChange || !hasBackgroundMusicConfigured) {
      return;
    }

    onScriptChange(applyStoryBackgroundMusic(script, { enabled }));
  };

  const handleExport = async () => {
    setErrorMessage(null);
    setExportWarning(null);
    setExportMessage(null);
    setExportResultKind("default");
    setProgress(0);
    setExportState("preparing");

    try {
      const normalizedExportSettings = normalizeExportSettings(exportSettings, script.title);
      const exportPath = resolveExportPath(normalizedExportSettings);

      if (exportPath.blocked) {
        setExportState("error");
        setErrorMessage(exportPath.blockReason ?? "Selected export format is unavailable.");
        return;
      }

      await exportFootieShort(
        syncFootieScript(script),
        (update) => {
          setExportState(update.status);
          setProgress(update.progress);
          setExportMessage(update.message);
          setExportWarning(update.warning ?? null);
          setExportResultKind(update.resultKind ?? "default");
        },
        {
          audioMode: exportAudioMode,
          exportSettings: normalizedExportSettings,
        },
      );
    } catch (error) {
      setExportState("error");
      setProgress(0);
      setExportMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "We couldn't finish the export. Try again.");
    }
  };

  return (
    <div className={`${compact ? "space-y-5" : "space-y-7"} min-w-0`}>
      {!compact ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={studioIconBox}>
              <Film className="h-4.5 w-4.5 text-accent" strokeWidth={1.75} />
            </div>
            <div>
              <p className={studioStepLabel}>Export</p>
              <h2 className={studioSectionTitle}>Export</h2>
              <p className={studioSectionDesc}>Render a vertical 9:16 video from your timeline.</p>
            </div>
          </div>
          <span className={`${studioBadge} self-start`}>
            <span className="font-semibold text-foreground/90">{readyCount}/{checklist.length}</span>
            <span className="text-muted">checks</span>
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">Pre-publish checklist</p>
          <span className={`${studioBadge} shrink-0`}>
            <span className="font-semibold text-foreground/90">{readyCount}/{checklist.length}</span>
          </span>
        </div>
      )}

      {compact ? (
        <details className="rounded-xl bg-surface-elevated/25 ring-1 ring-border/20 lg:hidden">
          <summary className="cursor-pointer list-none px-3.5 py-3 text-xs text-muted [&::-webkit-details-marker]:hidden">
            Pre-publish checklist ·{" "}
            <span className="font-medium text-foreground/85">
              {readyCount}/{checklist.length} ready
            </span>
          </summary>
          <ul className="space-y-2 border-t border-border/20 px-2 pb-2 pt-1">
            {checklist.map((item) => (
              <li key={`mobile-${item.label}`} className={studioChecklistItem(item.done)}>
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${item.done ? "text-foreground/90" : "text-muted"}`}
                  >
                    {item.label}
                  </p>
                  {item.detail ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ul className={`space-y-2 ${compact ? "hidden lg:block" : ""}`}>
        {checklist.map((item) => (
          <li key={item.label} className={studioChecklistItem(item.done)}>
            {item.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${item.done ? "text-foreground/90" : "text-muted"}`}>
                {item.label}
              </p>
              {item.detail && (
                <p className="mt-0.5 truncate text-xs text-muted">{item.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!allImagesUploaded && sceneCount > 0 && (
        <div className={`${studioWarningPanel} flex items-start gap-3`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500/80" />
          <div>
            <p className="text-sm font-medium text-amber-100/90">Missing scene images</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-200/60">
              {uploadedCount} of {sceneCount} scenes have images. Missing scenes will use
              gradient placeholders in the export.
            </p>
          </div>
        </div>
      )}

      {narrationVoiceoverMismatch && voiceoverSrc && (
        <div className={`${studioWarningPanel} flex items-start gap-3`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500/80" />
          <div>
            <p className="text-sm font-medium text-amber-100/90">Script changed after narration</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-200/60">
              {EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING}
            </p>
          </div>
        </div>
      )}

      {isExporting && (
        <div className={`${studioGlass} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span className="text-sm font-medium text-foreground/90">
                {exportState === "preparing" && "Preparing your video..."}
                {exportState === "rendering" && `Exporting video (${progress}%)`}
                {exportState === "loading-voiceover" && "Adding narration..."}
                {exportState === "combining" && (exportMessage ?? "Adding audio to your video")}
                {exportState === "finalizing" && "Almost done..."}
              </span>
            </div>
            <span className="text-sm font-semibold text-muted">{progress}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full rounded-full bg-accent/70 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {exportMessage && (
            <p className="mt-3 text-xs text-muted">{exportMessage}</p>
          )}
          <p className="mt-2 text-[11px] text-muted">
            {exportWithNarration
              ? "Drawing your scenes, then adding narration. Keep this tab open."
              : `Drawing your scenes (~${totalDuration}s). Keep this tab open.`}
          </p>
        </div>
      )}

      <div className={`${studioPanel} min-w-0`}>
        <ExportSettingsSection
          title="Format"
          description="Choose how the video file is encoded."
        >
          <div
            className={compact ? studioSegmentedControlStacked : studioSegmentedControl}
            role="radiogroup"
            aria-label="Export format"
          >
            <button
              type="button"
              role="radio"
              aria-checked={activeFormat === "webm"}
              disabled={isBusy || !webmAvailable}
              title={webmAvailable ? "Faster export" : "WebM unavailable in this browser"}
              onClick={() => updateExportSettings({ format: "webm" })}
              className={activeFormat === "webm" ? studioSegmentActive : studioSegment}
            >
              WebM
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={activeFormat === "mp4"}
              disabled={isBusy}
              title="Wider compatibility"
              onClick={() => updateExportSettings({ format: "mp4" })}
              className={activeFormat === "mp4" ? studioSegmentActive : studioSegment}
            >
              MP4
            </button>
          </div>
          <p className={studioSubtleText}>{FORMAT_HELPERS[activeFormat]}</p>
          <p className={studioSubtleText}>{resolveExportPathFormatNotice(resolvedExportPath.path)}</p>
          {resolvedExportPath.blocked ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {resolvedExportPath.blockReason}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="export-resolution" className={studioFieldLabel}>
                Resolution
              </label>
              <div className="relative mt-1.5">
                <select
                  id="export-resolution"
                  value={exportSettings.resolution}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isExportResolution(value)) {
                      updateExportSettings({ resolution: value });
                    }
                  }}
                  disabled={isBusy}
                  className={studioSelect}
                >
                  <option value="1080x1920">1080×1920</option>
                  <option value="720x1280">720×1280</option>
                </select>
                <ChevronDown className={studioSelectChevron} />
              </div>
            </div>
            <div>
              <label htmlFor="export-quality-tier" className={studioFieldLabel}>
                Quality
              </label>
              <div className="relative mt-1.5">
                <select
                  id="export-quality-tier"
                  value={exportSettings.quality}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isExportQualityTier(value)) {
                      updateExportSettings({ quality: value });
                    }
                  }}
                  disabled={isBusy}
                  className={studioSelect}
                >
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
                <ChevronDown className={studioSelectChevron} />
              </div>
            </div>
          </div>
        </ExportSettingsSection>

        <ExportSettingsSection title="Audio" description="Choose what plays in the exported file.">
          <label
            className={`${studioOptionRow(includeNarration && hasNarration)} ${
              !hasNarration || isBusy ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={includeNarration}
              onChange={(e) => setIncludeNarrationPreference(e.target.checked)}
              disabled={isBusy || !hasNarration}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium text-foreground/90">Include narration</span>
              <span className="mt-0.5 block text-xs text-muted">
                {hasNarration
                  ? `Includes spoken audio in your ${exportSettings.format.toUpperCase()} file`
                  : "No narration yet — create it from your script."}
              </span>
            </span>
          </label>

          <label
            className={`${studioOptionRow(includeBackgroundMusic)} ${
              !hasBackgroundMusicConfigured || isBusy || !onScriptChange
                ? "cursor-not-allowed opacity-50"
                : ""
            }`}
          >
            <input
              type="checkbox"
              checked={includeBackgroundMusic}
              onChange={(e) => handleBackgroundMusicToggle(e.target.checked)}
              disabled={isBusy || !hasBackgroundMusicConfigured || !onScriptChange}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium text-foreground/90">
                Include background music
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {hasBackgroundMusicConfigured
                  ? "Mixes your story background music into the export."
                  : "Add background music in the storyboard section to enable."}
              </span>
            </span>
          </label>

          {webmBackgroundMusicNotice ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">{webmBackgroundMusicNotice}</p>
          ) : null}

          {showAudioMergeNote ? (
            <p className={studioSubtleText}>
              Narration merge can take longer for high-quality 1080p exports.
            </p>
          ) : null}
        </ExportSettingsSection>

        <ExportSettingsSection title="Branding">
          <label className={`${studioOptionRow(true)} cursor-default`}>
            <input
              type="checkbox"
              checked
              disabled
              readOnly
              aria-readonly="true"
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium text-foreground/90">
                {CREATOR_BRAND} watermark
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Adds your channel mark to the video.
              </span>
            </span>
          </label>
        </ExportSettingsSection>

        <ExportSettingsSection
          title="Filename"
          description="Name the file before you download — the extension matches your format."
        >
          <label htmlFor="export-file-name" className="sr-only">
            Video filename
          </label>
          <input
            id="export-file-name"
            type="text"
            value={exportSettings.fileName}
            onChange={(e) => updateExportSettings({ fileName: e.target.value })}
            disabled={isBusy}
            className={studioInput}
            placeholder="my-football-short"
            autoComplete="off"
            spellCheck={false}
          />
          <p className={studioSubtleText}>
            Downloads as <span className="text-foreground/80">{downloadFileName}</span>
          </p>
        </ExportSettingsSection>

        <ExportSettingsSection
          title="Download"
          className={compact ? studioStickyMobileFooterAboveBar : undefined}
        >
          <button
            type="button"
            onClick={handleExport}
            disabled={isBusy || sceneCount < 1 || resolvedExportPath.blocked}
            className={`${studioPrimaryButton} w-full`}
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" strokeWidth={1.75} />
                Export Video
              </>
            )}
          </button>
          <p className="text-center text-[11px] text-muted">
            {exportWidth}×{exportHeight} · 9:16 vertical
            {exportWithNarration && " · with narration"}
            {includeBackgroundMusic && " · with background music"}
          </p>
        </ExportSettingsSection>
      </div>

      {exportState === "done" && exportMessage && exportResultKind === "audio-voice-only" && (
        <div className={`${studioWarningPanel} flex items-start gap-3`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500/80" />
          <div>
            <p className="text-sm font-medium leading-relaxed text-amber-100/90">
              {exportWarning ?? EXPORT_AUDIO_VOICE_ONLY_FALLBACK_WARNING}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-amber-200/60">{exportMessage}</p>
          </div>
        </div>
      )}

      {exportState === "done" && exportMessage && exportResultKind !== "audio-silent" && exportResultKind !== "audio-voice-only" && (
        <div className={`${studioPanel} flex items-start gap-3`}>
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <p className="text-sm leading-relaxed text-foreground/90">{exportMessage}</p>
            {exportWarning && (
              <p className="mt-2 text-xs leading-relaxed text-muted">{exportWarning}</p>
            )}
          </div>
        </div>
      )}

      {exportState === "done" && exportMessage && exportResultKind === "audio-silent" && (
        <div className={`${studioWarningPanel} flex items-start gap-3`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500/80" />
          <div>
            <p className="text-sm leading-relaxed text-amber-100/90">{exportMessage}</p>
            {exportWarning && (
              <p className="mt-2 text-xs leading-relaxed text-amber-200/50">{exportWarning}</p>
            )}
          </div>
        </div>
      )}

      {exportState === "done" && exportWarning && exportResultKind !== "audio-silent" && exportResultKind !== "audio-voice-only" && !exportMessage && (
        <div className={`${studioWarningPanel} flex items-start gap-3`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500/80" />
          <p className="text-sm leading-relaxed text-amber-200/70">{exportWarning}</p>
        </div>
      )}

      {errorMessage && (
        <div className={studioError}>
          <p className="text-sm leading-relaxed">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
