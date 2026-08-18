"use client";

/**
 * Development-only Preview runtime-parity harness.
 * Uses production PreviewFrame plus a diagnostic HUD. In-memory only.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  setEngagementOverlayKind,
  setEngagementOverlayPosition,
  setEngagementOverlayScale,
  setEngagementOverlaySize,
} from "@/features/engagement-overlays/editor/engagement-overlay.commands";
import { BrandStingPreview, getShortForgeBrandSting } from "@/features/brand-sting";
import EngagementOverlayPreview from "@/features/engagement-overlays/preview/EngagementOverlayPreview";
import {
  PreviewRuntimeParityCtaCanvasReference,
  type CtaCanvasReferenceDiagnostics,
} from "./PreviewRuntimeParityCtaCanvasReference";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import CaptionOverlay from "@/features/preview/components/CaptionOverlay";
import PreviewFrame from "@/features/preview/components/PreviewFrame";
import SubtitleOverlay from "@/features/preview/components/SubtitleOverlay";
import { normalizeCaptionMode } from "@/features/story/utils";
import {
  collectAuthoritativePreviewMountedLayers,
} from "@/features/preview/runtime-parity/collect-authoritative-preview-mounted-layers";
import { resolvePreviewSelectedMediaInspection } from "@/features/preview/runtime-parity/resolve-preview-selected-media-inspection";
import { resolvePreviewClockAfterMediaMutation } from "@/features/preview/runtime-parity/reconcile-preview-playback-clock";
import { buildCertificationPreviewMasterTimeline } from "@/features/preview/runtime-parity/apply-preview-runtime-parity-certification-scene-timing";
import { buildPreviewRuntimeParityIntegratedCertificationStory } from "@/features/preview/runtime-parity/build-preview-runtime-parity-integrated-certification-story";
import { buildPreviewRuntimeParityHarnessStory } from "@/features/preview/runtime-parity/build-preview-runtime-parity-story";
import {
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
} from "@/features/preview/runtime-parity/preview-runtime-parity-certification-capture";
import {
  resolvePreviewRuntimeParityCertificationSeek,
  type PreviewRuntimeParityCertificationSeekSnapshot,
} from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-seek";
import { resolvePreviewRuntimeParityCertificationBounds } from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-bounds";
import { resolvePreviewTransitionOverlay } from "@/features/preview/utils/previewTransitionOverlay";
import { resolvePreviewSceneLocalTimeMs } from "@/features/editor/preview/motion";
import { getSceneTimingMap } from "@/features/story/utils";
import { prepareExportRequest } from "@/features/export/domain";
import { exportFootieShortFromManifest } from "@/features/export/services/video-render.service";
import { setExportDownloadCaptureHandler } from "@/features/export/utils/download.utils";
import { createPreviewRuntimeParityVideoBlobUrl } from "@/features/preview/runtime-parity/create-preview-runtime-parity-video-blob";
import {
  PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX,
} from "@/features/preview/runtime-parity/preview-runtime-parity-contract";
import {
  PREVIEW_RUNTIME_PARITY_CAPTION_ALIGNS,
  PREVIEW_RUNTIME_PARITY_CAPTION_EFFECTS,
  PREVIEW_RUNTIME_PARITY_CORPUS,
  PREVIEW_RUNTIME_PARITY_CTA_SIZES,
} from "@/features/preview/runtime-parity/preview-runtime-parity-corpus";
import {
  PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES,
  previewRuntimeParityPublicUrl,
} from "@/features/preview/runtime-parity/preview-runtime-parity-fixture-identities";
import { resolvePreviewClockAuthority } from "@/features/preview/runtime-parity/resolve-preview-clock-authority";
import { resolvePreviewPresentationAuthority } from "@/features/preview/runtime-parity/resolve-preview-presentation-authority";
import {
  appendSceneMediaImageItem,
  moveSceneMediaItemLeft,
  moveSceneMediaItemRight,
  removeSceneMediaItem,
  resolvePreviewSceneMediaWindows,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline";
import type { CaptionAnimationPreset } from "@/features/caption-animation/caption-animation.types";
import type { CaptionPresetId } from "@/features/caption-engine/caption-engine.types";
import { CAPTION_ANCHORS } from "@/features/caption-layout/caption-layout.defaults";
import type { CaptionAnchor, CaptionTextAlign } from "@/features/caption-layout/caption-layout.types";
import type { FootieScript } from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
  EngagementOverlaySize,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";
import { ENGAGEMENT_OVERLAY_MIN_SCALE, ENGAGEMENT_OVERLAY_MAX_SCALE } from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import { collectPreviewCtaDomMeasurements } from "@/features/preview/runtime-parity/collect-preview-cta-dom-measurements";
import { resolveCtaCheckpointElapsedMs } from "@/features/preview/runtime-parity/measure-preview-cta-measured-parity";
import {
  PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER,
  PREVIEW_RUNTIME_PARITY_CTA_KINDS,
  PREVIEW_RUNTIME_PARITY_CTA_TOLERANCE,
  resolvePreviewInnerScreenWidthPx,
} from "@/features/preview/runtime-parity/preview-runtime-parity-cta-contract";

const CAPTION_PRESET_IDS: readonly CaptionPresetId[] = [
  "minimal",
  "documentary",
  "tiktok",
  "sports",
  "news",
  "cinematic",
];

const CTA_POSITIONS: readonly EngagementOverlayPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const CTA_CHECKPOINTS = [
  "hidden-before",
  "entrance-start",
  "entrance-mid",
  "hold",
  "like-active",
  "share-active",
  "subscribe-active",
  "subscribe-confirm",
  "exit-start",
  "exit-mid",
  "hidden-after",
] as const;

type CtaCheckpoint = (typeof CTA_CHECKPOINTS)[number];
type CtaCollisionCase =
  | "none"
  | "top"
  | "center"
  | "bottom"
  | "collide"
  | "relocated";

declare global {
  interface Window {
    __PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__?: {
      status: "done" | "rendering" | "preparing" | "failed" | "blocked";
      bytes?: number;
      mimeType?: string;
      filename?: string;
      blobUrl?: string;
      renderer?: string;
      manifestFingerprint?: string | null;
      progress?: string;
      error?: string;
    };
    __PREVIEW_RUNTIME_PARITY_SEEK__?: (ms: number) => void;
    __PREVIEW_RUNTIME_PARITY_SEEK_SNAPSHOT__?: PreviewRuntimeParityCertificationSeekSnapshot;
  }
}

function replaceScene(script: FootieScript, sceneId: string, nextScene: FootieScript["scenes"][number]): FootieScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) => (scene.id === sceneId ? nextScene : scene)),
  };
}

export function PreviewRuntimeParityQaHarness() {
  const [script, setScript] = useState<FootieScript>(() =>
    buildPreviewRuntimeParityHarnessStory(),
  );
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedMediaItemId, setSelectedMediaItemId] = useState<string | null>(null);
  const [previewWidthPx, setPreviewWidthPx] = useState<number>(260);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineMs, setTimelineMs] = useState(0);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [removedUrls, setRemovedUrls] = useState<string[]>([]);
  const [videoBlobsReady, setVideoBlobsReady] = useState(false);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const [captionBoundsJson, setCaptionBoundsJson] = useState("none");
  const [ctaBoundsJson, setCtaBoundsJson] = useState("none");
  const [ctaCheckpoint, setCtaCheckpoint] = useState<CtaCheckpoint>("hold");
  const [ctaCollisionCase, setCtaCollisionCase] = useState<CtaCollisionCase>("none");
  const [ctaCanvasPlanJson, setCtaCanvasPlanJson] = useState("none");
  const [exportStatus, setExportStatus] = useState("idle");
  const [frozenCertLoaded, setFrozenCertLoaded] = useState(false);
  const [certificationCaptureArmed, setCertificationCaptureArmed] = useState(false);
  const publishCtaCanvasPlan = useCallback((diagnostics: CtaCanvasReferenceDiagnostics | null) => {
    setCtaCanvasPlanJson(diagnostics ? JSON.stringify(diagnostics) : "none");
  }, []);
  const playStartedAtRef = useRef<number | null>(null);
  const playOffsetRef = useRef(0);
  const playScopeRef = useRef<"story" | "scene">("story");
  const playEndMsRef = useRef<number | null>(null);

  const certificationBounds = useMemo(
    () => resolvePreviewRuntimeParityCertificationBounds(script),
    [script],
  );
  const previewMasterTimeline = useMemo(
    () => buildCertificationPreviewMasterTimeline(script),
    [script],
  );
  const seekSnapshot = useMemo(
    () =>
      resolvePreviewRuntimeParityCertificationSeek(
        script,
        timelineMs,
        certificationBounds,
      ),
    [certificationBounds, script, timelineMs],
  );
  const resolvedSceneIndex = seekSnapshot.sceneIndex;
  const scene = script.scenes[resolvedSceneIndex] ?? script.scenes[sceneIndex] ?? script.scenes[0]!;
  const sceneDurationMs = getSceneDurationMs(scene);
  const sceneStartMs = scene.startMs ?? 0;
  const sceneElapsedMs = seekSnapshot.sceneLocalMs;
  const contentEndMs = certificationBounds.contentEndMs;
  const brandSting = getShortForgeBrandSting(script.visualRetentionExtensions);
  const brandStingActive = seekSnapshot.brandSting.active;
  const brandStingElapsedMs = seekSnapshot.brandSting.elapsedMs;
  const terminalHidden = seekSnapshot.terminalHidden;
  const seekMaxMs = Math.max(1, certificationBounds.renderEndMs);
  const transitionOverlay =
    brandStingActive || terminalHidden
      ? null
      : resolvePreviewTransitionOverlay(
          previewMasterTimeline,
          script.scenes,
          timelineMs,
        );
  const timingMap = getSceneTimingMap(script.scenes);
  const transitionFromSceneElapsedMs =
    transitionOverlay != null
      ? resolvePreviewSceneLocalTimeMs({
          timelineTimeMs: timelineMs,
          sceneStartMs:
            transitionOverlay.fromScene.startMs ??
            timingMap[transitionOverlay.fromSceneIndex]?.startMs ??
            0,
          sceneDurationMs: getSceneDurationMs(transitionOverlay.fromScene),
        })
      : 0;
  const transitionToSceneElapsedMs =
    transitionOverlay != null
      ? resolvePreviewSceneLocalTimeMs({
          timelineTimeMs: timelineMs,
          sceneStartMs:
            transitionOverlay.toScene.startMs ??
            timingMap[transitionOverlay.toSceneIndex]?.startMs ??
            0,
          sceneDurationMs: getSceneDurationMs(transitionOverlay.toScene),
        })
      : 0;
  const certificationCaptureMode = frozenCertLoaded && certificationCaptureArmed;
  const captureWidthPx = certificationCaptureMode
    ? PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX
    : previewWidthPx;

  const windows = useMemo(
    () =>
      resolvePreviewSceneMediaWindows(scene, {
        mixedMediaScenesEnabled: true,
      }),
    [scene],
  );

  const presentation = useMemo(
    () =>
      resolvePreviewPresentationAuthority({
        scene,
        sceneElapsedMs,
        isPlaying,
        selectedMediaItemId,
        removedMediaIds: removedIds,
        removedMediaUrls: removedUrls,
        mixedMediaScenesEnabled: true,
        timelineMs,
        brandStingActive,
        interSceneTransitionActive: Boolean(transitionOverlay),
      }),
    [brandStingActive, isPlaying, removedIds, removedUrls, scene, sceneElapsedMs, selectedMediaItemId, timelineMs, transitionOverlay],
  );

  const inspection = useMemo(
    () =>
      resolvePreviewSelectedMediaInspection({
        scene,
        selectedMediaItemId,
        sceneElapsedMs,
        isPlaying,
        mixedMediaScenesEnabled: true,
      }),
    [isPlaying, scene, sceneElapsedMs, selectedMediaItemId],
  );

  const presentationSceneElapsedMs = inspection.active
    ? inspection.inspectionSceneElapsedMs
    : sceneElapsedMs;

  const mountedPlan = useMemo(
    () =>
      collectAuthoritativePreviewMountedLayers({
        scene,
        sceneElapsedMs,
        isPlaying,
        selectedMediaItemId,
        removedMediaIds: removedIds,
        removedMediaUrls: removedUrls,
        mixedMediaScenesEnabled: true,
      }),
    [isPlaying, removedIds, removedUrls, scene, sceneElapsedMs, selectedMediaItemId],
  );

  useEffect(() => {
    let cancelled = false;
    const blobUrls: string[] = [];
    void (async () => {
      const replacements = new Map<string, string>();
      for (const identity of PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES) {
        const blobUrl = await createPreviewRuntimeParityVideoBlobUrl({
          marker: identity.marker,
          fill: identity.fill,
        });
        if (blobUrl) {
          blobUrls.push(blobUrl);
          replacements.set(identity.id, blobUrl);
        }
      }
      if (cancelled || replacements.size === 0) {
        setVideoBlobsReady(false);
        return;
      }
      setScript((current) => ({
        ...current,
        scenes: current.scenes.map((entry) => {
          const replaceUrl = (url: string | undefined) => {
            if (!url) return url;
            for (const identity of PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES) {
              if (url === previewRuntimeParityPublicUrl(identity.fileName)) {
                return replacements.get(identity.id) ?? url;
              }
            }
            return url;
          };
          return {
            ...entry,
            media:
              entry.media?.type === "video"
                ? { ...entry.media, url: replaceUrl(entry.media.url) }
                : entry.media,
            mediaTimeline: entry.mediaTimeline
              ? {
                  ...entry.mediaTimeline,
                  items: entry.mediaTimeline.items.map((item) =>
                    item.media.type === "video"
                      ? {
                          ...item,
                          media: {
                            ...item.media,
                            url: replaceUrl(item.media.url),
                          },
                        }
                      : item,
                  ),
                }
              : entry.mediaTimeline,
          };
        }),
      }));
      setVideoBlobsReady(true);
    })();
    return () => {
      cancelled = true;
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    window.__PREVIEW_RUNTIME_PARITY_SEEK_SNAPSHOT__ = seekSnapshot;
  }, [seekSnapshot]);

  useEffect(() => {
    window.__PREVIEW_RUNTIME_PARITY_SEEK__ = (ms: number) => {
      const snapshot = resolvePreviewRuntimeParityCertificationSeek(
        script,
        ms,
        certificationBounds,
      );
      setIsPlaying(false);
      setSelectedMediaItemId(null);
      setTimelineMs(snapshot.timelineMs);
      setSceneIndex(snapshot.sceneIndex);
      window.__PREVIEW_RUNTIME_PARITY_SEEK_SNAPSHOT__ = snapshot;
    };
    return () => {
      delete window.__PREVIEW_RUNTIME_PARITY_SEEK__;
    };
  }, [certificationBounds, script]);

  useEffect(() => {
    if (!isPlaying) {
      playStartedAtRef.current = null;
      return;
    }
    playStartedAtRef.current = performance.now();
    let frame = 0;
    const tick = () => {
      const started = playStartedAtRef.current;
      if (started == null) return;
      const next = playOffsetRef.current + (performance.now() - started);
      const storyEnd = certificationBounds.renderEndMs;
      const sceneEnd = playEndMsRef.current;
      if (playScopeRef.current === "scene" && sceneEnd != null && next >= sceneEnd) {
        const scopedIndex = resolvePreviewRuntimeParityCertificationSeek(
          script,
          next,
        ).sceneIndex;
        const completed = resolvePreviewClockAuthority({
          action: "complete-scene",
          scenes: script.scenes,
          sceneIndex: scopedIndex >= 0 ? scopedIndex : 0,
          timelineMs: next,
        });
        setTimelineMs(completed.timelineMs);
        setIsPlaying(false);
        return;
      }
      if (next >= storyEnd) {
        const completed = resolvePreviewClockAuthority({
          action: "complete-story",
          scenes: script.scenes,
          sceneIndex: script.scenes.length - 1,
          timelineMs: next,
        });
        setTimelineMs(completed.timelineMs);
        setSceneIndex(completed.sceneIndex);
        setIsPlaying(false);
        return;
      }
      const activeIndex =
        resolvePreviewRuntimeParityCertificationSeek(script, next).sceneIndex;
      if (activeIndex >= 0) {
        setSceneIndex(activeIndex);
      }
      setTimelineMs(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [certificationBounds.renderEndMs, isPlaying, script]);

  const updateCurrentScene = useCallback(
    (nextScene: FootieScript["scenes"][number]) => {
      setScript((current) => replaceScene(current, scene.id, nextScene));
    },
    [scene.id],
  );

  useLayoutEffect(() => {
    const host = previewHostRef.current;
    if (!host) {
      return;
    }

    const publish = () => {
      const surface =
        host.querySelector("[data-preview-runtime-parity-cert-capture-surface]") ??
        host.querySelector("[data-preview-inner-screen]") ??
        host;
      const frame = surface.getBoundingClientRect();
      const box =
        host.querySelector("[data-preview-caption-visual-box]") ??
        host.querySelector("[data-preview-caption-placement-box]");
      if (!box || frame.width <= 0 || frame.height <= 0) {
        setCaptionBoundsJson("none");
        return;
      }
      const rect = box.getBoundingClientRect();
      const left = rect.left - frame.left;
      const top = rect.top - frame.top;
      setCaptionBoundsJson(
        JSON.stringify({
          left,
          top,
          width: rect.width,
          height: rect.height,
          centerX: left + rect.width / 2,
          centerY: top + rect.height / 2,
          outputLeft: (left / frame.width) * 1080,
          outputTop: (top / frame.height) * 1920,
          outputWidth: (rect.width / frame.width) * 1080,
          outputHeight: (rect.height / frame.height) * 1920,
          outputCenterX: ((left + rect.width / 2) / frame.width) * 1080,
          outputCenterY: ((top + rect.height / 2) / frame.height) * 1920,
          anchor: host.querySelector("[data-preview-caption-anchor]")?.getAttribute("data-preview-caption-anchor") ?? "",
          legacy: host.querySelector("[data-preview-caption-legacy]")?.getAttribute("data-preview-caption-legacy") ?? "",
        }),
      );
    };

    const publishCta = () => {
      const measured = collectPreviewCtaDomMeasurements(host);
      setCtaBoundsJson(measured ? JSON.stringify(measured) : "none");
    };

    publish();
    publishCta();
    const observer = new ResizeObserver(() => {
      publish();
      publishCta();
    });
    observer.observe(host);
    const box = host.querySelector("[data-preview-caption-placement-box]");
    if (box) {
      observer.observe(box);
    }
    const inner = host.querySelector("[data-preview-inner-screen]");
    if (inner) {
      observer.observe(inner);
    }
    const cta = host.querySelector("[data-engagement-overlay-preview='true']");
    if (cta) {
      observer.observe(cta);
    }
    return () => observer.disconnect();
  }, [previewWidthPx, scene, timelineMs, isPlaying, presentationSceneElapsedMs, ctaCollisionCase]);

  const handleRemove = (mediaItemId: string) => {
    const window = windows.find((entry) => entry.itemId === mediaItemId);
    const result = removeSceneMediaItem(scene, mediaItemId);
    setRemovedIds((current) => [...current, mediaItemId]);
    if (window?.media.url) {
      setRemovedUrls((current) => [...current, window.media.url!]);
    }
    const nextScript = replaceScene(script, scene.id, result.scene);
    const nextClock = resolvePreviewClockAfterMediaMutation({
      scenes: nextScript.scenes,
      sceneIndex,
      timelineMs,
      clockKind: isPlaying ? "playing" : "idle",
    });
    setScript(nextScript);
    setTimelineMs(nextClock.timelineMs);
    if (selectedMediaItemId === mediaItemId) {
      setSelectedMediaItemId(result.selectedMediaItemId);
    }
  };

  const overlay = getSceneEngagementOverlay(script, scene.id);
  const showCaptions = ctaCollisionCase !== "none" || frozenCertLoaded;
  const captionCollision = useMemo(
    () => ({
      present: showCaptions,
      sceneLayout: scene.captionLayout,
      projectLayout: script.defaultCaptionLayout,
      sceneStyle: scene.captionStyle,
      projectStyle: script.defaultCaptionStyle,
    }),
    [
      showCaptions,
      scene.captionLayout,
      scene.captionStyle,
      script.defaultCaptionLayout,
      script.defaultCaptionStyle,
    ],
  );
  const seekCtaCheckpoint = (checkpoint: CtaCheckpoint) => {
    const elapsed = resolveCtaCheckpointElapsedMs({
      startOffsetMs: overlay?.startOffsetMs ?? 400,
      durationMs: overlay?.durationMs ?? 2500,
      checkpoint,
    });
    setCtaCheckpoint(checkpoint);
    setIsPlaying(false);
    setTimelineMs(sceneStartMs + elapsed);
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-preview-runtime-parity-qa-harness
    >
      <header className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Local development QA harness · Preview runtime parity
        </p>
        <h1 className="mt-1 text-lg font-semibold">Preview runtime parity</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          In-memory corpus only. Automatic checks never claim visual Pass.
          Browser-rendered appearance is an operator check, not a decoded-export
          substitute.
        </p>
        <p
          className="mt-2 font-mono text-[11px] text-muted-foreground"
          data-preview-runtime-parity-build-marker={PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER}
        >
          {PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER}
        </p>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2" data-preview-runtime-parity-scenes="">
            {script.scenes.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-sm"
                data-preview-runtime-parity-scene-select={index}
                aria-pressed={resolvedSceneIndex === index}
                onClick={() => {
                  const next = resolvePreviewClockAuthority({
                    action: "select-scene",
                    scenes: script.scenes,
                    sceneIndex,
                    timelineMs,
                    targetSceneIndex: index,
                  });
                  setIsPlaying(false);
                  setSceneIndex(next.sceneIndex);
                  setTimelineMs(next.timelineMs);
                  setSelectedMediaItemId(null);
                }}
              >
                Scene {index + 1}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX.map((width) => (
              <button
                key={width}
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-sm"
                data-preview-runtime-parity-width={width}
                aria-pressed={previewWidthPx === width}
                onClick={() => setPreviewWidthPx(width)}
              >
                {width}px
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-4">
            <div
              ref={previewHostRef}
              data-preview-runtime-parity-preview-host=""
              data-preview-runtime-parity-cta-preview=""
              data-preview-runtime-parity-cert-capture={
                certificationCaptureMode ? "true" : "false"
              }
              style={{
                width: captureWidthPx,
                height: certificationCaptureMode
                  ? PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX
                  : undefined,
              }}
            >
              <PreviewFrame
                title={script.title}
                previewFrame={{ kind: "scene", scene, sceneIndex: resolvedSceneIndex }}
                selectedMediaItemId={selectedMediaItemId}
                inspectionPresentation={inspection}
                transitionOverlay={transitionOverlay}
                transitionFromSceneElapsedMs={transitionFromSceneElapsedMs}
                transitionFromSceneDurationMs={
                  transitionOverlay
                    ? getSceneDurationMs(transitionOverlay.fromScene)
                    : 0
                }
                transitionToSceneElapsedMs={transitionToSceneElapsedMs}
                transitionToSceneDurationMs={
                  transitionOverlay
                    ? getSceneDurationMs(transitionOverlay.toScene)
                    : 0
                }
                sceneElapsedMs={presentationSceneElapsedMs}
                sceneDurationMs={sceneDurationMs}
                isPlaying={isPlaying}
                maxWidth={captureWidthPx}
                mixedMediaScenesEnabled
                contentTimeMs={timelineMs}
                contentDurationMs={contentEndMs}
                certificationCaptureMode={certificationCaptureMode}
                watermarkEnabled={!brandStingActive && !terminalHidden}
                overlay={
                  brandStingActive ? (
                    <BrandStingPreview sting={brandSting} elapsedMs={brandStingElapsedMs} />
                  ) : terminalHidden ? (
                    <div
                      data-preview-runtime-parity-terminal-hidden=""
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "#000",
                      }}
                    />
                  ) : (
                  <>
                    {overlay ? (
                      <EngagementOverlayPreview
                        overlay={overlay}
                        sceneDurationMs={sceneDurationMs}
                        sceneElapsedMs={presentationSceneElapsedMs}
                        captionCollision={captionCollision}
                      />
                    ) : null}
                    {showCaptions &&
                    normalizeCaptionMode(scene.captionMode) === "subtitles" ? (
                      <SubtitleOverlay
                        scene={scene}
                        script={script}
                        sceneIndex={resolvedSceneIndex}
                        sceneElapsedMs={presentationSceneElapsedMs}
                        sceneDurationMs={sceneDurationMs}
                        draggable={!certificationCaptureMode}
                        allowPointerEvents={!isPlaying && !certificationCaptureMode}
                        onOffsetCommit={(offsetX, offsetY) => {
                          updateCurrentScene({
                            ...scene,
                            captionLayout: {
                              ...scene.captionLayout,
                              version: 2,
                              offsetX,
                              offsetY,
                            },
                          });
                        }}
                      />
                    ) : null}
                    {showCaptions &&
                    normalizeCaptionMode(scene.captionMode) !== "subtitles" ? (
                      <CaptionOverlay
                        scene={scene}
                        script={script}
                        sceneIndex={resolvedSceneIndex}
                        draggable={!certificationCaptureMode}
                        allowPointerEvents={!isPlaying && !certificationCaptureMode}
                        onOffsetCommit={(offsetX, offsetY) => {
                          updateCurrentScene({
                            ...scene,
                            captionLayout: {
                              ...scene.captionLayout,
                              version: 2,
                              offsetX,
                              offsetY,
                            },
                          });
                        }}
                      />
                    ) : null}
                  </>
                  )
                }
              />
            </div>
            <div
              className="space-y-2"
              data-preview-runtime-parity-cta-canvas-host=""
              style={{ width: resolvePreviewInnerScreenWidthPx(previewWidthPx) }}
            >
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Production canvas reference
              </p>
              <PreviewRuntimeParityCtaCanvasReference
                overlay={overlay}
                sceneDurationMs={sceneDurationMs}
                sceneElapsedMs={presentationSceneElapsedMs}
                captionCollision={captionCollision}
                onDiagnostics={publishCtaCanvasPlan}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2" data-preview-runtime-parity-transport="">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-play=""
              onClick={() => {
                setSelectedMediaItemId(null);
                playScopeRef.current = "story";
                playEndMsRef.current = null;
                playOffsetRef.current = timelineMs;
                setIsPlaying(true);
              }}
            >
              Play
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-play-scene=""
              onClick={() => {
                setSelectedMediaItemId(null);
                playScopeRef.current = "scene";
                playEndMsRef.current = scene.endMs ?? sceneStartMs + sceneDurationMs;
                playOffsetRef.current = sceneStartMs;
                setTimelineMs(sceneStartMs);
                setIsPlaying(true);
              }}
            >
              Play Scene
            </button>
            <button type="button" className="rounded-md border px-3 py-1.5 text-sm" data-preview-runtime-parity-pause="" onClick={() => setIsPlaying(false)}>
              Pause
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-stop=""
              onClick={() => {
                setIsPlaying(false);
              }}
            >
              Stop
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-clear-selection=""
              onClick={() => setSelectedMediaItemId(null)}
            >
              Clear selection
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-restart-scene=""
              onClick={() => {
                const next = resolvePreviewClockAuthority({
                  action: "restart-scene",
                  scenes: script.scenes,
                  sceneIndex,
                  timelineMs,
                });
                setIsPlaying(false);
                setTimelineMs(next.timelineMs);
                if (next.exitsInspection) setSelectedMediaItemId(null);
              }}
            >
              Restart scene
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-load-frozen-cert=""
              onClick={() => {
                const frozen = buildPreviewRuntimeParityIntegratedCertificationStory();
                setIsPlaying(false);
                setSelectedMediaItemId(null);
                setSceneIndex(0);
                setTimelineMs(0);
                setRemovedIds([]);
                setRemovedUrls([]);
                setCtaCollisionCase("collide");
                setScript(frozen.story);
                setFrozenCertLoaded(true);
                setCertificationCaptureArmed(false);
              }}
            >
              Load frozen cert story
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-arm-cert-capture=""
              onClick={() => setCertificationCaptureArmed(true)}
            >
              Arm clean capture
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-export-browser=""
              onClick={() => {
                void (async () => {
                  const capture: { blob: Blob | null; filename: string | null } = {
                    blob: null,
                    filename: null,
                  };
                  setExportDownloadCaptureHandler((blob, filename) => {
                    capture.blob = blob;
                    capture.filename = filename;
                  });
                  setExportStatus("preparing");
                  window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__ = {
                    status: "preparing",
                  };
                  try {
                    const prepared = await prepareExportRequest({
                      story: script,
                      options: {
                        exportSettings: {
                          format: "webm",
                          resolution: "1080x1920",
                          quality: "standard",
                        },
                        audioMode: "silent",
                      },
                      throwIfBlocked: true,
                      mixedMediaScenesEnabled: true,
                      engagementOverlaysEnabled: true,
                      shortForgeBrandStingEnabled: true,
                      keyframedVisualEffectsEnabled: true,
                    });
                    if (!prepared.preflight.supported || prepared.renderer !== "browser") {
                      const blocked = `blocked:${prepared.renderer}:supported=${prepared.preflight.supported}`;
                      setExportStatus(blocked);
                      window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__ = {
                        status: "blocked",
                        error: blocked,
                        renderer: prepared.renderer,
                      };
                      return;
                    }
                    setExportStatus("rendering");
                    window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__ = {
                      status: "rendering",
                      progress: "0%",
                    };
                    await exportFootieShortFromManifest(
                      prepared,
                      (progress) => {
                        const label = `${progress.status}:${Math.round(progress.progress)}%`;
                        setExportStatus(label);
                        window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__ = {
                          status: "rendering",
                          progress: label,
                        };
                      },
                      { audioFallback: "silent" },
                    );
                    const blob = capture.blob;
                    if (!blob || blob.size <= 0) {
                      setExportStatus("failed:empty");
                      window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__ = {
                        status: "failed",
                        error: "empty",
                      };
                      return;
                    }
                    window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__ = {
                      status: "done",
                      bytes: blob.size,
                      mimeType: blob.type || "video/webm",
                      filename: capture.filename ?? "prompt6-browser-1080.webm",
                      blobUrl: URL.createObjectURL(blob),
                      renderer: prepared.renderer,
                      manifestFingerprint: prepared.manifest.fingerprint,
                    };
                    setExportStatus(`done:${blob.size}`);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    setExportStatus(`failed:${message}`);
                    window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__ = {
                      status: "failed",
                      error: message,
                    };
                  } finally {
                    setExportDownloadCaptureHandler(null);
                  }
                })();
              }}
            >
              Export Browser 1080p
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              data-preview-runtime-parity-restart-story=""
              onClick={() => {
                const next = resolvePreviewClockAuthority({
                  action: "restart-story",
                  scenes: script.scenes,
                  sceneIndex,
                  timelineMs,
                });
                setIsPlaying(false);
                setSceneIndex(next.sceneIndex);
                setTimelineMs(next.timelineMs);
                setSelectedMediaItemId(null);
              }}
            >
              Restart story
            </button>
            <label className="flex items-center gap-2 text-sm">
              Seek
              <input
                type="range"
                min={0}
                max={seekMaxMs}
                value={timelineMs}
                data-preview-runtime-parity-seek=""
                onChange={(event) => {
                  const snapshot = resolvePreviewRuntimeParityCertificationSeek(
                    script,
                    Number(event.target.value),
                  );
                  setIsPlaying(false);
                  setSelectedMediaItemId(null);
                  setTimelineMs(snapshot.timelineMs);
                  setSceneIndex(snapshot.sceneIndex);
                }}
              />
            </label>
          </div>
        </section>

        <aside className="space-y-4 text-sm">
          <section data-preview-runtime-parity-diagnostics="">
            <h2 className="font-semibold">Diagnostics</h2>
            <dl className="mt-2 space-y-1">
              <div>
                <dt className="text-muted-foreground">Timeline time</dt>
                <dd data-preview-runtime-parity-timeline-ms="">{Math.round(timelineMs)}</dd>
                <dt className="text-muted-foreground">Active scene</dt>
                <dd data-preview-runtime-parity-active-scene-id="">{seekSnapshot.sceneId ?? "none"}</dd>
                <dt className="text-muted-foreground">Scene-local time</dt>
                <dd data-preview-runtime-parity-scene-elapsed-ms="">{Math.round(sceneElapsedMs)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Playback authority</dt>
                <dd data-preview-runtime-parity-playback-authority="">{presentation.playbackAuthority}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Playback media</dt>
                <dd data-preview-runtime-parity-playback-media-id="">
                  {seekSnapshot.brandSting.active || seekSnapshot.terminalHidden
                    ? "none"
                    : (seekSnapshot.activeMediaId ??
                      presentation.playbackMedia.mediaItemId ??
                      "none")}
                </dd>
                <dd data-preview-runtime-parity-outgoing-media-id="">
                  {seekSnapshot.outgoingMediaId ?? "none"}
                </dd>
                <dd data-preview-runtime-parity-transition-state="">
                  {JSON.stringify(seekSnapshot.transition)}
                </dd>
                <dd data-preview-runtime-parity-caption-state="">
                  {JSON.stringify(seekSnapshot.caption)}
                </dd>
                <dd data-preview-runtime-parity-cta-state="">
                  {JSON.stringify(seekSnapshot.cta)}
                </dd>
                <dd data-preview-runtime-parity-brand-sting-state="">
                  {JSON.stringify(seekSnapshot.brandSting)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inspection media</dt>
                <dd data-preview-runtime-parity-inspection-media-id="">{presentation.inspectionMedia.mediaItemId ?? "none"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inspection active</dt>
                <dd data-preview-runtime-parity-inspection-active="">{inspection.active ? "true" : "false"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mounted plan IDs</dt>
                <dd data-preview-runtime-parity-mounted-ids="">{mountedPlan.mediaItemIds.join(",") || "none"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mounted plan types</dt>
                <dd data-preview-runtime-parity-mounted-types="">
                  {mountedPlan.layers.map((layer) => layer.identity.mediaType).join(",") || "none"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Local video blobs</dt>
                <dd data-preview-runtime-parity-video-blobs="">{videoBlobsReady ? "ready" : "svg-fallback"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Caption bounds</dt>
                <dd data-preview-runtime-parity-caption-bounds="">{captionBoundsJson}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">CTA inner-screen bounds</dt>
                <dd data-preview-runtime-parity-cta-measurements="">{ctaBoundsJson}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">CTA expected inner width</dt>
                <dd data-preview-runtime-parity-cta-inner-width="">
                  {certificationCaptureMode
                    ? PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX
                    : resolvePreviewInnerScreenWidthPx(previewWidthPx)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">CTA canvas plan</dt>
                <dd data-preview-runtime-parity-cta-canvas-plan-json="">{ctaCanvasPlanJson}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Frozen cert loaded</dt>
                <dd data-preview-runtime-parity-frozen-cert-loaded="">
                  {frozenCertLoaded ? "true" : "false"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Browser export</dt>
                <dd data-preview-runtime-parity-export-status="">{exportStatus}</dd>
                <dt>Brand sting</dt>
                <dd data-preview-runtime-parity-brand-sting-active="">
                  {brandStingActive ? "true" : "false"}
                </dd>
                <dt>Terminal hidden</dt>
                <dd data-preview-runtime-parity-terminal-hidden-state="">
                  {terminalHidden ? "true" : "false"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Story title</dt>
                <dd data-preview-runtime-parity-story-title="">{script.title}</dd>
              </div>
            </dl>
            <ul className="mt-2 space-y-1" data-preview-runtime-parity-windows="">
              {windows.map((window) => (
                <li key={window.itemId}>
                  {window.itemId} · {window.media.type} · {window.startMs}-{window.endMs}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-semibold">Media</h2>
            <div className="mt-2 space-y-2">
              {windows.map((window, index) => (
                <div key={window.itemId} className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    data-preview-runtime-parity-select={window.itemId}
                    onClick={() => setSelectedMediaItemId(window.itemId)}
                  >
                    Select {index + 1}
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    data-preview-runtime-parity-remove={window.itemId}
                    onClick={() => handleRemove(window.itemId)}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    data-preview-runtime-parity-move-left={window.itemId}
                    onClick={() => updateCurrentScene(moveSceneMediaItemLeft(scene, window.itemId).scene)}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    data-preview-runtime-parity-move-right={window.itemId}
                    onClick={() => updateCurrentScene(moveSceneMediaItemRight(scene, window.itemId).scene)}
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    data-preview-runtime-parity-replace={window.itemId}
                    onClick={() => {
                      const replacementUrl = "/preview-runtime-parity/image-q.svg";
                      const result = updateSceneMediaItemMedia(scene, window.itemId, {
                        type: "image",
                        url: replacementUrl,
                        source: "upload",
                        fitMode: "cover",
                        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
                      });
                      updateCurrentScene(result.scene);
                    }}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    data-preview-runtime-parity-inspect-zoom={window.itemId}
                    onClick={() => {
                      const result = updateSceneMediaItemMedia(scene, window.itemId, {
                        ...window.media,
                        transform: {
                          x: window.media.transform?.x ?? 0,
                          y: window.media.transform?.y ?? 0,
                          scale: 1.4,
                          rotation: window.media.transform?.rotation ?? 0,
                        },
                      });
                      updateCurrentScene(result.scene);
                    }}
                  >
                    Zoom
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    data-preview-runtime-parity-inspect-trim={window.itemId}
                    onClick={() => {
                      if (window.media.type !== "video") return;
                      const result = updateSceneMediaItemMedia(scene, window.itemId, {
                        ...window.media,
                        trimStartMs: 400,
                        trimEndMs: window.media.trimEndMs ?? 6_000,
                      });
                      updateCurrentScene(result.scene);
                    }}
                  >
                    Trim
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    data-preview-runtime-parity-inspect-motion={window.itemId}
                    onClick={() => {
                      const result = updateSceneMediaItemMedia(scene, window.itemId, {
                        ...window.media,
                        motion: {
                          version: 1,
                          enabled: true,
                          presetId: "zoom-in",
                          intensity: 1,
                        },
                      });
                      updateCurrentScene(result.scene);
                    }}
                  >
                    Motion
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rounded border px-2 py-1"
                data-preview-runtime-parity-select-transition=""
                onClick={() => setSelectedMediaItemId(null)}
              >
                Select transition
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1"
                data-preview-runtime-parity-add-image=""
                onClick={() => {
                  const result = appendSceneMediaImageItem(scene, {
                    type: "image",
                    url: "/preview-runtime-parity/image-q.svg",
                    source: "upload",
                    fitMode: "cover",
                    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
                  });
                  updateCurrentScene(result.scene);
                }}
              >
                Add image
              </button>
            </div>
          </section>

          <section>
            <h2 className="font-semibold">Captions</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                data-preview-runtime-parity-caption-anchor=""
                value={scene.captionLayout?.anchor ?? "bottom_center"}
                onChange={(event) =>
                  updateCurrentScene({
                    ...scene,
                    captionLayout: {
                      ...scene.captionLayout,
                      version: 2,
                      anchor: event.target.value as CaptionAnchor,
                    },
                  })
                }
              >
                {CAPTION_ANCHORS.map((anchor) => (
                  <option key={anchor} value={anchor}>
                    {anchor}
                  </option>
                ))}
              </select>
              <select
                data-preview-runtime-parity-caption-align=""
                value={scene.captionLayout?.textAlign ?? "center"}
                onChange={(event) =>
                  updateCurrentScene({
                    ...scene,
                    captionLayout: {
                      ...scene.captionLayout,
                      version: 2,
                      textAlign: event.target.value as CaptionTextAlign,
                    },
                  })
                }
              >
                {PREVIEW_RUNTIME_PARITY_CAPTION_ALIGNS.map((align) => (
                  <option key={align} value={align}>
                    {align}
                  </option>
                ))}
              </select>
              <select
                data-preview-runtime-parity-caption-effect=""
                value={scene.captionAnimation?.preset ?? "none"}
                onChange={(event) =>
                  updateCurrentScene({
                    ...scene,
                    captionAnimation: {
                      ...scene.captionAnimation,
                      preset: event.target.value as CaptionAnimationPreset,
                    },
                  })
                }
              >
                {PREVIEW_RUNTIME_PARITY_CAPTION_EFFECTS.map((effect) => (
                  <option key={effect} value={effect}>
                    {effect}
                  </option>
                ))}
              </select>
              <select
                data-preview-runtime-parity-caption-preset=""
                value={scene.captionPreset ?? "minimal"}
                onChange={(event) =>
                  updateCurrentScene({
                    ...scene,
                    captionPreset: event.target.value as CaptionPresetId,
                  })
                }
              >
                {CAPTION_PRESET_IDS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded border px-2 py-1"
                data-preview-runtime-parity-caption-legacy=""
                onClick={() =>
                  updateCurrentScene({
                    ...scene,
                    captionLayout: undefined,
                  })
                }
              >
                Legacy layout
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1"
                data-preview-runtime-parity-caption-mode="generated"
                onClick={() =>
                  updateCurrentScene({
                    ...scene,
                    captionMode: "generated",
                  })
                }
              >
                Generated caption
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1"
                data-preview-runtime-parity-caption-mode="subtitles"
                onClick={() =>
                  updateCurrentScene({
                    ...scene,
                    captionMode: "subtitles",
                  })
                }
              >
                Narration subtitle
              </button>
            </div>
          </section>

          <section data-preview-runtime-parity-cta-cert="">
            <h2 className="font-semibold">CTA certification</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                data-preview-runtime-parity-cta-kind=""
                value={overlay?.kind ?? "combined"}
                onChange={(event) => {
                  const result = setEngagementOverlayKind(
                    script,
                    scene.id,
                    event.target.value as EngagementOverlayKind,
                    { engagementOverlaysEnabled: true },
                  );
                  setScript(result.script);
                }}
              >
                {PREVIEW_RUNTIME_PARITY_CTA_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              <select
                data-preview-runtime-parity-cta-size=""
                value={overlay?.size ?? "medium"}
                onChange={(event) => {
                  const result = setEngagementOverlaySize(
                    script,
                    scene.id,
                    event.target.value as EngagementOverlaySize,
                    { engagementOverlaysEnabled: true },
                  );
                  setScript(result.script);
                }}
              >
                {PREVIEW_RUNTIME_PARITY_CTA_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <select
                data-preview-runtime-parity-cta-position=""
                value={overlay?.position ?? "top-right"}
                onChange={(event) => {
                  const result = setEngagementOverlayPosition(
                    script,
                    scene.id,
                    event.target.value as EngagementOverlayPosition,
                    { engagementOverlaysEnabled: true },
                  );
                  setScript(result.script);
                }}
              >
                {CTA_POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
              <input
                type="range"
                min={ENGAGEMENT_OVERLAY_MIN_SCALE}
                max={ENGAGEMENT_OVERLAY_MAX_SCALE}
                step={0.01}
                value={overlay?.scale ?? 1}
                data-preview-runtime-parity-cta-scale=""
                onChange={(event) => {
                  const result = setEngagementOverlayScale(
                    script,
                    scene.id,
                    Number(event.target.value),
                    { engagementOverlaysEnabled: true },
                  );
                  setScript(result.script);
                }}
              />
              <select
                data-preview-runtime-parity-cta-checkpoint=""
                value={ctaCheckpoint}
                onChange={(event) =>
                  seekCtaCheckpoint(event.target.value as CtaCheckpoint)
                }
              >
                {CTA_CHECKPOINTS.map((checkpoint) => (
                  <option key={checkpoint} value={checkpoint}>
                    {checkpoint}
                  </option>
                ))}
              </select>
              <select
                data-preview-runtime-parity-cta-collision=""
                value={ctaCollisionCase}
                onChange={(event) => {
                  const next = event.target.value as CtaCollisionCase;
                  setCtaCollisionCase(next);
                  if (next === "none") return;
                  const anchor =
                    next === "top"
                      ? "top_center"
                      : next === "center"
                        ? "center"
                        : "bottom_center";
                  const withCaption = replaceScene(script, scene.id, {
                    ...scene,
                    captionLayout: {
                      ...scene.captionLayout,
                      version: 2,
                      anchor,
                    },
                  });
                  if (next === "collide" || next === "relocated") {
                    const result = setEngagementOverlayPosition(
                      withCaption,
                      scene.id,
                      "bottom-center",
                      { engagementOverlaysEnabled: true },
                    );
                    setScript(result.script);
                    return;
                  }
                  setScript(withCaption);
                }}
              >
                <option value="none">no caption</option>
                <option value="top">top caption</option>
                <option value="center">center caption</option>
                <option value="bottom">bottom caption</option>
                <option value="collide">requested collides</option>
                <option value="relocated">relocated safe slot</option>
              </select>
            </div>
            <p
              className="mt-2 font-mono text-[11px] text-muted-foreground"
              data-preview-runtime-parity-cta-tolerance=""
            >
              {JSON.stringify(PREVIEW_RUNTIME_PARITY_CTA_TOLERANCE)}
            </p>
          </section>

          <section data-preview-runtime-parity-cta-compare="">
            <h2 className="font-semibold">CTA normalized compare</h2>
            <p
              className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
              data-preview-runtime-parity-cta-compare-json=""
            >
              {(() => {
                try {
                  const preview = JSON.parse(ctaBoundsJson) as {
                    innerWidth?: number;
                    outputOuter?: { x: number; y: number; width: number; height: number } | null;
                    icons?: { width: number; height: number }[];
                    computedFontSizePx?: number | null;
                    usedInnerScreen?: boolean;
                    labelTexts?: string[];
                  };
                  const canvas = JSON.parse(ctaCanvasPlanJson) as {
                    layout?: { x: number; y: number; width: number; height: number };
                    fontSize?: number;
                    iconSize?: number;
                    labels?: string[];
                    pixelBounds?: { x: number; y: number; width: number; height: number } | null;
                  };
                  const outerDelta = preview.outputOuter && canvas.layout
                    ? {
                        x: Math.abs(preview.outputOuter.x - canvas.layout.x),
                        y: Math.abs(preview.outputOuter.y - canvas.layout.y),
                        width: Math.abs(preview.outputOuter.width - canvas.layout.width),
                        height: Math.abs(preview.outputOuter.height - canvas.layout.height),
                      }
                    : null;
                  const visualIconOutput = preview.icons?.[0] && preview.innerWidth
                    ? (preview.icons[0].height / preview.innerWidth) * 1080
                    : null;
                  return JSON.stringify({
                    usedInnerScreen: preview.usedInnerScreen === true,
                    outerDelta,
                    visualIconOutput,
                    planIconSize: canvas.iconSize ?? null,
                    computedFontSizePx: preview.computedFontSizePx ?? null,
                    planFontSize: canvas.fontSize ?? null,
                    previewLabels: preview.labelTexts ?? [],
                    canvasLabels: canvas.labels ?? [],
                    pixelBounds: canvas.pixelBounds ?? null,
                    withinOuterTolerance:
                      outerDelta != null &&
                      Math.max(outerDelta.x, outerDelta.y, outerDelta.width, outerDelta.height) <=
                        PREVIEW_RUNTIME_PARITY_CTA_TOLERANCE.outerBoundsPx,
                  });
                } catch {
                  return "none";
                }
              })()}
            </p>
          </section>

          <section data-preview-runtime-parity-automatic-checks="">
            <h2 className="font-semibold">Automatic checks</h2>
            <p className="mt-1 text-muted-foreground">
              Structural only. These never claim visual Pass.
            </p>
            <ul className="mt-2 list-disc pl-5">
              <li data-preview-runtime-parity-check="corpus">
                Corpus cases modeled: {PREVIEW_RUNTIME_PARITY_CORPUS.length}
              </li>
              <li data-preview-runtime-parity-check="selection-gap">
                Idle selection vs playback:{" "}
                {presentation.inspectionMedia.mediaItemId &&
                presentation.inspectionMedia.mediaItemId !==
                  presentation.playbackMedia.mediaItemId
                  ? "inspection differs from playback media"
                  : "no independent inspection layer in production Preview"}
              </li>
              <li data-preview-runtime-parity-check="removed">
                Removed IDs recorded: {removedIds.join(",") || "none"}
              </li>
            </ul>
          </section>

          <section data-preview-runtime-parity-visual-checks="">
            <h2 className="font-semibold">Visual operator checks</h2>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
              <li>Removed visible video disappears immediately.</li>
              <li>Idle select of item 2 or 3 shows that item only after Prompt 3.</li>
              <li>Centered captions do not walk left during playback.</li>
              <li>CTA normalized size matches Browser/Headless, not CSS pixels.</li>
              <li>Prompt 5 CTA visual Pass is operator/browser-cert only.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
