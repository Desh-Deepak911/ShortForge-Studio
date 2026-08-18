"use client";

/**
 * Local-dev Browser export harness for the frozen Prompt 2B story.
 * In-memory only. Does not touch saved drafts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import CaptionPreviewOverlay from "@/features/caption-layout-drag/CaptionPreviewOverlay";
import { prepareExportRequest, type PrepareExportRequestResult } from "@/features/export/domain";
import { exportFootieShortFromManifest } from "@/features/export/services/video-render.service";
import { setExportDownloadCaptureHandler } from "@/features/export/utils/download.utils";
import PreviewFrame from "@/features/preview/components/PreviewFrame";
import { buildCurrentVisualFeatureBundleStory } from "@/features/preview/video-trim-preview/build-current-visual-feature-bundle-story";
import {
  CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
  CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES,
  type CurrentVisualFeatureBundleSampleId,
} from "@/features/preview/video-trim-preview/current-visual-feature-bundle-contract";
import {
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
} from "@/features/preview/runtime-parity/preview-runtime-parity-certification-capture";
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

declare global {
  interface Window {
    __CURRENT_VISUAL_FEATURE_BUNDLE_CERT__?: {
      seek: (sampleId: CurrentVisualFeatureBundleSampleId) => void;
      exportBrowser: () => Promise<BrowserExportResult>;
      snapshot: () => { timestampMs: number };
      exportResult: BrowserExportResult | null;
      ready: boolean;
    };
  }
}

export function CurrentVisualFeatureBundleQaHarness() {
  const story = useMemo(() => buildCurrentVisualFeatureBundleStory(), []);
  const scene = story.scenes[0]!;
  const sceneDurationMs = getSceneDurationMs(scene);
  const [sampleId, setSampleId] = useState<CurrentVisualFeatureBundleSampleId>(
    "item-a-early",
  );
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportResult, setExportResult] = useState<BrowserExportResult | null>(null);

  const sample =
    CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES.find((entry) => entry.id === sampleId) ??
    CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES[0]!;
  const timestampMs = sample.timestampMs;
  const sceneElapsedMs = Math.min(timestampMs, sceneDurationMs);

  const runBrowserExport = useCallback(async (): Promise<BrowserExportResult> => {
    const capture: { blob: Blob | null } = { blob: null };
    setExportDownloadCaptureHandler((blob) => {
      capture.blob = blob;
    });
    setExportStatus("running");
    try {
      const prepared: PrepareExportRequestResult = await prepareExportRequest({
        story,
        ...CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
        options: {
          exportSettings: {
            format: "webm",
            resolution: "1080x1920",
            quality: "standard",
          },
          audioMode: "silent",
          ...CURRENT_VISUAL_FEATURE_BUNDLE_CAPABILITY,
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
    window.__CURRENT_VISUAL_FEATURE_BUNDLE_CERT__ = {
      seek: (id) => setSampleId(id),
      exportBrowser: runBrowserExport,
      snapshot: () => ({ timestampMs }),
      exportResult,
      ready: true,
    };
    return () => {
      delete window.__CURRENT_VISUAL_FEATURE_BUNDLE_CERT__;
    };
  }, [exportResult, runBrowserExport, timestampMs]);

  return (
    <main
      data-current-visual-feature-bundle-qa=""
      data-current-visual-feature-bundle-ready="true"
      style={{ padding: 16, color: "#e5e7eb", background: "#0b1220", minHeight: "100vh" }}
    >
      <h1>Current visual feature bundle QA</h1>
      <p>
        Sample {sample.id} · {timestampMs}ms
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-current-visual-feature-bundle-sample={entry.id}
            onClick={() => setSampleId(entry.id)}
          >
            {entry.id}
          </button>
        ))}
        <button
          type="button"
          data-current-visual-feature-bundle-export=""
          onClick={() => void runBrowserExport()}
          disabled={exportStatus === "running"}
        >
          Browser export
        </button>
      </div>
      <p data-current-visual-feature-bundle-export-status={exportStatus}>
        Export: {exportStatus}
        {exportResult?.error ? ` (${exportResult.error})` : ""}
      </p>
      <div
        data-current-visual-feature-bundle-preview=""
        data-preview-runtime-parity-cert-capture-surface=""
        style={{
          width: PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
          height: PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
        }}
      >
        <PreviewFrame
          title={story.title}
          previewFrame={{ kind: "scene", scene, sceneIndex: 0 }}
          sceneElapsedMs={sceneElapsedMs}
          sceneDurationMs={sceneDurationMs}
          isPlaying={false}
          maxWidth={PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX}
          mixedMediaScenesEnabled
          contentTimeMs={timestampMs}
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
  );
}
