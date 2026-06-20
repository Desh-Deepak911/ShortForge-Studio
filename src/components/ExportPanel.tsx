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
  DEFAULT_EXPORT_QUALITY,
  EXPORT_QUALITY_PRESETS,
  exportFootieShort,
  getDefaultExportAudioMode,
  getExportQualityPreset,
  isExportQualityId,
  isHighQualityExport,
  type ExportAudioMode,
  type ExportProgress,
  type ExportQualityId,
} from "@/lib/exportVideo";
import {
  studioBadge,
  studioChecklistItem,
  studioError,
  studioGlass,
  studioIconBox,
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
import { sceneHasImage } from "@/lib/sceneImage";
import type { FootieScript } from "@/types/footiebitz";

interface ExportPanelProps {
  script: FootieScript;
  disabled?: boolean;
  compact?: boolean;
}

interface ChecklistItem {
  label: string;
  done: boolean;
  detail?: string;
}

type ExportState = ExportProgress["status"] | "idle";

export default function ExportPanel({ script, disabled = false, compact = false }: ExportPanelProps) {
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityId, setQualityId] = useState<ExportQualityId>(DEFAULT_EXPORT_QUALITY);
  const [includeNarrationPreference, setIncludeNarrationPreference] = useState(true);

  const selectedQuality = getExportQualityPreset(qualityId);

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
  const showAudioMergeNote = exportWithNarration && isHighQualityExport(qualityId);
  const isBusy = isExporting || disabled;

  const handleExport = async () => {
    setErrorMessage(null);
    setExportWarning(null);
    setExportMessage(null);
    setProgress(0);
    setExportState("preparing");

    try {
      await exportFootieShort(
        syncFootieScript(script),
        (update) => {
          setExportState(update.status);
          setProgress(update.progress);
          setExportMessage(update.message);
          setExportWarning(update.warning ?? null);
        },
        {
          qualityId,
          audioMode: exportAudioMode,
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
              <p className={studioSectionDesc}>Render a vertical 9:16 WebM from your timeline.</p>
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
                ? "Muxes narration into the final WebM export"
                : "Create narration in step 4 first"}
            </span>
          </span>
        </label>

        <label htmlFor="export-quality" className={studioLabel}>
          Export Quality
        </label>
        <div className="relative mb-4">
          <select
            id="export-quality"
            value={qualityId}
            onChange={(e) => {
              const value = e.target.value;
              if (isExportQualityId(value)) {
                setQualityId(value);
              }
            }}
            disabled={isBusy}
            className={studioSelect}
          >
            {EXPORT_QUALITY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.id === "4k" ? "4K" : preset.id} — {preset.width}×{preset.height}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevron} />
        </div>

        {showAudioMergeNote && (
          <p className="mb-4 text-xs leading-relaxed text-muted">
            Narration merge can take longer for 1080p or higher exports.
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
          <span className="text-muted">
            {exportWithNarration
              ? "footiebitz-with-narration.webm"
              : `footiebitz-${selectedQuality.id}.webm`}
          </span>{" "}
          · {selectedQuality.width}×{selectedQuality.height} · 9:16
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
