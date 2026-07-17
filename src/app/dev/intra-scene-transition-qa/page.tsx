"use client";

/**
 * Dev-only Sprint 9D.1 Intra-scene Transition QA harness.
 * Not linked from production navigation. Unavailable in production.
 *
 * Production export path only:
 * prepareExportRequest() → exportFootieShortFromManifest(prepared).
 * Core freeze evidence is separated from optional video/audio/device checks.
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
import Link from "next/link";

import { SceneBackdrop } from "@/features/preview/components/PreviewFrame";
import {
  isExportSceneManifestV3,
  prepareExportRequest,
  type PrepareExportRequestResult,
} from "@/features/export/domain";
import { exportFootieShortFromManifest } from "@/features/export/services/video-render.service";
import { setExportDownloadCaptureHandler } from "@/features/export/utils/download.utils";
import { validateFinalExportArtifact } from "@/features/export/validation";
import { resolveIntraSceneTransitionAtElapsed } from "@/features/scene-media-transitions";
import {
  composeIntraSceneTransitionPreview,
  planPreviewMediaLayers,
} from "@/features/scene-media-transitions/preview";
import {
  assertPreparedManifestForIstQa,
  assertSafeIstEvidenceReport,
  buildSafeIstEvidenceReport,
  canMarkAudioContinuityPass,
  canMarkSceneToScenePrecedencePass,
  canMarkVideoContinuityPass,
  checklistFromLedgerForFixture,
  classifyIstSafeFailure,
  clearIstEvidenceLedger,
  compareArtifactDuration,
  createIstExportRunIdentity,
  deriveIstCoreArtifactFromLedger,
  deriveIstCoreEditorFromLedger,
  deriveIstCorePreviewFromLedger,
  deriveIstDeviceMatrixEvidenceResult,
  deriveIstOptionalAudioEvidenceResult,
  deriveIstOptionalVideoEvidenceResult,
  EMPTY_IST_ARTIFACT_AUTOMATIC_CHECKS,
  invalidateFixtureArtifactEvidence,
  isStaleIstExportRun,
  IST_ARTIFACT_AUTOMATIC_CHECK_KEYS,
  IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS,
  IST_CORE_PREVIEW_CHECK_KEYS,
  IST_DEVICE_MATRIX_CHECK_KEYS,
  IST_EDITOR_CHECK_KEYS,
  IST_EDITOR_OPERATOR_WORKFLOW,
  IST_OPTIONAL_ARTIFACT_VISUAL_CHECK_KEYS,
  IST_OPTIONAL_PREVIEW_CHECK_KEYS,
  mapStructuralValidationToGenerationState,
  resolveExactPreparedManifestRendered,
  upsertIstEvidenceRecord,
  type ArtifactGenerationState,
  type EvidenceCheckResult,
  type IstArtifactAutomaticChecks,
  type IstCoreArtifactVisualCheckKey,
  type IstCorePreviewCheckKey,
  type IstDeviceMatrixCheckKey,
  type IstEditorCheckKey,
  type IstEvidenceLedger,
  type IstExportRunIdentity,
  type IstOptionalArtifactVisualCheckKey,
  type IstOptionalPreviewCheckKey,
  type IstSafeFailureCategory,
  type ChecklistState,
} from "@/features/scene-media-transitions/qa/intra-scene-transition-local-evidence";
import {
  buildIntraSceneTransitionGoldenFixture,
  INTRA_SCENE_TRANSITION_GOLDEN_PROJECTS,
  type IntraSceneTransitionGoldenId,
} from "@/verification/scene-media-transitions/goldens";

const EVIDENCE_OPTIONS: readonly EvidenceCheckResult[] = [
  "not-tested",
  "pass",
  "fail",
];

const PREVIEW_SURFACE = "scene-backdrop-only" as const;
const AUDIO_MODE = "silent" as const;

const CORE_PREVIEW_LABELS: Record<IstCorePreviewCheckKey, string> = {
  correctMediaSwitch: "Image media switches correctly",
  transitionStartsAtIncomingBoundary: "Transition starts at incoming boundary",
  effectMatchesSelection: "Selected effect is visibly correct",
  noFlashRemountAtCompletion: "No flash/remount at completion",
  captionsRemainVisible: "Captions remain visible",
};

const OPTIONAL_PREVIEW_LABELS: Record<IstOptionalPreviewCheckKey, string> = {
  videoContinuityAcceptable:
    "Real video continuity (optional — requires playable video, not local://)",
  sceneToScenePrecedence:
    "Scene-to-scene precedence (optional — requires full Preview composition; covered by deterministic suites)",
};

const CORE_ARTIFACT_VISUAL_LABELS: Record<
  IstCoreArtifactVisualCheckKey,
  string
> = {
  transitionVisibleInArtifact: "Transition visible in rendered WebM",
  correctOutgoingIncomingMedia: "Correct outgoing/incoming media",
  noBlackOrStaleFrame: "No black/stale frames",
  noUnexpectedCaptionDisappearance: "No unexpected caption disappearance",
  completionReturnsToIncoming: "Completion remains on incoming item",
};

const OPTIONAL_ARTIFACT_LABELS: Record<
  IstOptionalArtifactVisualCheckKey,
  string
> = {
  audioRemainsContinuous:
    "Audible audio continuity (optional — silent export cannot Pass)",
};

const EDITOR_LABELS: Record<IstEditorCheckKey, string> = {
  transitionControlsVisiblyPresent: "Transition controls visibly present",
  noClippingAtMultiItemLayouts: "No clipping at two/three/four media items",
  boundaryControlSelectsCorrectPair: "Boundary control selects correct pair",
  inspectorOpensAutomatically: "Inspector opens automatically on selection",
  setChangeResetBoundary: "Set/change/reset boundary",
  cutRemovesOnlySelectedBoundary: "Cut removes only selected boundary",
  multipleBoundariesIndependent: "Multiple boundaries independent",
  effectDurationChangesCommit: "Effect/duration changes commit",
  interactionLocksWork: "Interaction locks work",
  persistenceReloadWorks: "Persistence/reload works",
  duplicatedScenesIndependentGraphs: "Duplicated scenes independent graphs",
  narrowLayoutUsable: "Narrow layout remains usable",
};

const DEVICE_LABELS: Record<IstDeviceMatrixCheckKey, string> = {
  safari: "Safari",
  firefox: "Firefox",
  export1080p: "1080p export",
  deviceMultiVideo: "Device multi-video",
};

function TriStateChecklistGroup<T extends string>({
  title,
  keys,
  labels,
  checks,
  onChange,
  readOnly = false,
  groupId,
  passGate,
}: {
  title: string;
  keys: readonly T[];
  labels: Record<T, string>;
  checks: ChecklistState<T>;
  onChange: (key: T, value: EvidenceCheckResult) => void;
  readOnly?: boolean;
  groupId: string;
  /** When false, Pass is disabled for this group. */
  passGate?: (key: T) => boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      <ul className="space-y-3 text-[12px]">
        {keys.map((key) => {
          const name = `${groupId}-${key}`;
          const allowPass = passGate ? passGate(key) : true;
          return (
            <li key={key} className="space-y-1">
              <p>
                {labels[key]}
                {readOnly ? " (automatic)" : ""}
                {!allowPass ? " — Pass disabled on this surface" : ""}
              </p>
              <div
                role="radiogroup"
                aria-label={labels[key]}
                className="flex flex-wrap gap-3"
              >
                {EVIDENCE_OPTIONS.map((option) => {
                  const disabled =
                    readOnly || (option === "pass" && !allowPass);
                  return (
                    <label
                      key={option}
                      className="inline-flex items-center gap-1"
                    >
                      <input
                        type="radio"
                        name={name}
                        value={option}
                        checked={checks[key] === option}
                        disabled={disabled}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          onChange(key, e.target.value as EvidenceCheckResult)
                        }
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function IntraSceneTransitionQaPage() {
  const [goldenId, setGoldenId] =
    useState<IntraSceneTransitionGoldenId>("ist-fade");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportStatus, setExportStatus] = useState("idle");
  const [safeFailure, setSafeFailure] =
    useState<IstSafeFailureCategory | null>(null);
  const [prepared, setPrepared] = useState<PrepareExportRequestResult | null>(
    null,
  );
  const [generationState, setGenerationState] =
    useState<ArtifactGenerationState>("idle");
  const [hardFailure, setHardFailure] = useState(false);
  const [artifactUrl, setArtifactUrl] = useState<string | null>(null);
  const [artifactFilename, setArtifactFilename] = useState<string | null>(null);
  const [artifactMime, setArtifactMime] = useState<string | null>(null);
  const [artifactBytes, setArtifactBytes] = useState<number | null>(null);
  const [measuredDurationSec, setMeasuredDurationSec] = useState<number | null>(
    null,
  );
  const [ledger, setLedger] = useState<IstEvidenceLedger>([]);
  const [deviceChecks, setDeviceChecks] = useState(() =>
    Object.fromEntries(
      IST_DEVICE_MATRIX_CHECK_KEYS.map((key) => [key, "not-tested" as const]),
    ) as ChecklistState<IstDeviceMatrixCheckKey>,
  );
  const [report, setReport] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const artifactUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const exportRunRef = useRef<IstExportRunIdentity | null>(null);
  const exportSequenceRef = useRef(0);
  const activeFixtureRef = useRef(goldenId);

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

  const resetPlaybackAndArtifactForFixture = useCallback(() => {
    setElapsedMs(0);
    setIsPlaying(false);
    setPrepared(null);
    setGenerationState("idle");
    setHardFailure(false);
    setExportStatus("idle");
    setSafeFailure(null);
    setArtifactFilename(null);
    setArtifactMime(null);
    setArtifactBytes(null);
    setMeasuredDurationSec(null);
    setReport(null);
    replaceArtifactUrl(null);
    exportRunRef.current = null;
  }, [replaceArtifactUrl]);

  const resetAllEvidence = useCallback(() => {
    setLedger(clearIstEvidenceLedger());
    setDeviceChecks(
      Object.fromEntries(
        IST_DEVICE_MATRIX_CHECK_KEYS.map((key) => [
          key,
          "not-tested" as const,
        ]),
      ) as ChecklistState<IstDeviceMatrixCheckKey>,
    );
    resetPlaybackAndArtifactForFixture();
  }, [resetPlaybackAndArtifactForFixture]);

  useEffect(() => {
    return () => {
      if (artifactUrlRef.current) {
        URL.revokeObjectURL(artifactUrlRef.current);
        artifactUrlRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const fixture = useMemo(
    () => buildIntraSceneTransitionGoldenFixture(goldenId),
    [goldenId],
  );
  const scene = useMemo(
    () => fixture.story.scenes.find((s) => s.id === fixture.primarySceneId)!,
    [fixture],
  );
  const sceneDurationMs = scene.durationMs ?? 6000;

  const composition = useMemo(
    () => composeIntraSceneTransitionPreview(scene, elapsedMs),
    [scene, elapsedMs],
  );
  const layerPlan = useMemo(
    () =>
      planPreviewMediaLayers({
        scene,
        sceneElapsedMs: elapsedMs,
        isPlaying,
      }),
    [scene, elapsedMs, isPlaying],
  );
  const resolved = useMemo(
    () => resolveIntraSceneTransitionAtElapsed(scene, elapsedMs),
    [scene, elapsedMs],
  );

  const mediaUrls = useMemo(() => {
    const items = scene.mediaTimeline?.items ?? [];
    return items.map((item) =>
      item.media && "url" in item.media
        ? (item.media.url as string | undefined)
        : scene.media && "url" in scene.media
          ? scene.media.url
          : null,
    );
  }, [scene]);

  const videoContinuityGate = canMarkVideoContinuityPass({
    mediaUrls,
    videoPlayable: false,
  });
  const audioContinuityGate = canMarkAudioContinuityPass({
    audioMode: AUDIO_MODE,
    hasAudibleStem: false,
  });
  const precedenceGate = canMarkSceneToScenePrecedencePass({
    previewSurface: PREVIEW_SURFACE,
  });

  const corePreviewChecks = checklistFromLedgerForFixture(
    ledger,
    "preview-core",
    IST_CORE_PREVIEW_CHECK_KEYS,
    goldenId,
  );
  const optionalPreviewChecks = checklistFromLedgerForFixture(
    ledger,
    "preview-optional",
    IST_OPTIONAL_PREVIEW_CHECK_KEYS,
    goldenId,
  );
  const automaticChecks = checklistFromLedgerForFixture(
    ledger,
    "artifact-automatic",
    IST_ARTIFACT_AUTOMATIC_CHECK_KEYS,
    goldenId,
  ) as IstArtifactAutomaticChecks;
  const coreArtifactVisual = checklistFromLedgerForFixture(
    ledger,
    "artifact-visual-core",
    IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS,
    goldenId,
  );
  const optionalArtifactVisual = checklistFromLedgerForFixture(
    ledger,
    "artifact-visual-optional",
    IST_OPTIONAL_ARTIFACT_VISUAL_CHECK_KEYS,
    goldenId,
  );
  const editorChecks = checklistFromLedgerForFixture(
    ledger,
    "editor-core",
    IST_EDITOR_CHECK_KEYS,
    goldenId,
  );

  const renderedManifest = prepared?.manifest ?? null;
  const durationComparison = useMemo(() => {
    if (!renderedManifest) {
      return compareArtifactDuration(0, null);
    }
    return compareArtifactDuration(
      renderedManifest.project.renderDurationMs,
      measuredDurationSec,
    );
  }, [renderedManifest, measuredDurationSec]);

  const automaticWithDuration: IstArtifactAutomaticChecks = useMemo(() => {
    const base =
      Object.keys(automaticChecks).length > 0
        ? automaticChecks
        : EMPTY_IST_ARTIFACT_AUTOMATIC_CHECKS;
    return {
      ...base,
      durationWithinTolerance: durationComparison.result,
    };
  }, [automaticChecks, durationComparison]);

  const corePreviewResult = deriveIstCorePreviewFromLedger(ledger, hardFailure);
  const coreArtifactResult = deriveIstCoreArtifactFromLedger(
    ledger,
    hardFailure,
  );
  const coreEditorResult = deriveIstCoreEditorFromLedger(ledger, false);
  const optionalVideoResult = deriveIstOptionalVideoEvidenceResult({
    videoContinuity: resolveOptionalAcross(
      ledger,
      "videoContinuityAcceptable",
    ),
  });
  const optionalAudioResult = deriveIstOptionalAudioEvidenceResult({
    audioContinuity: resolveOptionalAcross(ledger, "audioRemainsContinuous"),
  });
  const deviceMatrixResult = deriveIstDeviceMatrixEvidenceResult({
    checks: deviceChecks,
  });

  const seekButtons = useMemo(() => {
    if (!resolved.active && !composition) {
      return [
        { label: "0", ms: 0 },
        { label: "mid", ms: Math.floor(sceneDurationMs / 2) },
        { label: "end-1", ms: Math.max(0, sceneDurationMs - 1) },
      ];
    }
    const start = composition?.overlayStartMs ?? resolved.overlayStartMs;
    const end = composition?.overlayEndMs ?? resolved.overlayEndMs;
    const mid = start + Math.floor((end - start) / 2);
    return [
      { label: "before", ms: Math.max(0, start - 1) },
      { label: "start", ms: start },
      { label: "mid", ms: mid },
      { label: "late", ms: Math.max(start, end - 1) },
      { label: "end", ms: end },
      { label: "after", ms: Math.min(sceneDurationMs - 1, end + 1) },
    ];
  }, [composition, resolved, sceneDurationMs]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      setElapsedMs((prev) => {
        const next = prev + delta;
        return next >= sceneDurationMs ? 0 : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, sceneDurationMs]);

  const setCorePreview = useCallback(
    (key: IstCorePreviewCheckKey, value: EvidenceCheckResult) => {
      setLedger((prev) =>
        upsertIstEvidenceRecord(prev, {
          checkId: key,
          fixtureId: goldenId,
          category: "preview-core",
          result: value,
        }),
      );
    },
    [goldenId],
  );

  const setOptionalPreview = useCallback(
    (key: IstOptionalPreviewCheckKey, value: EvidenceCheckResult) => {
      if (value === "pass") {
        if (key === "videoContinuityAcceptable" && !videoContinuityGate) {
          return;
        }
        if (key === "sceneToScenePrecedence" && !precedenceGate) {
          return;
        }
      }
      setLedger((prev) =>
        upsertIstEvidenceRecord(prev, {
          checkId: key,
          fixtureId: goldenId,
          category: "preview-optional",
          result: value,
        }),
      );
    },
    [goldenId, videoContinuityGate, precedenceGate],
  );

  const setCoreArtifactVisual = useCallback(
    (key: IstCoreArtifactVisualCheckKey, value: EvidenceCheckResult) => {
      setLedger((prev) =>
        upsertIstEvidenceRecord(prev, {
          checkId: key,
          fixtureId: goldenId,
          category: "artifact-visual-core",
          result: value,
        }),
      );
    },
    [goldenId],
  );

  const setOptionalArtifactVisual = useCallback(
    (key: IstOptionalArtifactVisualCheckKey, value: EvidenceCheckResult) => {
      if (value === "pass" && key === "audioRemainsContinuous" && !audioContinuityGate) {
        return;
      }
      setLedger((prev) =>
        upsertIstEvidenceRecord(prev, {
          checkId: key,
          fixtureId: goldenId,
          category: "artifact-visual-optional",
          result: value,
        }),
      );
    },
    [goldenId, audioContinuityGate],
  );

  const setEditorCheck = useCallback(
    (key: IstEditorCheckKey, value: EvidenceCheckResult) => {
      setLedger((prev) =>
        upsertIstEvidenceRecord(prev, {
          checkId: key,
          fixtureId: goldenId,
          category: "editor-core",
          result: value,
        }),
      );
    },
    [goldenId],
  );

  const writeAutomaticLedger = useCallback(
    (checks: IstArtifactAutomaticChecks, fixtureId: string) => {
      setLedger((prev) => {
        let next = prev;
        for (const key of IST_ARTIFACT_AUTOMATIC_CHECK_KEYS) {
          next = upsertIstEvidenceRecord(next, {
            checkId: key,
            fixtureId,
            category: "artifact-automatic",
            result: checks[key],
          });
        }
        return next;
      });
    },
    [],
  );

  const runProductionExport = useCallback(async () => {
    const fixtureId = goldenId;
    activeFixtureRef.current = fixtureId;
    exportSequenceRef.current += 1;
    const run = createIstExportRunIdentity({
      fixtureId,
      sequence: exportSequenceRef.current,
    });
    exportRunRef.current = run;

    setLedger((prev) => invalidateFixtureArtifactEvidence(prev, fixtureId));
    setPrepared(null);
    setGenerationState("idle");
    setHardFailure(false);
    setExportStatus("preparing");
    setSafeFailure(null);
    setArtifactFilename(null);
    setArtifactMime(null);
    setArtifactBytes(null);
    setMeasuredDurationSec(null);
    replaceArtifactUrl(null);

    const capture: { blob: Blob | null; filename: string | null } = {
      blob: null,
      filename: null,
    };
    setExportDownloadCaptureHandler((blob, filename) => {
      capture.blob = blob;
      capture.filename = filename;
    });

    let exportInvoked = false;
    let renderCompleted = false;

    try {
      const nextPrepared = await prepareExportRequest({
        story: fixture.story,
        options: {
          exportSettings: {
            format: "webm",
            resolution: "720x1280",
            quality: "standard",
          },
          audioMode: "silent",
        },
        includeBackgroundMusic: false,
        throwIfBlocked: true,
      });

      if (isStaleIstExportRun(exportRunRef.current, run)) {
        setSafeFailure(classifyIstSafeFailure("stale"));
        return;
      }
      if (activeFixtureRef.current !== fixtureId) {
        setSafeFailure(classifyIstSafeFailure("stale"));
        return;
      }

      const manifestIssues = assertPreparedManifestForIstQa(
        nextPrepared.manifest,
        fixture.primarySceneId,
      );

      const identity: IstExportRunIdentity = {
        ...run,
        fingerprint: nextPrepared.manifest.fingerprint,
      };
      exportRunRef.current = identity;

      if (
        !nextPrepared.preflight.supported ||
        nextPrepared.renderer !== "browser" ||
        manifestIssues.length > 0
      ) {
        setHardFailure(true);
        setPrepared(nextPrepared);
        setSafeFailure(classifyIstSafeFailure("preflight"));
        const blocked: IstArtifactAutomaticChecks = {
          ...EMPTY_IST_ARTIFACT_AUTOMATIC_CHECKS,
          preflightApproved: "fail",
          exactPreparedManifestRendered: resolveExactPreparedManifestRendered({
            prepareCompleted: true,
            exportInvokedWithPrepared: false,
            renderCompleted: false,
            artifactCapturedForRun: false,
            artifactNonEmpty: false,
            oneTerminalOutcome: true,
            stale: false,
          }),
          manifestV3Contract9C:
            nextPrepared.manifest.version === 3 &&
            nextPrepared.manifest.rendererContractVersion === "9C"
              ? "pass"
              : "fail",
          oneTerminalExportOutcome: "pass",
        };
        writeAutomaticLedger(blocked, fixtureId);
        setGenerationState("validation-fail");
        setExportStatus("blocked");
        return;
      }

      setPrepared(nextPrepared);
      setExportStatus("rendering");

      exportInvoked = true;
      await exportFootieShortFromManifest(
        nextPrepared,
        (progress) => {
          if (!isStaleIstExportRun(exportRunRef.current, identity)) {
            setExportStatus(
              `${progress.status}:${Math.round(progress.progress)}%`,
            );
          }
        },
        { audioFallback: "silent" },
      );
      renderCompleted = true;

      if (isStaleIstExportRun(exportRunRef.current, identity)) {
        setSafeFailure(classifyIstSafeFailure("stale"));
        return;
      }
      if (activeFixtureRef.current !== fixtureId) {
        setSafeFailure(classifyIstSafeFailure("stale"));
        return;
      }

      const capturedBlob = capture.blob;
      const bytes = capturedBlob?.size ?? 0;
      const filename =
        capture.filename ??
        (nextPrepared.manifest.output.filename.endsWith(".webm")
          ? nextPrepared.manifest.output.filename
          : `${nextPrepared.manifest.output.filename}.webm`);

      const exact = resolveExactPreparedManifestRendered({
        prepareCompleted: true,
        exportInvokedWithPrepared: exportInvoked,
        renderCompleted,
        artifactCapturedForRun: Boolean(capturedBlob),
        artifactNonEmpty: bytes > 0,
        oneTerminalOutcome: true,
        stale: false,
      });

      if (!capturedBlob || bytes <= 0) {
        setHardFailure(true);
        setSafeFailure(classifyIstSafeFailure("empty"));
        writeAutomaticLedger(
          {
            ...EMPTY_IST_ARTIFACT_AUTOMATIC_CHECKS,
            preflightApproved: "pass",
            exactPreparedManifestRendered: exact,
            rendererCompleted: "pass",
            artifactNonEmpty: "fail",
            expectedMimeContainer: "not-tested",
            durationWithinTolerance: "not-tested",
            manifestV3Contract9C: "pass",
            oneTerminalExportOutcome: "pass",
          },
          fixtureId,
        );
        setGenerationState("validation-fail");
        setExportStatus("failed");
        return;
      }

      setArtifactFilename(filename);
      setArtifactMime(capturedBlob.type || "video/webm");
      setArtifactBytes(bytes);
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
      setGenerationState(mapStructuralValidationToGenerationState(structuralOk));

      const automatic: IstArtifactAutomaticChecks = {
        preflightApproved: "pass",
        exactPreparedManifestRendered: exact,
        rendererCompleted: "pass",
        artifactNonEmpty: "pass",
        expectedMimeContainer: /webm/i.test(capturedBlob.type || "video/webm")
          ? "pass"
          : "fail",
        durationWithinTolerance: "not-tested",
        manifestV3Contract9C:
          nextPrepared.manifest.version === 3 &&
          nextPrepared.manifest.rendererContractVersion === "9C"
            ? "pass"
            : "fail",
        oneTerminalExportOutcome: "pass",
      };
      writeAutomaticLedger(automatic, fixtureId);

      if (!structuralOk) {
        setHardFailure(true);
        setSafeFailure(classifyIstSafeFailure("validation"));
        setExportStatus("validation-failed");
      } else {
        setExportStatus("awaiting-visual-review");
      }
    } catch {
      if (isStaleIstExportRun(exportRunRef.current, run)) {
        setSafeFailure(classifyIstSafeFailure("stale"));
        return;
      }
      setHardFailure(true);
      setSafeFailure(classifyIstSafeFailure("renderer"));
      setGenerationState("validation-fail");
      setExportStatus("failed");
      writeAutomaticLedger(
        {
          ...EMPTY_IST_ARTIFACT_AUTOMATIC_CHECKS,
          preflightApproved: "not-tested",
          exactPreparedManifestRendered: resolveExactPreparedManifestRendered({
            prepareCompleted: true,
            exportInvokedWithPrepared: exportInvoked,
            renderCompleted: false,
            artifactCapturedForRun: false,
            artifactNonEmpty: false,
            oneTerminalOutcome: true,
            stale: false,
          }),
          rendererCompleted: "fail",
          oneTerminalExportOutcome: "pass",
        },
        fixtureId,
      );
    } finally {
      setExportDownloadCaptureHandler(null);
    }
  }, [fixture, goldenId, replaceArtifactUrl, writeAutomaticLedger]);

  const buildEvidenceReport = useCallback(() => {
    const text = buildSafeIstEvidenceReport({
      timestampIso: new Date().toISOString(),
      browserName:
        typeof navigator !== "undefined"
          ? navigator.userAgent.split(/[()]/)[0]?.trim().slice(0, 40) ||
            "unknown"
          : "unknown",
      activeFixtureId: goldenId,
      renderedFingerprint: renderedManifest?.fingerprint ?? null,
      manifestVersion: renderedManifest?.version ?? null,
      rendererContractVersion:
        renderedManifest?.rendererContractVersion ?? null,
      mediaItemIds: fixture.mediaItemIds,
      effect: composition?.effect ?? (resolved.active ? resolved.effect : null),
      requestedDurationMs:
        composition?.requestedDurationMs ??
        (resolved.active ? resolved.requestedDurationMs : null),
      effectiveDurationMs:
        composition?.effectiveDurationMs ??
        (resolved.active ? resolved.effectiveDurationMs : null),
      artifact: artifactFilename
        ? {
            filename: artifactFilename,
            mimeType: artifactMime ?? "video/webm",
            byteSize: artifactBytes ?? 0,
            generationState,
          }
        : null,
      duration: durationComparison,
      ledger,
      corePreviewResult,
      coreArtifactResult,
      coreEditorResult,
      optionalVideoResult,
      optionalAudioResult,
      deviceMatrixResult,
      safeFailureCategory: safeFailure,
      previewSurface: PREVIEW_SURFACE,
      audioMode: AUDIO_MODE,
    });
    const unsafe = assertSafeIstEvidenceReport(text);
    setReport(
      unsafe.length > 0
        ? `${text}\n\nWARNING: report sanitizer flagged patterns.`
        : text,
    );
  }, [
    goldenId,
    renderedManifest,
    fixture.mediaItemIds,
    composition,
    resolved,
    artifactFilename,
    artifactMime,
    artifactBytes,
    generationState,
    durationComparison,
    ledger,
    corePreviewResult,
    coreArtifactResult,
    coreEditorResult,
    optionalVideoResult,
    optionalAudioResult,
    deviceMatrixResult,
    safeFailure,
  ]);

  if (process.env.NODE_ENV === "production") {
    return (
      <main className="p-8 text-sm">
        <p>This development QA page is not available in production.</p>
      </main>
    );
  }

  const exportScene = renderedManifest?.scenes.find(
    (s) => s.id === fixture.primarySceneId,
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 text-sm">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">
          Intra-scene Transition QA (Sprint 9D.1)
        </h1>
        <p className="text-[12px] opacity-80">
          Dev-only harness. Core freeze evidence is separated from optional
          video/audio/device checks. Uses production{" "}
          <code>prepareExportRequest</code> →{" "}
          <code>exportFootieShortFromManifest</code>. Changing fixtures keeps
          prior checklist records; Reset All clears everything.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span>Golden fixture</span>
          <select
            value={goldenId}
            onChange={(e) => {
              const next = e.target.value as IntraSceneTransitionGoldenId;
              activeFixtureRef.current = next;
              exportRunRef.current = null;
              setGoldenId(next);
              resetPlaybackAndArtifactForFixture();
            }}
          >
            {INTRA_SCENE_TRANSITION_GOLDEN_PROJECTS.map((project) => (
              <option key={project.id} value={project.id}>
                {project.id} — {project.title}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1 text-[12px]">
          <p>Primary scene: {fixture.primarySceneId}</p>
          <p>Media item IDs: {fixture.mediaItemIds.join(", ") || "(none)"}</p>
          <p>
            Manifest: {renderedManifest?.version ?? "—"} /{" "}
            {renderedManifest?.rendererContractVersion ?? "—"}
          </p>
          <p>Preview surface: {PREVIEW_SURFACE}</p>
          <p>Audio mode: {AUDIO_MODE}</p>
          <button type="button" onClick={resetAllEvidence}>
            Reset All evidence
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div
          className="relative aspect-[9/16] w-full max-w-[320px] overflow-hidden bg-black"
          data-preview-stable-media-stack="true"
          data-intra-scene-transition-active={
            layerPlan.intraScene ? "true" : "false"
          }
          data-preview-surface={PREVIEW_SURFACE}
        >
          {layerPlan.outgoing ? (
            <SceneBackdrop
              key={layerPlan.outgoing.stableKey}
              scene={scene}
              sceneIndex={0}
              style={layerPlan.outgoing.style}
              activeMediaView={layerPlan.outgoing.view}
              sceneElapsedMs={elapsedMs}
              sceneDurationMs={sceneDurationMs}
              isPlaying={layerPlan.outgoing.isPlaying}
              isActive={layerPlan.outgoing.isActive}
              allowFramingDrag={false}
            />
          ) : null}
          <SceneBackdrop
            key={layerPlan.primary.stableKey}
            scene={scene}
            sceneIndex={0}
            style={layerPlan.primary.style}
            activeMediaView={layerPlan.primary.view}
            sceneElapsedMs={elapsedMs}
            sceneDurationMs={sceneDurationMs}
            isPlaying={layerPlan.primary.isPlaying}
            isActive={layerPlan.primary.isActive}
            allowFramingDrag={false}
          />
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setIsPlaying((v) => !v)}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(1, sceneDurationMs - 1)}
              value={Math.min(elapsedMs, sceneDurationMs - 1)}
              onChange={(e) => setElapsedMs(Number(e.target.value))}
            />
            <span>{Math.round(elapsedMs)} ms</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {seekButtons.map((button) => (
              <button
                key={button.label}
                type="button"
                onClick={() => setElapsedMs(button.ms)}
              >
                {button.label}
              </button>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-1 text-[12px]">
            <dt>Active / overlay</dt>
            <dd>{composition ? "intra-scene" : "ordinary/hard-cut"}</dd>
            <dt>Outgoing</dt>
            <dd>{composition?.fromMediaItemId ?? "—"}</dd>
            <dt>Incoming / primary</dt>
            <dd>
              {composition?.toMediaItemId ??
                layerPlan.primary.view.mediaItemId ??
                "—"}
            </dd>
            <dt>Effect</dt>
            <dd>{composition?.effect ?? "cut/absence"}</dd>
            <dt>Progress</dt>
            <dd>{composition ? composition.progress.toFixed(3) : "—"}</dd>
            <dt>Requested / effective</dt>
            <dd>
              {composition
                ? `${composition.requestedDurationMs} / ${composition.effectiveDurationMs}`
                : "—"}
            </dd>
          </dl>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Production WebM export (silent)</h2>
        <button type="button" onClick={() => void runProductionExport()}>
          Prepare + render exact production manifest
        </button>
        <p className="text-[12px]">Status: {exportStatus}</p>
        <p className="text-[12px]">Generation: {generationState}</p>
        <p className="text-[12px]">
          Safe failure: {safeFailure ?? "none"}
        </p>
        {exportScene && isExportSceneManifestV3(exportScene) ? (
          <p className="text-[12px]">
            Frozen boundaries:{" "}
            {exportScene.mediaTransitions.boundaries.length} (same manifest as
            renderer)
          </p>
        ) : null}
        {artifactUrl ? (
          <video
            ref={videoRef}
            src={artifactUrl}
            controls
            className="max-h-80 w-full bg-black"
            onLoadedMetadata={() => {
              const duration = videoRef.current?.duration;
              const measured =
                typeof duration === "number" && Number.isFinite(duration)
                  ? duration
                  : null;
              setMeasuredDurationSec(measured);
              if (measured == null || measured <= 0) {
                setSafeFailure(classifyIstSafeFailure("duration_unknown"));
                return;
              }
              if (!prepared) return;
              const comparison = compareArtifactDuration(
                prepared.manifest.project.renderDurationMs,
                measured,
              );
              writeAutomaticLedger(
                {
                  ...automaticWithDuration,
                  durationWithinTolerance: comparison.result,
                },
                goldenId,
              );
              if (comparison.result === "fail") {
                setSafeFailure(classifyIstSafeFailure("duration_bad"));
              }
            }}
          />
        ) : null}
      </section>

      <TriStateChecklistGroup
        title="Core Preview (freeze-required)"
        groupId="preview-core"
        keys={IST_CORE_PREVIEW_CHECK_KEYS}
        labels={CORE_PREVIEW_LABELS}
        checks={corePreviewChecks}
        onChange={setCorePreview}
      />
      <TriStateChecklistGroup
        title="Optional Preview / capability (not freeze-blocking when not-tested)"
        groupId="preview-optional"
        keys={IST_OPTIONAL_PREVIEW_CHECK_KEYS}
        labels={OPTIONAL_PREVIEW_LABELS}
        checks={optionalPreviewChecks}
        onChange={setOptionalPreview}
        passGate={(key) =>
          key === "videoContinuityAcceptable"
            ? videoContinuityGate
            : precedenceGate
        }
      />
      <TriStateChecklistGroup
        title="Artifact automatic"
        groupId="auto"
        keys={IST_ARTIFACT_AUTOMATIC_CHECK_KEYS}
        labels={Object.fromEntries(
          IST_ARTIFACT_AUTOMATIC_CHECK_KEYS.map((key) => [key, key]),
        ) as Record<(typeof IST_ARTIFACT_AUTOMATIC_CHECK_KEYS)[number], string>}
        checks={automaticWithDuration}
        readOnly
        onChange={() => undefined}
      />
      <TriStateChecklistGroup
        title="Core Artifact visual (freeze-required)"
        groupId="visual-core"
        keys={IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS}
        labels={CORE_ARTIFACT_VISUAL_LABELS}
        checks={coreArtifactVisual}
        onChange={setCoreArtifactVisual}
      />
      <TriStateChecklistGroup
        title="Optional Artifact visual"
        groupId="visual-optional"
        keys={IST_OPTIONAL_ARTIFACT_VISUAL_CHECK_KEYS}
        labels={OPTIONAL_ARTIFACT_LABELS}
        checks={optionalArtifactVisual}
        onChange={setOptionalArtifactVisual}
        passGate={() => audioContinuityGate}
      />

      <section className="space-y-2">
        <h2 className="font-medium">Editor evidence (Studio workflow)</h2>
        <p className="text-[12px] opacity-80">
          Complete these steps in the Studio editor (not duplicated here). Open{" "}
          <Link className="underline" href="/drafts">
            /drafts
          </Link>{" "}
          or an editor route, then mark each check only after observing it.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-[12px]">
          {IST_EDITOR_OPERATOR_WORKFLOW.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <TriStateChecklistGroup
        title="Core Editor (freeze-required)"
        groupId="editor"
        keys={IST_EDITOR_CHECK_KEYS}
        labels={EDITOR_LABELS}
        checks={editorChecks}
        onChange={setEditorCheck}
      />

      <TriStateChecklistGroup
        title="Optional device matrix"
        groupId="device"
        keys={IST_DEVICE_MATRIX_CHECK_KEYS}
        labels={DEVICE_LABELS}
        checks={deviceChecks}
        onChange={(key, value) =>
          setDeviceChecks((prev) => ({ ...prev, [key]: value }))
        }
      />

      <section className="space-y-2">
        <p>
          Core Preview: <strong>{corePreviewResult}</strong> · Core Artifact:{" "}
          <strong>{coreArtifactResult}</strong> · Core Editor:{" "}
          <strong>{coreEditorResult}</strong>
        </p>
        <p className="text-[12px]">
          Optional Video: {optionalVideoResult} · Optional Audio:{" "}
          {optionalAudioResult} · Device matrix: {deviceMatrixResult}
        </p>
        <button type="button" onClick={buildEvidenceReport}>
          Build safe evidence report
        </button>
        {report ? (
          <textarea
            className="h-64 w-full font-mono text-[11px]"
            readOnly
            value={report}
          />
        ) : null}
      </section>
    </main>
  );
}

function resolveOptionalAcross(
  ledger: IstEvidenceLedger,
  checkId: string,
): EvidenceCheckResult {
  const matches = ledger.filter((entry) => entry.checkId === checkId);
  if (matches.some((entry) => entry.result === "fail")) return "fail";
  if (matches.some((entry) => entry.result === "pass")) return "pass";
  return "not-tested";
}
