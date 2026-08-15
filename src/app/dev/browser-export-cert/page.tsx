"use client";

/**
 * Dev-only Browser export certification harness.
 * Real production path only: prepareExportRequest → exportFootieShortFromManifest.
 * Captures Blobs via setExportDownloadCaptureHandler — never FFmpeg substitutes.
 * Unavailable in production.
 */

import { useCallback, useEffect, useState } from "react";

import {
  prepareExportRequest,
  type PrepareExportRequestResult,
} from "@/features/export/domain";
import { exportFootieShortFromManifest } from "@/features/export/services/video-render.service";
import { setExportDownloadCaptureHandler } from "@/features/export/utils/download.utils";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

export type BrowserExportCertCaseId =
  | "native_vertical_1080_fill"
  | "landscape_4k_to_1080_fill_1x"
  | "landscape_4k_to_1080_fill_1_25x"
  | "landscape_fit"
  | "landscape_fit_with_background"
  | "trimmed_moving"
  | "captioned"
  | "post_title_no_caption";

type CaseSpec = {
  readonly id: BrowserExportCertCaseId;
  readonly filename: string;
  readonly label: string;
  readonly durationMs: number;
  readonly fixturePath: string;
  readonly width: number;
  readonly height: number;
  readonly fitMode: "cover" | "contain";
  readonly scale: number;
  readonly backgroundTreatment?: "blurred_fill";
  readonly trimStartMs?: number;
  readonly trimEndMs?: number;
  readonly captioned: boolean;
  readonly title: string;
};

const CASES: readonly CaseSpec[] = [
  {
    id: "native_vertical_1080_fill",
    filename: "01-native-vertical-1080-fill.webm",
    label: "Native vertical 1080p Fill",
    durationMs: 1000,
    fixturePath: "/api/dev/browser-export-fixture/native_vertical_motion",
    width: 1080,
    height: 1920,
    fitMode: "cover",
    scale: 1,
    captioned: false,
    title: "Native Fill",
  },
  {
    id: "landscape_4k_to_1080_fill_1x",
    filename: "02-landscape-4k-to-1080-fill-1x.webm",
    label: "Landscape 4K → 1080p Fill 1×",
    durationMs: 1000,
    fixturePath: "/api/dev/browser-export-fixture/landscape_motion",
    width: 3840,
    height: 2160,
    fitMode: "cover",
    scale: 1,
    captioned: false,
    title: "Fill 1x",
  },
  {
    id: "landscape_4k_to_1080_fill_1_25x",
    filename: "03-landscape-4k-to-1080-fill-1_25x.webm",
    label: "Landscape 4K → 1080p Fill 1.25×",
    durationMs: 1000,
    fixturePath: "/api/dev/browser-export-fixture/landscape_motion",
    width: 3840,
    height: 2160,
    fitMode: "cover",
    scale: 1.25,
    captioned: false,
    title: "Fill 1.25x",
  },
  {
    id: "landscape_fit",
    filename: "04-landscape-fit.webm",
    label: "Landscape Fit",
    durationMs: 1000,
    fixturePath: "/api/dev/browser-export-fixture/landscape_motion",
    width: 3840,
    height: 2160,
    fitMode: "contain",
    scale: 1,
    captioned: false,
    title: "Landscape Fit",
  },
  {
    id: "landscape_fit_with_background",
    filename: "05-landscape-fit-with-background.webm",
    label: "Landscape Fit with background",
    durationMs: 1000,
    fixturePath: "/api/dev/browser-export-fixture/landscape_motion",
    width: 3840,
    height: 2160,
    fitMode: "contain",
    scale: 1,
    backgroundTreatment: "blurred_fill",
    captioned: false,
    title: "Fit with background",
  },
  {
    id: "trimmed_moving",
    filename: "06-trimmed-moving.webm",
    label: "Trimmed moving video",
    durationMs: 1000,
    fixturePath: "/api/dev/browser-export-fixture/slower_camera_tracking",
    width: 1920,
    height: 1080,
    fitMode: "cover",
    scale: 1,
    trimStartMs: 400,
    trimEndMs: 1400,
    captioned: false,
    title: "Trimmed motion",
  },
  {
    id: "captioned",
    filename: "07-captioned.webm",
    label: "Captioned video",
    durationMs: 1000,
    fixturePath: "/api/dev/browser-export-fixture/slower_camera_tracking",
    width: 1920,
    height: 1080,
    fitMode: "cover",
    scale: 1,
    captioned: true,
    title: "Captioned",
  },
  {
    id: "post_title_no_caption",
    filename: "08-post-title-no-caption.webm",
    label: "No-caption post-title",
    durationMs: 2500,
    fixturePath: "/api/dev/browser-export-fixture/native_vertical_motion",
    width: 1080,
    height: 1920,
    fitMode: "cover",
    scale: 1,
    captioned: false,
    title: "Post Title Bright Frame",
  },
] as const;

type CaseResult = {
  readonly id: BrowserExportCertCaseId;
  readonly filename: string;
  readonly ok: boolean;
  readonly bytes: number;
  readonly mimeType: string;
  readonly base64: string;
  readonly error: string | null;
  readonly renderer: string | null;
};

function buildMedia(spec: CaseSpec): SceneMedia {
  return {
    type: "video",
    url: spec.fixturePath,
    source: "upload",
    mimeType: "video/mp4",
    width: spec.width,
    height: spec.height,
    durationMs: 2000,
    muted: true,
    fitMode: spec.fitMode,
    transform: { x: 0, y: 0, scale: spec.scale, rotation: 0 },
    ...(spec.backgroundTreatment
      ? { backgroundTreatment: spec.backgroundTreatment }
      : {}),
    ...(spec.trimStartMs != null ? { trimStartMs: spec.trimStartMs } : {}),
    ...(spec.trimEndMs != null ? { trimEndMs: spec.trimEndMs } : {}),
  };
}

