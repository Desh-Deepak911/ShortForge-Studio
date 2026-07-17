"use client";

/**
 * Dev-only Sprint 8 Scene Media QA harness (8E.1A tri-state evidence).
 * Not linked from production navigation. Unavailable in production.
 *
 * Uses production Preview adapters and the exact prepared production export path:
 * prepareExportRequest() → exportFootieShortFromManifest(prepared).
 * Structural validation never auto-claims local artifact Pass.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { SceneBackdrop } from "@/features/preview/components/PreviewFrame";
import {
  resolveActiveSceneMediaRenderView,
  resolveProjectedSceneMediaWindows,
} from "@/features/scene-media-timeline";
import {
  prepareExportRequest,
  type PrepareExportRequestResult,
} from "@/features/export/domain";
import { exportFootieShortFromManifest } from "@/features/export/services/video-render.service";
import { setExportDownloadCaptureHandler } from "@/features/export/utils/download.utils";
import { validateFinalExportArtifact } from "@/features/export/validation";
import {
  ARTIFACT_AUTOMATIC_CHECK_KEYS,
  ARTIFACT_VISUAL_CHECK_KEYS,
  assertPreparedManifestForSceneMediaQa,
  assertSafeEvidenceReport,
  buildArtifactPlaybackCheckpoints,
  buildSafeSceneMediaEvidenceReport,
  compareArtifactDuration,
  createEmptyChecklist,
  deriveArtifactEvidenceResult,
  deriveEditorEvidenceResult,
  derivePreviewEvidenceResult,
  EDITOR_CHECK_KEYS,
  EMPTY_ARTIFACT_AUTOMATIC_CHECKS,
  mapStructuralValidationToGenerationState,
  PREVIEW_CHECK_KEYS,
  type ArtifactAutomaticChecks,
  type ArtifactGenerationState,
  type ChecklistState,
  type DurationComparison,
  type EvidenceCheckResult,
} from "@/features/scene-media-timeline/qa/scene-media-local-evidence";
import {
  buildSceneMediaGoldenFixture,
  SCENE_MEDIA_GOLDEN_PROJECTS,
  type SceneMediaGoldenId,
} from "@/verification/scene-media-timeline/goldens";

const EVIDENCE_OPTIONS: readonly EvidenceCheckResult[] = [
  "not-tested",
  "pass",
  "fail",
];

function TriStateChecklistGroup<T extends string>({
  title,
  keys,
  labels,
  checks,
  onChange,
  readOnly = false,
  groupId,
}: {
  title: string;
  keys: readonly T[];
  labels: Record<T, string>;
  checks: ChecklistState<T>;
  onChange: (key: T, value: EvidenceCheckResult) => void;
  readOnly?: boolean;
  groupId: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      <ul className="space-y-3 text-[12px]">
        {keys.map((key) => {
          const name = `${groupId}-${key}`;
          return (
            <li key={key} className="space-y-1">
              <p>
                {labels[key]}
                {readOnly ? " (automatic)" : ""}
              </p>
              <div
                role="radiogroup"
                aria-label={labels[key]}
                className="flex flex-wrap gap-3"
              >
                {EVIDENCE_OPTIONS.map((option) => (
                  <label key={option} className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name={name}
                      value={option}
                      checked={checks[key] === option}
                      disabled={readOnly}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        onChange(key, e.target.value as EvidenceCheckResult)
                      }
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function SceneMediaQaPage() {
  const [goldenId, setGoldenId] = useState<SceneMediaGoldenId>("sm-two-equal-images");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [exportStatus, setExportStatus] = useState("idle");
  const [prepared, setPrepared] = useState<PrepareExportRequestResult | null>(null);
  const [generationState, setGenerationState] =
    useState<ArtifactGenerationState>("idle");
  const [hardFailure, setHardFailure] = useState(false);
  const [artifactBlob, setArtifactBlob] = useState<Blob | null>(null);
  const [artifactUrl, setArtifactUrl] = useState<string | null>(null);
  const [artifactFilename, setArtifactFilename] = useState<string | null>(null);
  const [artifactMime, setArtifactMime] = useState<string | null>(null);
  const [artifactBytes, setArtifactBytes] = useState<number | null>(null);
  const [measuredDurationSec, setMeasuredDurationSec] = useState<number | null>(null);
  const [automatic, setAutomatic] = useState<ArtifactAutomaticChecks>(
    EMPTY_ARTIFACT_AUTOMATIC_CHECKS,
  );
  const [previewChecks, setPreviewChecks] = useState(() =>
    createEmptyChecklist(PREVIEW_CHECK_KEYS),
  );
  const [artifactVisual, setArtifactVisual] = useState(() =>
    createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS),
  );
  const [editorChecks, setEditorChecks] = useState(() =>
    createEmptyChecklist(EDITOR_CHECK_KEYS),
  );
  const [report, setReport] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const artifactUrlRef = useRef<string | null>(null);

  const resetEvidence = useCallback(() => {
    setPrepared(null);
    setGenerationState("idle");
    setHardFailure(false);
    setExportStatus("idle");
    setArtifactBlob(null);
    setArtifactFilename(null);
    setArtifactMime(null);
    setArtifactBytes(null);
    setMeasuredDurationSec(null);
    setAutomatic(EMPTY_ARTIFACT_AUTOMATIC_CHECKS);
    setPreviewChecks(createEmptyChecklist(PREVIEW_CHECK_KEYS));
    setArtifactVisual(createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS));
    setEditorChecks(createEmptyChecklist(EDITOR_CHECK_KEYS));
    setReport(null);
    if (artifactUrlRef.current) {
      URL.revokeObjectURL(artifactUrlRef.current);
      artifactUrlRef.current = null;
    }
    setArtifactUrl(null);
  }, []);

  useEffect(() => {
    return () => {
      if (artifactUrlRef.current) {
        URL.revokeObjectURL(artifactUrlRef.current);
        artifactUrlRef.current = null;
      }
    };
  }, []);

  const replaceArtifactUrl = useCallback((blob: Blob | null) => {
    if (artifactUrlRef.current) {
      URL.revokeObjectURL(artifactUrlRef.current);
      artifactUrlRef.current = null;
    }
    if (!blob) {
      setArtifactUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    artifactUrlRef.current = next;
    setArtifactUrl(next);
  }, []);

  const fixture = useMemo(() => buildSceneMediaGoldenFixture(goldenId), [goldenId]);
  const scene = useMemo(
    () => fixture.story.scenes.find((s) => s.id === fixture.primarySceneId)!,
    [fixture],
  );
  const windows = useMemo(
    () => resolveProjectedSceneMediaWindows(scene),
    [scene],
  );
  const activeView = useMemo(
    () => resolveActiveSceneMediaRenderView(scene, elapsedMs),
    [scene, elapsedMs],
  );

  const renderedManifest = prepared?.manifest ?? null;
  const durationComparison: DurationComparison | null = useMemo(() => {
    if (!renderedManifest) {
      return null;
    }
    return compareArtifactDuration(
      renderedManifest.project.renderDurationMs,
      measuredDurationSec,
    );
  }, [renderedManifest, measuredDurationSec]);

  const automaticWithDuration: ArtifactAutomaticChecks = useMemo(() => {
    if (!durationComparison) {
      return automatic;
    }
    return {
      ...automatic,
      durationWithinTolerance: durationComparison.result,
    };
  }, [automatic, durationComparison]);

  const previewResult = derivePreviewEvidenceResult(previewChecks);
  const artifactResult = deriveArtifactEvidenceResult({
    automatic: automaticWithDuration,
    visual: artifactVisual,
    hardFailure,
  });
  const editorResult = deriveEditorEvidenceResult(editorChecks);

  const frozenItems = useMemo(() => {
    const exportScene = renderedManifest?.scenes.find((s) => s.id === scene.id);
    if (exportScene?.mediaTimeline?.items?.length) {
      return exportScene.mediaTimeline.items.map((item) => ({
        id: item.id,
        startOffsetMs: item.startOffsetMs,
        endOffsetMs: item.endOffsetMs,
        durationMs: item.durationMs,
      }));
    }
    return windows.map((w) => ({
      id: w.itemId,
      startOffsetMs: w.startMs,
      endOffsetMs: w.endMs,
      durationMs: w.durationMs,
    }));
  }, [renderedManifest, scene.id, windows]);

  const playbackCheckpoints = useMemo(() => {
    const exportScene = renderedManifest?.scenes.find((s) => s.id === scene.id);
    const startMs = exportScene?.startMs ?? 0;
    return buildArtifactPlaybackCheckpoints(startMs, frozenItems);
  }, [renderedManifest, scene.id, frozenItems]);

  const previewBoundaryButtons = useMemo(() => {
    return windows.flatMap((window) => [
      { label: `start ${window.itemId}`, ms: window.startMs },
      { label: `end-1 ${window.itemId}`, ms: Math.max(0, window.endMs - 1) },
      ...(window.endMs < (scene.durationMs ?? 0)
        ? [{ label: `boundary ${window.itemId}`, ms: window.endMs }]
        : []),
    ]);
  }, [windows, scene.durationMs]);

  const seekArtifact = useCallback((seekMs: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const seconds = Math.max(0, seekMs / 1000);
    try {
      video.currentTime = seconds;
    } catch {
      // Seek may be unsupported until metadata loads.
    }
  }, []);

  const buildEvidenceReport = useCallback(() => {
    const text = buildSafeSceneMediaEvidenceReport({
      timestampIso: new Date().toISOString(),
      browserName:
        typeof navigator !== "undefined"
          ? navigator.userAgent.split(/[()]/)[0]?.trim().slice(0, 40) || "unknown"
          : "unknown",
      goldenId,
      renderedFingerprint: renderedManifest?.fingerprint ?? null,
      manifestVersion: renderedManifest?.version ?? null,
      rendererContractVersion: renderedManifest?.rendererContractVersion ?? null,
      itemWindows: frozenItems,
      artifact: {
        filename: artifactFilename,
        mimeType: artifactMime,
        byteSize: artifactBytes,
        generationState,
      },
      duration: durationComparison,
      previewChecks,
      artifactAutomatic: automaticWithDuration,
      artifactVisual,
      editorChecks,
      previewResult,
      artifactResult,
      editorResult,
    });
    const unsafe = assertSafeEvidenceReport(text);
    if (unsafe.length > 0) {
      setReport(`${text}\n\nWARNING: report sanitizer flagged patterns — regenerate.`);
      return;
    }
    setReport(text);
  }, [
    goldenId,
    renderedManifest,
    frozenItems,
    artifactFilename,
    artifactMime,
    artifactBytes,
    generationState,
    durationComparison,
    previewChecks,
    automaticWithDuration,
    artifactVisual,
    editorChecks,
    previewResult,
    artifactResult,
    editorResult,
  ]);

  const runProductionExport = useCallback(async () => {
    setExportStatus("preparing");
    setHardFailure(false);
    setPrepared(null);
    setGenerationState("idle");
    setMeasuredDurationSec(null);
    setArtifactBlob(null);
    setArtifactBytes(null);
    setArtifactFilename(null);
    setArtifactMime(null);
    // New export resets artifact automatic + visual only; Preview/editor retained.
    setAutomatic(EMPTY_ARTIFACT_AUTOMATIC_CHECKS);
    setArtifactVisual(createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS));
    setReport(null);
    replaceArtifactUrl(null);

    const capture: { blob: Blob | null; filename: string | null } = {
      blob: null,
      filename: null,
    };
    // Capture only — production downloadBlob still runs download after this hook.
    setExportDownloadCaptureHandler((blob, filename) => {
      capture.blob = blob;
      capture.filename = filename;
    });

    try {
      const exportOptions = {
        exportSettings: {
          format: "webm" as const,
          resolution: "720x1280" as const,
          quality: "standard" as const,
        },
        audioMode: "silent" as const,
      };

      // Production composition — multi-image is the default (omit override).
      const nextPrepared = await prepareExportRequest({
        story: fixture.story,
        options: exportOptions,
        throwIfBlocked: true,
      });

      const manifestIssues = assertPreparedManifestForSceneMediaQa(
        nextPrepared.manifest,
        fixture.primarySceneId,
      );
      if (
        !nextPrepared.preflight.supported ||
        nextPrepared.renderer !== "browser" ||
        manifestIssues.length > 0
      ) {
        setHardFailure(true);
        setPrepared(nextPrepared);
        setAutomatic({
          ...EMPTY_ARTIFACT_AUTOMATIC_CHECKS,
          preflightApproved: "fail",
          exactPreparedManifestRendered: "fail",
        });
        setGenerationState("validation-fail");
        setExportStatus(
          manifestIssues.length
            ? `blocked:manifest(${manifestIssues[0]})`
            : `blocked:${nextPrepared.renderer}`,
        );
        return;
      }

      setPrepared(nextPrepared);
      setExportStatus("rendering");

      await exportFootieShortFromManifest(
        nextPrepared,
        (progress) => {
          setExportStatus(`${progress.status}:${Math.round(progress.progress)}%`);
        },
        { audioFallback: "silent" },
      );

      const capturedBlob = capture.blob;
      const bytes = capturedBlob?.size ?? 0;
      const filename =
        capture.filename ??
        (nextPrepared.manifest.output.filename.endsWith(".webm")
          ? nextPrepared.manifest.output.filename
          : `${nextPrepared.manifest.output.filename}.webm`);

      if (!capturedBlob || bytes <= 0) {
        setHardFailure(true);
        setAutomatic({
          preflightApproved: "pass",
          exactPreparedManifestRendered: "pass",
          rendererCompleted: "pass",
          artifactNonEmpty: "fail",
          structuralValidationPassed: "not-tested",
          durationWithinTolerance: "not-tested",
        });
        setGenerationState("validation-fail");
        setExportStatus("failed:empty");
        return;
      }

      setArtifactBlob(capturedBlob);
      setArtifactBytes(bytes);
      setArtifactFilename(filename);
      setArtifactMime(capturedBlob.type || "video/webm");
      replaceArtifactUrl(capturedBlob);

      const validation = validateFinalExportArtifact({
        artifact: {
          blob: capturedBlob,
          format: "webm",
          filename,
          mimeType: capturedBlob.type || "video/webm",
          hasAudio: false,
          resultKind: "audio-silent",
        },
        manifest: nextPrepared.manifest,
        finalFrameRendered: true,
      });

      const structuralOk = validation.valid;
      setAutomatic({
        preflightApproved: "pass",
        exactPreparedManifestRendered: "pass",
        rendererCompleted: "pass",
        artifactNonEmpty: "pass",
        structuralValidationPassed: structuralOk ? "pass" : "fail",
        durationWithinTolerance: "not-tested",
      });
      setGenerationState(
        structuralOk
          ? mapStructuralValidationToGenerationState(true)
          : "validation-fail",
      );
      if (!structuralOk) {
        setHardFailure(true);
        setExportStatus(`validation-failed:${validation.errors[0]?.code ?? "fail"}`);
      } else {
        // Awaiting visual review — never auto Pass.
        setExportStatus("awaiting-visual-review");
      }
    } catch {
      setHardFailure(true);
      setGenerationState("validation-fail");
      setAutomatic((prev) => ({
        ...prev,
        rendererCompleted: "fail",
      }));
      setExportStatus("error:renderer");
    } finally {
      setExportDownloadCaptureHandler(null);
    }
  }, [fixture.story, fixture.primarySceneId, replaceArtifactUrl]);

  if (process.env.NODE_ENV === "production") {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm text-muted">
        Scene Media QA is development-only.
      </main>
    );
  }

  const durationMs = scene.durationMs ?? 0;
  const automaticLabels: Record<(typeof ARTIFACT_AUTOMATIC_CHECK_KEYS)[number], string> = {
    preflightApproved: "Preflight approved",
    exactPreparedManifestRendered: "Exact prepared manifest rendered",
    rendererCompleted: "Renderer completed",
    artifactNonEmpty: "Artifact non-empty",
    structuralValidationPassed: "Structural validation passed",
    durationWithinTolerance: "Duration within tolerance",
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 text-sm text-foreground">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted">Development</p>
        <h1 className="text-2xl font-semibold">Scene Media QA</h1>
        <p className="text-muted">
          Sprint 8E.1A tri-state evidence harness. Idle/preparing stay Not tested;
          observed Fail is first-class. Structural validation cannot claim local
          artifact Pass. Multi-image Scene Media Timeline is the default production
          capability.
        </p>
      </header>

      <div className="rounded-md border border-border/60 bg-surface/30 p-3 text-[12px]">
        Capability: <strong>multi-image scenes (default)</strong> — Timeline,
        Inspector, Preview, and ExportManifest v2 / contract 8D.
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[12px] text-muted">Golden fixture</span>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            value={goldenId}
            onChange={(e) => {
              setGoldenId(e.target.value as SceneMediaGoldenId);
              setElapsedMs(0);
              resetEvidence();
            }}
          >
            {SCENE_MEDIA_GOLDEN_PROJECTS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id} — {g.title}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-md border border-border/60 bg-surface/30 p-3 text-[12px] space-y-1">
          <p>Scene: {scene.id}</p>
          <p>
            Active item: <strong>{activeView.mediaItemId ?? "none"}</strong>
          </p>
          <p>Item-local elapsed: {activeView.itemElapsedMs}ms</p>
          <p>Capability: multi-image (default)</p>
          <p>
            Rendered fingerprint:{" "}
            {renderedManifest?.fingerprint
              ? `${renderedManifest.fingerprint.slice(0, 24)}…`
              : "n/a (run export)"}
          </p>
          <p>
            Derived — Preview: {previewResult} · Artifact: {artifactResult} ·
            Editor: {editorResult}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Timeline windows</h2>
        <ul className="space-y-1 text-[12px] text-muted">
          {windows.map((w) => (
            <li key={w.itemId}>
              {w.itemId}: [{w.startMs}, {w.endMs}) · {w.durationMs}ms
            </li>
          ))}
        </ul>
        <label className="block space-y-1">
          <span className="text-[12px] text-muted">
            Scene-local scrubber ({elapsedMs}ms / {durationMs}ms)
          </span>
          <input
            type="range"
            min={0}
            max={durationMs}
            value={elapsedMs}
            onChange={(e) => setElapsedMs(Number(e.target.value))}
            className="w-full"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {previewBoundaryButtons.map((b) => (
            <button
              key={b.label}
              type="button"
              className="rounded border border-border px-2 py-1 text-[11px]"
              onClick={() => setElapsedMs(b.ms)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Production Preview adapter</h2>
        <div className="relative mx-auto aspect-[9/16] w-[240px] overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
          <SceneBackdrop
            scene={scene}
            sceneIndex={0}
            sceneElapsedMs={elapsedMs}
            sceneDurationMs={durationMs}
            isPlaying={false}
            isActive
          />
        </div>
      </section>

      <TriStateChecklistGroup
        title="Preview checklist (operator)"
        groupId="preview"
        keys={PREVIEW_CHECK_KEYS}
        labels={{
          itemABeforeBoundary: "ITEM A before boundary",
          itemBAtOrAfterBoundary: "ITEM B at/after boundary",
          finalItemHeld: "Final item held",
          noBlankSwitchingFrame: "No blank switching frame",
          itemLocalFramingMotion: "Item-local framing/motion",
          captionsContinuous: "Captions continuous",
          transitionPeerCoherent: "Transition-peer fixture coherent",
        }}
        checks={previewChecks}
        onChange={(key, value) =>
          setPreviewChecks((prev) => ({ ...prev, [key]: value }))
        }
      />

      <section className="space-y-3">
        <h2 className="font-medium">Production 720p WebM export</h2>
        <button
          type="button"
          className="rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-40"
          onClick={() => void runProductionExport()}
        >
          Prepare + render exact production manifest
        </button>
        <p className="text-[12px] text-muted">
          Status: {exportStatus} · generation: {generationState}
          {hardFailure ? " · hard-failure" : ""}
        </p>

        {renderedManifest ? (
          <pre className="overflow-auto rounded-md border border-border/60 bg-surface/20 p-3 text-[11px]">
{JSON.stringify(
  {
    fingerprint: renderedManifest.fingerprint,
    version: renderedManifest.version,
    rendererContractVersion: renderedManifest.rendererContractVersion,
    renderDurationMs: renderedManifest.project.renderDurationMs,
    primarySceneItems:
      renderedManifest.scenes.find((s) => s.id === scene.id)?.mediaTimeline.items
        .length ?? 0,
    preflight: {
      supported: prepared?.preflight.supported,
      renderer: prepared?.renderer,
    },
  },
  null,
  2,
)}
          </pre>
        ) : null}

        {artifactBlob && artifactUrl ? (
          <div className="space-y-2">
            <h3 className="font-medium">Captured WebM (retained for review)</h3>
            <video
              ref={videoRef}
              className="mx-auto max-h-[420px] w-full max-w-[240px] rounded-md bg-black"
              controls
              playsInline
              src={artifactUrl}
              onLoadedMetadata={(e) => {
                const duration = e.currentTarget.duration;
                setMeasuredDurationSec(
                  Number.isFinite(duration) && duration > 0 ? duration : null,
                );
              }}
            />
            <p className="text-[12px] text-muted">
              filename={artifactFilename ?? "n/a"} · mime={artifactMime ?? "n/a"} ·
              bytes={artifactBytes ?? "n/a"}
            </p>
            {durationComparison ? (
              <p className="text-[12px]">
                expected {durationComparison.expectedMs}ms · measured{" "}
                {durationComparison.measuredMs ?? "unknown"}ms · delta{" "}
                {durationComparison.deltaMs ?? "n/a"}ms · tolerance{" "}
                {durationComparison.toleranceMs}ms · result{" "}
                {durationComparison.result}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {playbackCheckpoints.map((cp) => (
                <button
                  key={cp.label}
                  type="button"
                  className="rounded border border-border px-2 py-1 text-[11px]"
                  onClick={() => seekArtifact(cp.seekMs)}
                >
                  {cp.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <TriStateChecklistGroup
        title="Artifact automatic checks (read-only)"
        groupId="artifact-auto"
        keys={ARTIFACT_AUTOMATIC_CHECK_KEYS}
        labels={automaticLabels}
        checks={automaticWithDuration}
        readOnly
        onChange={() => {
          /* read-only */
        }}
      />

      <TriStateChecklistGroup
        title="Artifact visual checklist (operator)"
        groupId="artifact-visual"
        keys={ARTIFACT_VISUAL_CHECK_KEYS}
        labels={{
          bothItemsVisibleInOrder: "Both items visible in order",
          correctBoundarySwitch: "Correct boundary switch",
          noBlankOrRepeatedFirstItem: "No blank/repeated first item",
          captionsFinalFrameCoherent: "Captions/final frame coherent",
        }}
        checks={artifactVisual}
        onChange={(key, value) =>
          setArtifactVisual((prev) => ({ ...prev, [key]: value }))
        }
      />

      <TriStateChecklistGroup
        title="Manual editor checklist (operator)"
        groupId="editor"
        keys={EDITOR_CHECK_KEYS}
        labels={{
          append: "Append",
          reorder: "Reorder",
          resize: "Resize",
          remove: "Remove",
          perItemFramingMotion: "Per-item framing/motion",
          videoTrim: "Video trim",
          draftSaveReload: "Draft save/reload",
          duplicateSceneIndependence: "Duplicate-scene independence",
          legacyConversionExplicitOnly: "Legacy conversion only on explicit edit",
        }}
        checks={editorChecks}
        onChange={(key, value) =>
          setEditorChecks((prev) => ({ ...prev, [key]: value }))
        }
      />

      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2"
            onClick={buildEvidenceReport}
          >
            Build safe evidence report
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2"
            disabled={!report}
            onClick={() => {
              if (!report) return;
              void navigator.clipboard?.writeText(report);
            }}
          >
            Copy report
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2"
            onClick={resetEvidence}
          >
            Reset local evidence
          </button>
        </div>
        <p className="text-[12px] text-muted">
          Do not paste into Markdown docs until after real operator review. Blob/object
          URLs are never included. Checks use not-tested / pass / fail.
        </p>
        {report ? (
          <pre className="overflow-auto rounded-md border border-border/60 bg-surface/20 p-3 text-[11px] whitespace-pre-wrap select-text">
            {report}
          </pre>
        ) : null}
      </section>
    </main>
  );
}
