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
import { useMemo, useState } from "react";

import {
  buildExportDownloadFileName,
  exportFootieShort,
  getDefaultExportAudioMode,
  isExportFormat,
  isExportQualityTier,
  isExportResolution,
  isHighQualityExportSettings,
  isWebmExportAvailable,
  normalizeExportSettings,
  resolveEffectiveExportSettings,
  resolveExportSettings,
  type ExportAudioMode,
  type ExportProgress,
} from "@/features/export/services";
import {
  studioBadge,
  studioChecklistItem,
  studioError,
  studioGlass,
  studioIconBox,
  studioInput,
  studioLabel,
  studioOptionRow,
  studioPanel,
  studioPrimaryButton,
  studioSectionDesc,
  studioSectionTitle,
  studioSelect,
  studioSelectChevron,
  studioStepLabel,
  studioWarningPanel,
} from "@/lib/studioUi";
import { syncFootieScript } from "@/lib/voiceover";
import { sceneHasImage } from "@/features/story/utils";
import type { ExportSettings, FootieScript } from "@/features/story/types";

interface ExportPanelProps {
  script: FootieScript;
  disabled?: boolean;
  compact?: boolean;
  /** Called when export settings change so drafts can persist them on save. */
  onExportSettingsChange?: (settings: ExportSettings) => void;
}

interface ChecklistItem {
  label: string;
  done: boolean;
  detail?: string;
}

type ExportState = ExportProgress["status"] | "idle";