function buildStory(spec: CaseSpec): FootieScript {
  const durationSec = Math.max(1, Math.ceil(spec.durationMs / 1000));
  const scene: FootieScene = {
    id: `bec-${spec.id}`,
    start: 0,
    end: durationSec,
    duration: durationSec,
    startMs: 0,
    endMs: spec.durationMs,
    durationMs: spec.durationMs,
    subtitle: spec.captioned ? "Caption stays readable on export." : "",
    narration: spec.captioned
      ? "Caption stays readable on export."
      : "Silent certification clip.",
    captionMode: "subtitles",
    media: buildMedia(spec),
  };

  return syncFootieScript({
    title: spec.title,
    narration: scene.narration ?? "Silent certification clip.",
    totalDuration: durationSec,
    scenes: [scene],
    exportSettings: {
      fileName: spec.filename.replace(/\.webm$/i, ""),
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
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

async function runCase(spec: CaseSpec): Promise<CaseResult> {
  const capture: { blob: Blob | null; filename: string | null } = {
    blob: null,
    filename: null,
  };
  setExportDownloadCaptureHandler((blob, filename) => {
    capture.blob = blob;
    capture.filename = filename;
  });

  try {
    const story = buildStory(spec);
    const prepared: PrepareExportRequestResult = await prepareExportRequest({
      story,
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
      return {
        id: spec.id,
        filename: spec.filename,
        ok: false,
        bytes: 0,
        mimeType: "",
        base64: "",
        error: `preflight renderer=${prepared.renderer} supported=${prepared.preflight.supported}`,
        renderer: prepared.renderer,
      };
    }

    await exportFootieShortFromManifest(
      prepared,
      () => {
        /* progress ignored for certification capture */
      },
      { audioFallback: "silent" },
    );

    const blob = capture.blob;
    if (!blob || blob.size <= 0) {
      return {
        id: spec.id,
        filename: spec.filename,
        ok: false,
        bytes: 0,
        mimeType: "",
        base64: "",
        error: "empty Blob from Browser exporter",
        renderer: prepared.renderer,
      };
    }

    return {
      id: spec.id,
      filename: spec.filename,
      ok: true,
      bytes: blob.size,
      mimeType: blob.type || "video/webm",
      base64: await blobToBase64(blob),
      error: null,
      renderer: prepared.renderer,
    };
  } catch (error) {
    return {
      id: spec.id,
      filename: spec.filename,
      ok: false,
      bytes: 0,
      mimeType: "",
      base64: "",
      error: error instanceof Error ? error.message : String(error),
      renderer: null,
    };
  } finally {
    setExportDownloadCaptureHandler(null);
  }
}

declare global {
  interface Window {
    __BROWSER_EXPORT_CERT__?: {
      status: "idle" | "running" | "done";
      results: CaseResult[];
    };
  }
}

export default function BrowserExportCertPage() {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [log, setLog] = useState<string>("Ready.");
  const [results, setResults] = useState<CaseResult[]>([]);

  const runMatrix = useCallback(async () => {
    if (process.env.NODE_ENV === "production") return;
    setStatus("running");
    setLog("Running Browser export matrix…");
    window.__BROWSER_EXPORT_CERT__ = { status: "running", results: [] };

    const next: CaseResult[] = [];
    for (const spec of CASES) {
      setLog(`Exporting ${spec.id}…`);
      const result = await runCase(spec);
      next.push(result);
      window.__BROWSER_EXPORT_CERT__ = {
        status: "running",
        results: [...next],
      };
      setResults([...next]);
      if (!result.ok) {
        setLog(`FAILED ${spec.id}: ${result.error}`);
      }
    }

    window.__BROWSER_EXPORT_CERT__ = { status: "done", results: next };
    setResults(next);
    setStatus("done");
    const okCount = next.filter((r) => r.ok).length;
    setLog(`Done: ${okCount}/${next.length} Browser Blobs captured.`);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__BROWSER_EXPORT_CERT__ = { status: "idle", results: [] };
  }, []);

  if (process.env.NODE_ENV === "production") {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm text-muted">
        Browser export certification is development-only.
      </main>
    );
  }

  return (
    <main
      className="mx-auto max-w-3xl space-y-4 p-8 text-sm text-foreground"
      data-browser-export-cert
    >
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted">
          Development
        </p>
        <h1 className="text-2xl font-semibold">Browser export certification</h1>
        <p className="text-muted">
          Real Browser path only (1080p WebM). Captures production Blobs via the
          download hook — not FFmpeg substitutes.
        </p>
      </header>

      <button
        type="button"
        data-browser-export-cert-run
        className="rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-40"
        disabled={status === "running"}
        onClick={() => void runMatrix()}
      >
        Run 1080p Browser matrix
      </button>

      <p data-browser-export-cert-status={status} className="text-[12px] text-muted">
        Status: {status} — {log}
      </p>

      <ul className="space-y-2 text-[12px]">
        {CASES.map((spec) => {
          const result = results.find((r) => r.id === spec.id);
          return (
            <li
              key={spec.id}
              data-browser-export-cert-case={spec.id}
              data-ok={result ? String(result.ok) : "pending"}
            >
              {spec.label}
              {result
                ? result.ok
                  ? ` — ok ${result.bytes} bytes`
                  : ` — FAIL ${result.error}`
                : " — pending"}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
