"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Download,
  Film,
  Loader2,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  DEFAULT_EXPORT_QUALITY,
  EXPORT_QUALITY_PRESETS,
  exportFootieShort,
  getExportQualityPreset,
  isExportQualityId,
  type ExportProgress,
  type ExportQualityId,
} from "@/lib/exportVideo";
import type { FootieScript } from "@/types/footiebitz";

interface ExportPanelProps {
  script: FootieScript;
}

interface ChecklistItem {
  label: string;
  done: boolean;
  detail?: string;
}

type ExportState = ExportProgress["status"] | "idle";

export default function ExportPanel({ script }: ExportPanelProps) {
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityId, setQualityId] = useState<ExportQualityId>(DEFAULT_EXPORT_QUALITY);

  const selectedQuality = getExportQualityPreset(qualityId);

  const sceneCount = script.scenes.length;
  const uploadedCount = script.scenes.filter((scene) => scene.uploadedImage).length;
  const allImagesUploaded = sceneCount > 0 && uploadedCount === sceneCount;
  const totalDuration = script.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const isExporting =
    exportState === "preparing" ||
    exportState === "rendering" ||
    exportState === "finalizing";
  const checklist = useMemo<ChecklistItem[]>(
    () => [
      {
        label: "Script generated",
        done: Boolean(script.title && script.hook),
        detail: script.title,
      },
      {
        label: "Scenes created",
        done: sceneCount >= 5,
        detail: `${sceneCount} scenes · ${totalDuration}s total`,
      },
      {
        label: "Images uploaded",
        done: allImagesUploaded,
        detail: `${uploadedCount} of ${sceneCount} scenes`,
      },
      {
        label: "Ready to export",
        done: sceneCount >= 5,
        detail: allImagesUploaded ? "All scenes have images" : "Placeholders used for missing images",
      },
    ],
    [script.title, script.hook, sceneCount, totalDuration, uploadedCount, allImagesUploaded],
  );

  const readyCount = checklist.filter((item) => item.done).length;

  const handleExport = async () => {
    setErrorMessage(null);
    setExportMessage(null);
    setProgress(0);
    setExportState("preparing");

    try {
      await exportFootieShort(
        script,
        (update) => {
          setExportState(update.status);
          setProgress(update.progress);
          setExportMessage(update.message);
        },
        qualityId,
      );
    } catch (error) {
      setExportState("error");
      setErrorMessage(error instanceof Error ? error.message : "Export failed");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-xl shadow-black/25 backdrop-blur-md sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 ring-1 ring-emerald-500/20">
            <Film className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
              Step 4 · Export
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">Download your short</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Render a vertical 9:16 video in-browser as WebM.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-white/10 bg-[#0a0f18] px-4 py-2.5">
          <Video className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold text-white">{readyCount}/4</span>
          <span className="text-xs text-zinc-500">checks</span>
        </div>
      </div>

      <ul className="mt-7 space-y-2.5">
        {checklist.map((item) => (
          <li
            key={item.label}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
              item.done
                ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                : "border-white/5 bg-[#0a0f18]/80"
            }`}
          >
            {item.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-zinc-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${item.done ? "text-white" : "text-zinc-300"}`}>
                {item.label}
              </p>
              {item.detail && (
                <p className="mt-0.5 truncate text-xs text-zinc-500">{item.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!allImagesUploaded && sceneCount > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-amber-500/[0.03] px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-100">Missing scene images</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
              {uploadedCount} of {sceneCount} scenes have images. Missing scenes will use
              gradient placeholders in the export.
            </p>
          </div>
        </div>
      )}

      {isExporting && (
        <div className="mt-5 rounded-xl border border-emerald-500/20 bg-[#0a0f18] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <span className="text-sm font-semibold text-white">
                {exportState === "preparing" && "Preparing export..."}
                {exportState === "rendering" && "Rendering video..."}
                {exportState === "finalizing" && "Finalizing file..."}
              </span>
            </div>
            <span className="text-sm font-bold text-emerald-400">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-300 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {exportMessage && (
            <p className="mt-3 text-xs text-zinc-500">{exportMessage}</p>
          )}
          <p className="mt-2 text-[11px] text-zinc-600">
            Recording in real time (~{totalDuration}s). Keep this tab open.
          </p>
        </div>
      )}

      <div className="mt-7 rounded-xl border border-white/5 bg-[#0a0f18]/60 p-4">
        <label htmlFor="export-quality" className="mb-2 block text-sm font-medium text-zinc-300">
          Export quality
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
            disabled={isExporting}
            className="w-full appearance-none rounded-xl border border-white/10 bg-[#06080f] px-4 py-3.5 pr-10 text-sm text-white outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {EXPORT_QUALITY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}: {preset.width} x {preset.height}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || sceneCount === 0}
          className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition hover:from-emerald-400 hover:to-emerald-500 hover:shadow-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 transition group-hover:scale-110" />
              Export Video
            </>
          )}
        </button>
        <p className="mt-3 text-center text-[11px] text-zinc-600">
          Downloads as{" "}
          <span className="text-zinc-500">footiebitz-{selectedQuality.id}.webm</span> ·{" "}
          {selectedQuality.width}×{selectedQuality.height} · 9:16
        </p>
      </div>

      {exportState === "done" && exportMessage && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3.5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <p className="text-sm leading-relaxed text-emerald-200">{exportMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3.5">
          <p className="text-sm leading-relaxed text-red-300">{errorMessage}</p>
        </div>
      )}
    </section>
  );
}
