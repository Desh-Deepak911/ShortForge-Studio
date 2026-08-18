"use client";

/**
 * Local-dev Preview + Browser export harness for per-media trim certification.
 * In-memory frozen story only. Does not touch saved drafts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import CaptionPreviewOverlay from "@/features/caption-layout-drag/CaptionPreviewOverlay";
import { prepareExportRequest, type PrepareExportRequestResult } from "@/features/export/domain";
import { exportFootieShortFromManifest } from "@/features/export/services/video-render.service";
import { setExportDownloadCaptureHandler } from "@/features/export/utils/download.utils";
import PreviewFrame from "@/features/preview/components/PreviewFrame";
import { resolvePreviewSelectedMediaInspection } from "@/features/preview/runtime-parity/resolve-preview-selected-media-inspection";
import {
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
} from "@/features/preview/runtime-parity/preview-runtime-parity-certification-capture";
import { buildPerMediaVideoTrimStory } from "@/features/preview/video-trim-preview/build-per-media-video-trim-story";
import {
  PER_MEDIA_VIDEO_TRIM_ITEM_A_ID,
  PER_MEDIA_VIDEO_TRIM_ITEM_B_ID,
  PER_MEDIA_VIDEO_TRIM_SAMPLES,
  type PerMediaVideoTrimSampleId,
} from "@/features/preview/video-trim-preview/per-media-video-trim-contract";
import {
  VideoTrimPreviewProvider,
  buildVideoTrimPreviewOverride,
  useVideoTrimPreview,
} from "@/features/preview/video-trim-preview";
import { resolveActiveSceneMediaRenderView } from "@/features/scene-media-timeline";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

type ExportStatus = "idle" | "running" | "done" | "failed";

interface BrowserExportResult {
  readonly ok: boolean;
  readonly bytes: number;
  readonly mimeType: string;
  readonly base64: string;
  readonly error: string | null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function TrimScrubControls({
  sceneId,
  selectedMediaItemId,
}: {
  readonly sceneId: string;
  readonly selectedMediaItemId: string | null;
}) {
  const trimPreview = useVideoTrimPreview();
  return (
    <button
      type="button"
      data-per-media-video-trim-scrub-b=""
      onClick={() => {
        if (!selectedMediaItemId) return;
        trimPreview.setOverride(
          buildVideoTrimPreviewOverride({
            sceneId,
            mediaItemId: selectedMediaItemId,
            trimStartMs: 2_000,
            trimEndMs: 5_000,
            activeHandle: "start",
            sourceDurationMs: 6_000,
            surface: "inspector",
          }),
        );
      }}
    >
      Scrub item B start
    </button>
  );
}

declare global {
  interface Window {
    __PER_MEDIA_VIDEO_TRIM_CERT__?: {
      seek: (sampleId: PerMediaVideoTrimSampleId) => void;
      selectItem: (id: string | null) => void;
      play: (playing: boolean) => void;
      exportBrowser: () => Promise<BrowserExportResult>;
      snapshot: () => {
        sceneElapsedMs: number;
        selectedMediaItemId: string | null;
        isPlaying: boolean;
        mediaItemId: string | null;
        itemElapsedMs: number;
      };
      exportResult: BrowserExportResult | null;
      ready: boolean;
    };
  }
}

export function PerMediaVideoTrimQaHarness() {
  const story = useMemo(() => buildPerMediaVideoTrimStory(), []);
  const scene = story.scenes[0]!;
  const sceneDurationMs = getSceneDurationMs(scene);
  const [sampleId, setSampleId] = useState<PerMediaVideoTrimSampleId>("item-a-early");
  const [selectedMediaItemId, setSelectedMediaItemId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportResult, setExportResult] = useState<BrowserExportResult | null>(null);

  const sample =
    PER_MEDIA_VIDEO_TRIM_SAMPLES.find((entry) => entry.id === sampleId) ??
    PER_MEDIA_VIDEO_TRIM_SAMPLES[0]!;
  const sceneElapsedMs = sample.sceneElapsedMs;
  const inspectId = sample.inspectMediaItemId ?? selectedMediaItemId;
  const playing = sample.isPlaying === true || isPlaying;

  const inspection = useMemo(
    () =>
      resolvePreviewSelectedMediaInspection({
        scene,
        selectedMediaItemId: inspectId,
        sceneElapsedMs,
        isPlaying: playing,
        mixedMediaScenesEnabled: true,
      }),
    [inspectId, playing, scene, sceneElapsedMs],
  );

  const view = resolveActiveSceneMediaRenderView(
    scene,
    inspection.active ? inspection.inspectionSceneElapsedMs : sceneElapsedMs,
    { mixedMediaScenesEnabled: true },
  );

  const runBrowserExport = useCallback(async (): Promise<BrowserExportResult> => {
    const capture: { blob: Blob | null } = { blob: null };
    setExportDownloadCaptureHandler((blob) => {
      capture.blob = blob;
    });
    setExportStatus("running");
    try {
      const prepared: PrepareExportRequestResult = await prepareExportRequest({
        story,
        mixedMediaScenesEnabled: true,
        options: {
          exportSettings: {
            format: "webm",
            resolution: "1080x1920",
            quality: "standard",
          },
          audioMode: "silent",
        },
        throwIfBlocked: true,
      });
      if (!prepared.preflight.supported || prepared.renderer !== "browser") {
        const failed = {
          ok: false,
          bytes: 0,
          mimeType: "",
          base64: "",
          error: `renderer=${prepared.renderer}`,
        };
        setExportResult(failed);
        setExportStatus("failed");
        return failed;
      }
      await exportFootieShortFromManifest(prepared, () => undefined, {
        audioFallback: "silent",
      });
      const blob = capture.blob;
      if (!blob || blob.size <= 0) {
        const failed = {
          ok: false,
          bytes: 0,
          mimeType: "",
          base64: "",
          error: "empty Browser export Blob",
        };
        setExportResult(failed);
        setExportStatus("failed");
        return failed;
      }
      const result = {
        ok: true,
        bytes: blob.size,
        mimeType: blob.type || "video/webm",
        base64: await blobToBase64(blob),
        error: null,
      };
      setExportResult(result);
      setExportStatus("done");
      return result;
    } catch (error) {
      const failed = {
        ok: false,
        bytes: 0,
        mimeType: "",
        base64: "",
        error: error instanceof Error ? error.message : String(error),
      };
      setExportResult(failed);
      setExportStatus("failed");
      return failed;
    } finally {
      setExportDownloadCaptureHandler(null);
    }
  }, [story]);

  useEffect(() => {
    window.__PER_MEDIA_VIDEO_TRIM_CERT__ = {
      seek: (id) => {
        setSampleId(id);
        const next = PER_MEDIA_VIDEO_TRIM_SAMPLES.find((entry) => entry.id === id);
        setSelectedMediaItemId(next?.inspectMediaItemId ?? null);
        setIsPlaying(next?.isPlaying === true);
      },
      selectItem: (id) => setSelectedMediaItemId(id),
      play: (next) => setIsPlaying(next),
      exportBrowser: runBrowserExport,
      snapshot: () => ({
        sceneElapsedMs,
        selectedMediaItemId: inspectId,
        isPlaying: playing,
        mediaItemId: inspection.active
          ? inspection.selectedMediaItemId
          : view.mediaItemId,
        itemElapsedMs: inspection.active
          ? inspection.inspectionItemElapsedMs
          : view.itemElapsedMs,
      }),
      exportResult,
      ready: true,
    };
    return () => {
      delete window.__PER_MEDIA_VIDEO_TRIM_CERT__;
    };
  }, [
    exportResult,
    inspectId,
    inspection,
    playing,
    runBrowserExport,
    sceneElapsedMs,
    view.itemElapsedMs,
    view.mediaItemId,
  ]);

  return (
    <VideoTrimPreviewProvider>
      <main
        data-per-media-video-trim-qa=""
        data-per-media-video-trim-ready="true"
        style={{ padding: 16, color: "#e5e7eb", background: "#0b1220", minHeight: "100vh" }}
      >
        <h1>Per-media video trim QA</h1>
        <p>
          Sample {sample.id} · scene {sceneElapsedMs}ms · item{" "}
          {inspection.active ? inspection.selectedMediaItemId : view.mediaItemId}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {PER_MEDIA_VIDEO_TRIM_SAMPLES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-per-media-video-trim-sample={entry.id}
              onClick={() => {
                setSampleId(entry.id);
                setSelectedMediaItemId(entry.inspectMediaItemId ?? null);
                setIsPlaying(entry.isPlaying === true);
              }}
            >
              {entry.id}
            </button>
          ))}
          <button
            type="button"
            data-per-media-video-trim-select-b=""
            onClick={() => setSelectedMediaItemId(PER_MEDIA_VIDEO_TRIM_ITEM_B_ID)}
          >
            Select B
          </button>
          <button
            type="button"
            data-per-media-video-trim-select-a=""
            onClick={() => setSelectedMediaItemId(PER_MEDIA_VIDEO_TRIM_ITEM_A_ID)}
          >
            Select A
          </button>
          <TrimScrubControls
            sceneId={scene.id}
            selectedMediaItemId={selectedMediaItemId}
          />
          <button
            type="button"
            data-per-media-video-trim-export=""
            onClick={() => void runBrowserExport()}
            disabled={exportStatus === "running"}
          >
            Browser export
          </button>
        </div>
        <p data-per-media-video-trim-export-status={exportStatus}>
          Export: {exportStatus}
          {exportResult?.error ? ` (${exportResult.error})` : ""}
        </p>
        <div
          data-per-media-video-trim-preview=""
          data-preview-runtime-parity-cert-capture-surface=""
          style={{
            width: PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
            height: PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
          }}
        >
          <PreviewFrame
            title={story.title}
            previewFrame={{ kind: "scene", scene, sceneIndex: 0 }}
            selectedMediaItemId={inspectId}
            inspectionPresentation={inspection}
            sceneElapsedMs={
              inspection.active ? inspection.inspectionSceneElapsedMs : sceneElapsedMs
            }
            sceneDurationMs={sceneDurationMs}
            isPlaying={playing}
            maxWidth={PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX}
            mixedMediaScenesEnabled
            contentTimeMs={sceneElapsedMs}
            contentDurationMs={sceneDurationMs}
            certificationCaptureMode
            watermarkEnabled={false}
            overlay={
              <CaptionPreviewOverlay
                scene={scene}
                script={story}
                pillClassName="preview-narration-subtitle-pill"
                draggable={false}
                allowPointerEvents={false}
              >
                {scene.subtitle}
              </CaptionPreviewOverlay>
            }
          />
        </div>
      </main>
    </VideoTrimPreviewProvider>
  );
}