export default function ExportPanel({
  script,
  disabled = false,
  compact = false,
  onExportSettingsChange,
}: ExportPanelProps) {
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [includeNarrationPreference, setIncludeNarrationPreference] = useState(true);
  const baseExportSettings = useMemo((): ExportSettings => {
    const next = resolveExportSettings(script);
    return !isWebmExportAvailable() && next.format === "webm"
      ? { ...next, format: "mp4" as const }
      : next;
  }, [script]);

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

  const effectiveExportSettings = useMemo(
    () => resolveEffectiveExportSettings(exportSettings).settings,
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
        label: script.voiceoverUrl ? "Narration ready" : "Narration not created yet",
        done: Boolean(script.voiceoverUrl),
        detail: script.voiceoverUrl
          ? "Ready for Play Preview and export"
          : "Complete step 4 to add narration",
      },
      {
        label: "Ready to export",
        done: sceneCount > 0,
        detail: allImagesUploaded ? "All scenes have images" : "Placeholders used for missing images",
      },
    ],
    [script.title, script.narration, script.voiceoverUrl, sceneCount, totalDuration, uploadedCount, allImagesUploaded],
  );

  const readyCount = checklist.filter((item) => item.done).length;
  const hasNarration = Boolean(script.voiceoverUrl);
  const includeNarration = hasNarration && includeNarrationPreference;
  const exportAudioMode = useMemo((): ExportAudioMode => {
    if (!includeNarration) return "silent";
    return getDefaultExportAudioMode(true);
  }, [includeNarration]);
  const exportWithNarration = exportAudioMode === "with-voice" && hasNarration;
  const showAudioMergeNote =
    exportWithNarration && isHighQualityExportSettings(effectiveExportSettings);
  const downloadFileName = buildExportDownloadFileName(effectiveExportSettings);
  const [exportWidth, exportHeight] = effectiveExportSettings.resolution
    .split("x")
    .map(Number);
  const isBusy = isExporting || disabled;

  const handleExport = async () => {
    setErrorMessage(null);
    setExportWarning(null);
    setExportMessage(null);
    setProgress(0);
    setExportState("preparing");

    try {
      const normalizedExportSettings = normalizeExportSettings(exportSettings, script.title);

      await exportFootieShort(
        syncFootieScript(script),
        (update) => {
          setExportState(update.status);
          setProgress(update.progress);
          setExportMessage(update.message);
          setExportWarning(update.warning ?? null);
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
      setErrorMessage(error instanceof Error ? error.message : "Export failed");
    }
  };

  return (
    <div className={compact ? "space-y-5" : "space-y-7"}>
      {!compact ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={studioIconBox}>
              <Film className="h-4.5 w-4.5 text-accent" strokeWidth={1.75} />
            </div>
            <div>
              <p className={studioStepLabel}>Step 6</p>
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
          <p className="text-xs text-muted">Pre-export checklist</p>
          <span className={`${studioBadge} shrink-0`}>
            <span className="font-semibold text-foreground/90">{readyCount}/{checklist.length}</span>
          </span>
        </div>
      )}

      <ul className="space-y-2">
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

      {isExporting && (
        <div className={`${studioGlass} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span className="text-sm font-medium text-foreground/90">
                {exportState === "preparing" && "Preparing export..."}
                {exportState === "rendering" && `Rendering video (${progress}%)`}
                {exportState === "loading-voiceover" && "Loading narration"}
                {exportState === "combining" && (exportMessage ?? "Combining audio")}
                {exportState === "finalizing" && "Finalizing file..."}
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
              ? "Rendering follows your scene timeline, then narration is merged in-browser. Keep this tab open."
              : `Rendering follows your scene timeline (~${totalDuration}s). Keep this tab open.`}
          </p>
        </div>
      )}

      <div className={`${studioPanel}`}>
        <label
          className={`${studioOptionRow(includeNarration && hasNarration)} mb-4 ${
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
            <span className="block text-sm font-medium text-foreground/90">Include Narration</span>
            <span className="mt-0.5 block text-xs text-muted">
              {hasNarration
                ? `Muxes narration into the final ${effectiveExportSettings.format.toUpperCase()} export`
                : "Create narration in step 4 first"}
            </span>
          </span>
        </label>

        <div className="mb-5 border-t border-border/20 pt-4">
          <p className="mb-4 text-sm font-medium text-foreground/90">Export settings</p>

          <label htmlFor="export-file-name" className={studioLabel}>
            File name
          </label>
          <input
            id="export-file-name"
            type="text"
            value={exportSettings.fileName}
            onChange={(e) => updateExportSettings({ fileName: e.target.value })}
            disabled={isBusy}
            className={`${studioInput} mb-4`}
            placeholder="story-short"
          />

          <label htmlFor="export-format" className={studioLabel}>
            Format
          </label>
          <div className="relative mb-1">
            <select
              id="export-format"
              value={effectiveExportSettings.format}
              onChange={(e) => {
                const value = e.target.value;
                if (isExportFormat(value)) {
                  updateExportSettings({ format: value });
                }
              }}
              disabled={isBusy}
              className={studioSelect}
            >
              <option value="mp4">MP4</option>
              {isWebmExportAvailable() ? (
                <option value="webm">WebM</option>
              ) : (
                <option value="webm" disabled>
                  WebM (Coming soon)
                </option>
              )}
            </select>
            <ChevronDown className={studioSelectChevron} />
          </div>
          {!isWebmExportAvailable() && (
            <p className="mb-4 text-xs text-muted">WebM export is coming soon. MP4 is fully supported.</p>
          )}

          <label htmlFor="export-resolution" className={studioLabel}>
            Resolution
          </label>
          <div className="relative mb-4">
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

          <label htmlFor="export-quality-tier" className={studioLabel}>
            Quality
          </label>
          <div className="relative">
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

        {showAudioMergeNote && (
          <p className="mb-4 text-xs leading-relaxed text-muted">
            Narration merge can take longer for high-quality 1080p exports.
          </p>
        )}

        <button
          type="button"
          onClick={handleExport}
          disabled={isBusy || sceneCount < 1}
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
        <p className="mt-3 text-center text-[11px] text-muted">
          Download{" "}
          <span className="text-muted">{downloadFileName}</span> · {exportWidth}×{exportHeight} · 9:16
          {exportWithNarration && " · with narration"}
        </p>
      </div>

      {exportState === "done" && exportMessage && (
        <div className={`${studioPanel} flex items-start gap-3`}>
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p className="text-sm leading-relaxed text-foreground/90">{exportMessage}</p>
        </div>
      )}

      {exportWarning && (
        <div className={`${studioWarningPanel} flex items-start gap-3`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500/80" />
          <div>
            <p className="text-sm font-medium text-amber-100/90">Narration merge failed</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-200/70">{exportWarning}</p>
            <p className="mt-2 text-xs leading-relaxed text-amber-200/50">
              Your silent video was downloaded instead.
            </p>
          </div>
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
