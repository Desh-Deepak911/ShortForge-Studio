"use client";

import { useEffect, useState } from "react";

import type { CaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import {
  applyPreviewCaptionLineClassName,
  applyPreviewCaptionStyleClassName,
  resolvePreviewCaptionStyle,
  resolvePreviewNewsMotionStyle,
  resolvePreviewSportsMotionStyle,
  resolvePreviewTikTokMotionStyle,
  resolveNewsMotionOverlay,
  resolveNewsMotionVisualState,
  resolveSportsMotionOverlay,
  resolveSportsMotionVisualState,
  resolveTikTokMotionOverlay,
  resolveTikTokMotionVisualState,
} from "@/features/caption-engine";
import { normalizeCaptionMode, normalizeSubtitleEffect } from "@/features/story/utils";
import {
  getDisplayCaptionLines,
  SUBTITLE_MAX_VISIBLE_LINES,
  resolveSubtitleDisplayLayout,
  type DisplayCaptionScene,
} from "@/features/story/utils";
import { resolveExportCaptionHighlightFrame } from "@/features/caption-animation";
import type { SubtitleEffect } from "@/features/story/types";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

function CaptionLines({
  lines,
  className,
  lineClassName,
}: {
  lines: string[];
  className: string;
  lineClassName?: string;
}) {
  return (
    <div className={className}>
      {lines.map((line, index) => (
        <p key={index} className={index > 0 ? `mt-0.5 ${lineClassName ?? ""}` : lineClassName}>
          {line}
        </p>
      ))}
    </div>
  );
}

function TimelineFadeUpSubtitleCaption({
  lines,
  className,
  animationState,
  lineClassName,
}: {
  lines: string[];
  className: string;
  animationState: CaptionAnimationState;
  lineClassName?: string;
}) {
  return (
    <div
      className={className}
      style={{
        opacity: animationState.opacity,
        transform: animationState.transform,
      }}
    >
      {lines.map((line, index) => (
        <p key={index} className={index > 0 ? `mt-0.5 ${lineClassName ?? ""}` : lineClassName}>
          {line}
        </p>
      ))}
    </div>
  );
}

function TimelineTypewriterSubtitleCaption({
  text,
  className,
  animationState,
  motionClassName,
  motionTransform,
}: {
  text: string;
  className: string;
  animationState: CaptionAnimationState;
  motionClassName?: string;
  motionTransform?: string;
}) {
  const revealed = animationState.visibleText;
  const showCaret =
    !animationState.shouldRenderFullText &&
    revealed.length > 0 &&
    revealed.length < text.length;
  const rootClassName = `${className} subtitle-effect-typewriter${motionClassName ? ` ${motionClassName}` : ""}`.trim();

  return (
    <div
      className={rootClassName}
      style={
        motionTransform && motionTransform !== "none"
          ? { transform: motionTransform, transformOrigin: "center center" }
          : undefined
      }
    >
      <p className={showCaret ? "subtitle-effect-typewriter-caret" : undefined}>{revealed}</p>
    </div>
  );
}

function TimelineHighlightSubtitleCaption({
  lines,
  className,
  animationState,
  subtitleAvailableDurationMs,
  motionClassName,
  motionTransform,
  textGlowClassName,
}: {
  lines: string[];
  className: string;
  animationState: CaptionAnimationState;
  subtitleAvailableDurationMs: number;
  motionClassName?: string;
  motionTransform?: string;
  textGlowClassName?: string;
}) {
  const highlight = resolveExportCaptionHighlightFrame(
    animationState.localElapsedMs,
    Math.max(1, subtitleAvailableDurationMs),
  );
  const rootClassName =
    `${className} subtitle-effect-highlight${motionClassName ? ` ${motionClassName}` : ""}`.trim();

  return (
    <div
      className={rootClassName}
      style={
        motionTransform && motionTransform !== "none"
          ? { transform: motionTransform, transformOrigin: "center center" }
          : undefined
      }
    >
      {lines.map((line, index) => (
        <p key={index} className={`flex justify-center ${index > 0 ? "mt-1.5" : ""}`}>
          <span className="subtitle-effect-highlight-line">
            <span
              className="subtitle-effect-highlight-bar"
              aria-hidden
              style={{
                opacity: 0.55 + highlight.barScale * 0.45,
                transform: `scaleY(${highlight.barScale})`,
              }}
            />
            <span
              className={`subtitle-effect-highlight-text relative inline-block${textGlowClassName ? ` ${textGlowClassName}` : ""}`.trim()}
              style={{
                backgroundColor: `rgba(255, 255, 255, ${highlight.backgroundAlpha})`,
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 rounded-[0.35rem] bg-white/10"
                style={{ width: `${highlight.highlightWidthProgress * 100}%` }}
              />
              <span className="relative px-[0.42em] py-[0.14em]">{line}</span>
            </span>
          </span>
        </p>
      ))}
    </div>
  );
}

function StaticFadeUpSubtitleCaption({
  lines,
  className,
  lineClassName,
}: {
  lines: string[];
  className: string;
  lineClassName?: string;
}) {
  return (
    <div className={className}>
      {lines.map((line, index) => (
        <p key={index} className={index > 0 ? `mt-0.5 ${lineClassName ?? ""}` : lineClassName}>
          {line}
        </p>
      ))}
    </div>
  );
}

function StaticHighlightSubtitleCaption({
  lines,
  className,
}: {
  lines: string[];
  className: string;
}) {
  return (
    <div className={`${className} subtitle-effect-highlight`}>
      {lines.map((line, index) => (
        <p key={index} className={`flex justify-center ${index > 0 ? "mt-1.5" : ""}`}>
          <span className="subtitle-effect-highlight-line">
            <span className="subtitle-effect-highlight-bar" aria-hidden />
            <span className="subtitle-effect-highlight-text">{line}</span>
          </span>
        </p>
      ))}
    </div>
  );
}

function SubtitleEffectCaption({
  scene,
  activeChunk,
  lines,
  className,
  animationState,
  subtitleAvailableDurationMs,
  captionTooShortForEffect,
}: {
  scene: DisplayCaptionScene & { id?: string };
  activeChunk: string;
  lines: string[];
  className: string;
  animationState?: CaptionAnimationState;
  subtitleAvailableDurationMs?: number;
  captionTooShortForEffect?: boolean;
}) {
  const effect: SubtitleEffect = normalizeSubtitleEffect(scene.subtitleEffect);
  const previewStyle = resolvePreviewCaptionStyle(scene);
  const tiktokOverlay = resolveTikTokMotionOverlay({
    ...scene,
    captionTooShortForEffect,
  });
  const tiktokMotionStyle = resolvePreviewTikTokMotionStyle({
    ...scene,
    captionTooShortForEffect,
  });
  const tiktokMotionVisual = resolveTikTokMotionVisualState(tiktokOverlay, animationState);
  const sportsOverlay = resolveSportsMotionOverlay({
    ...scene,
    captionTooShortForEffect,
    subtitleAvailableDurationMs,
  });
  const sportsMotionStyle = resolvePreviewSportsMotionStyle({
    ...scene,
    captionTooShortForEffect,
    subtitleAvailableDurationMs,
  });
  const sportsMotionVisual = resolveSportsMotionVisualState(sportsOverlay, animationState);
  const newsOverlay = resolveNewsMotionOverlay({
    ...scene,
    captionTooShortForEffect,
    subtitleAvailableDurationMs,
  });
  const newsMotionStyle = resolvePreviewNewsMotionStyle({
    ...scene,
    captionTooShortForEffect,
    subtitleAvailableDurationMs,
  });
  const newsMotionVisual = resolveNewsMotionVisualState(newsOverlay, animationState);
  const highlightMotionClassName = [
    sportsMotionStyle.containerClassName,
    newsMotionStyle.containerClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const highlightMotionTransform =
    sportsMotionVisual.transform !== "none"
      ? sportsMotionVisual.transform
      : newsMotionVisual.transform;
  const highlightTextAccentClassName =
    sportsMotionStyle.textGlowClassName || newsMotionStyle.textAccentClassName;
  const fadeUpClassName =
    effect === "fade-up" && previewStyle.usesFadeSafeStyleOverlay
      ? applyPreviewCaptionStyleClassName(className, previewStyle)
      : className;
  const fadeUpLineClassName =
    effect === "fade-up" && previewStyle.usesFadeSafeStyleOverlay
      ? applyPreviewCaptionLineClassName(undefined, previewStyle)
      : undefined;
  const displayText = activeChunk || lines.join(" ").trim();
  const reducedMotion = usePrefersReducedMotion();

  if (animationState && !reducedMotion) {
    switch (effect) {
      case "typewriter":
        return (
          <TimelineTypewriterSubtitleCaption
            text={displayText}
            className={className}
            animationState={animationState}
            motionClassName={tiktokMotionStyle.containerClassName}
            motionTransform={tiktokMotionVisual.transform}
          />
        );
      case "highlight":
        return (
          <TimelineHighlightSubtitleCaption
            lines={lines}
            className={className}
            animationState={animationState}
            subtitleAvailableDurationMs={subtitleAvailableDurationMs ?? 1}
            motionClassName={highlightMotionClassName}
            motionTransform={highlightMotionTransform}
            textGlowClassName={highlightTextAccentClassName}
          />
        );
      case "fade-up":
      default:
        return (
          <TimelineFadeUpSubtitleCaption
            lines={lines}
            className={fadeUpClassName}
            animationState={animationState}
            lineClassName={fadeUpLineClassName}
          />
        );
    }
  }

  switch (effect) {
    case "typewriter":
      return (
        <div className={`${className} subtitle-effect-typewriter`}>
          <p>{displayText}</p>
        </div>
      );
    case "highlight":
      return <StaticHighlightSubtitleCaption lines={lines} className={className} />;
    case "fade-up":
    default:
      return (
        <StaticFadeUpSubtitleCaption
          lines={lines}
          className={fadeUpClassName}
          lineClassName={fadeUpLineClassName}
        />
      );
  }
}

export interface RenderSceneCaptionOptions {
  /** Caps visible lines (used for preview narration subtitles). */
  maxLines?: number;
  /** Active subtitle chunk (subtitles mode). */
  activeSubtitleChunk?: string;
  /** Timeline-driven caption animation state (preview/export). */
  captionAnimationState?: CaptionAnimationState;
  /** Subtitle window duration for highlight pacing. */
  subtitleAvailableDurationMs?: number;
  /** When true, motion presets degrade to legacy typewriter styling. */
  captionTooShortForEffect?: boolean;
}

export function renderSceneCaptionContent(
  scene: DisplayCaptionScene & { id?: string },
  className: string,
  animationSeed = "",
  options: RenderSceneCaptionOptions = {},
) {
  void animationSeed;
  const isSubtitlesMode = normalizeCaptionMode(scene.captionMode) === "subtitles";
  const activeChunk =
    isSubtitlesMode && options.activeSubtitleChunk !== undefined
      ? options.activeSubtitleChunk
      : isSubtitlesMode
        ? getDisplayCaptionLines(scene).join(" ").trim()
        : "";

  const lineCap = options.maxLines ?? SUBTITLE_MAX_VISIBLE_LINES;
  const layoutSource =
    options.captionAnimationState &&
    normalizeSubtitleEffect(scene.subtitleEffect) === "typewriter" &&
    options.captionAnimationState.visibleText.trim()
      ? options.captionAnimationState.visibleText
      : activeChunk;
  const subtitleLayout =
    isSubtitlesMode && layoutSource
      ? resolveSubtitleDisplayLayout(layoutSource, { maxLines: lineCap })
      : null;
  const allLines =
    subtitleLayout?.lines.length
      ? subtitleLayout.lines
      : isSubtitlesMode && layoutSource
        ? [layoutSource]
        : getDisplayCaptionLines(scene);
  const lines = allLines;
  const fontScale = subtitleLayout?.fontScale ?? 1;

  if (lines.length === 0) {
    return null;
  }

  if (!isSubtitlesMode) {
    return <CaptionLines lines={lines} className={className} />;
  }

  const caption = (
    <SubtitleEffectCaption
      scene={scene}
      activeChunk={activeChunk}
      lines={lines}
      className={className}
      animationState={options.captionAnimationState}
      subtitleAvailableDurationMs={options.subtitleAvailableDurationMs}
      captionTooShortForEffect={options.captionTooShortForEffect}
    />
  );

  if (fontScale >= 1) {
    return caption;
  }

  return (
    <div style={{ fontSize: `${Math.round(fontScale * 100)}%` }}>{caption}</div>
  );
}
