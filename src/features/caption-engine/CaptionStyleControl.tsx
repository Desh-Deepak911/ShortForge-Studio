"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import {
  buildSceneCaptionStylePatch,
  CAPTION_STYLE_CORNER_RADIUS_MAX,
  CAPTION_STYLE_CORNER_RADIUS_MIN,
  CAPTION_STYLE_FONT_FAMILY_OPTIONS,
  CAPTION_STYLE_FONT_SIZE_MAX,
  CAPTION_STYLE_FONT_SIZE_MIN,
  CAPTION_STYLE_FONT_WEIGHT_OPTIONS,
  CAPTION_STYLE_LETTER_SPACING_MAX,
  CAPTION_STYLE_LETTER_SPACING_MIN,
  CAPTION_STYLE_LINE_HEIGHT_MAX,
  CAPTION_STYLE_LINE_HEIGHT_MIN,
  CAPTION_STYLE_MAX_LINES_MAX,
  CAPTION_STYLE_MAX_LINES_MIN,
  CAPTION_STYLE_PADDING_MAX,
  CAPTION_STYLE_PADDING_MIN,
  CAPTION_STYLE_TEXT_TRANSFORM_OPTIONS,
  CAPTION_STYLE_VERSION,
  CAPTION_STYLE_SHADOW_OFFSET_MIN,
  CAPTION_STYLE_SHADOW_OFFSET_MAX,
  CAPTION_STYLE_GLOW_BLUR_MIN,
  CAPTION_STYLE_GLOW_BLUR_MAX,
  CAPTION_STYLE_OUTLINE_WIDTH_MIN,
  CAPTION_STYLE_OUTLINE_WIDTH_MAX,
  CAPTION_STYLE_SHADOW_BLUR_MIN,
  CAPTION_STYLE_SHADOW_BLUR_MAX,
  clampCaptionStyleBackgroundOpacity,
  clampCaptionStyleCornerRadius,
  clampCaptionStyleFontSize,
  clampCaptionStyleFontWeight,
  clampCaptionStyleGlowBlur,
  clampCaptionStyleLetterSpacing,
  clampCaptionStyleLineHeight,
  clampCaptionStyleMaxLines,
  clampCaptionStyleOutlineWidth,
  clampCaptionStylePadding,
  clampCaptionStyleShadowBlur,
  clampCaptionStyleShadowOffset,
  DEFAULT_CAPTION_STYLE,
  mergeCaptionStyleSettings,
  normalizeCaptionStyleBackgroundColor,
  normalizeCaptionStyleEffectColor,
  normalizeCaptionStyleFontFamily,
  normalizeCaptionStyleTextColor,
  type CaptionOverflowBehavior,
  type CaptionStyle,
  type CaptionTextTransform,
} from "@/features/caption-style";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  studioFieldLabel,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const OVERFLOW_OPTIONS: { value: CaptionOverflowBehavior; label: string }[] = [
  { value: "wrap", label: "Wrap" },
  { value: "ellipsis", label: "Ellipsis" },
  { value: "clip", label: "Clip" },
];

export interface CaptionStyleControlProps {
  scene: FootieScene;
  script: FootieScript;
  onSceneStyleChange: (patch: Partial<FootieScene>) => void;
}

function StyleSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <p className="text-[11px] font-semibold tracking-tight text-foreground/80">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function mergeStyle(
  scene: FootieScene,
  script: FootieScript,
  patch: Partial<CaptionStyle>,
): CaptionStyle {
  return {
    ...mergeCaptionStyleSettings(scene.captionStyle, script.defaultCaptionStyle),
    ...patch,
    version: CAPTION_STYLE_VERSION,
  };
}

export default function CaptionStyleControl({
  scene,
  script,
  onSceneStyleChange,
}: CaptionStyleControlProps) {
  const effective = mergeCaptionStyleSettings(scene.captionStyle, script.defaultCaptionStyle);
  const backgroundEnabled = effective.backgroundEnabled !== false;
  const backgroundColor = effective.backgroundColor ?? "#000000";
  const backgroundOpacity = effective.backgroundOpacity ?? 45;
  const paddingX = effective.paddingX ?? 18;
  const paddingY = effective.paddingY ?? 10;
  const cornerRadius = effective.cornerRadius ?? 12;
  const maxLines = effective.maxLines ?? 3;
  const overflowBehavior = effective.overflowBehavior ?? "wrap";
  const fontFamily = effective.fontFamily ?? DEFAULT_CAPTION_STYLE.fontFamily!;
  const fontWeight = effective.fontWeight ?? DEFAULT_CAPTION_STYLE.fontWeight!;
  const fontSize = effective.fontSize ?? DEFAULT_CAPTION_STYLE.fontSize!;
  const textColor = effective.textColor ?? DEFAULT_CAPTION_STYLE.textColor!;
  const letterSpacing = effective.letterSpacing ?? 0;
  const lineHeight = effective.lineHeight ?? DEFAULT_CAPTION_STYLE.lineHeight!;
  const textTransform = effective.textTransform ?? "none";
  const outlineEnabled = effective.outlineEnabled === true;
  const outlineColor = effective.outlineColor ?? DEFAULT_CAPTION_STYLE.outlineColor!;
  const outlineWidth = effective.outlineWidth ?? DEFAULT_CAPTION_STYLE.outlineWidth!;
  const shadowEnabled = effective.shadowEnabled === true;
  const shadowColor = effective.shadowColor ?? DEFAULT_CAPTION_STYLE.shadowColor!;
  const shadowBlur = effective.shadowBlur ?? DEFAULT_CAPTION_STYLE.shadowBlur!;
  const shadowOffsetX = effective.shadowOffsetX ?? DEFAULT_CAPTION_STYLE.shadowOffsetX!;
  const shadowOffsetY = effective.shadowOffsetY ?? DEFAULT_CAPTION_STYLE.shadowOffsetY!;
  const glowEnabled = effective.glowEnabled === true;
  const glowColor = effective.glowColor ?? DEFAULT_CAPTION_STYLE.glowColor!;
  const glowBlur = effective.glowBlur ?? DEFAULT_CAPTION_STYLE.glowBlur!;

  const applySceneStyle = (patch: Partial<CaptionStyle>) => {
    onSceneStyleChange(buildSceneCaptionStylePatch(mergeStyle(scene, script, patch)));
  };

  return (
    <div className="space-y-4">
      <StyleSubsection title="Typography">
        <div>
          <label htmlFor={`caption-style-font-family-${scene.id}`} className={studioFieldLabel}>
            Font family
          </label>
          <div className="relative mt-1.5">
            <select
              id={`caption-style-font-family-${scene.id}`}
              className={`${studioSelectCompact} w-full appearance-none pr-8`}
              value={fontFamily}
              onChange={(event) =>
                applySceneStyle({
                  fontFamily: normalizeCaptionStyleFontFamily(
                    event.target.value,
                    fontFamily,
                  ),
                })
              }
            >
              {!CAPTION_STYLE_FONT_FAMILY_OPTIONS.some((option) => option.value === fontFamily) ? (
                <option value={fontFamily}>{fontFamily.split(",")[0]?.trim() ?? fontFamily}</option>
              ) : null}
              {CAPTION_STYLE_FONT_FAMILY_OPTIONS.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevronCompact} aria-hidden />
          </div>
        </div>

        <div>
          <p className={studioFieldLabel}>Font weight</p>
          <div
            className={`${studioSegmentedControl} mt-1.5 grid grid-cols-3 gap-1`}
            role="radiogroup"
            aria-label="Caption font weight"
          >
            {CAPTION_STYLE_FONT_WEIGHT_OPTIONS.map((option) => {
              const isActive = fontWeight === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={isActive ? studioSegmentActive : studioSegment}
                  onClick={() =>
                    applySceneStyle({
                      fontWeight: clampCaptionStyleFontWeight(option.value, fontWeight),
                    })
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor={`caption-style-font-size-${scene.id}`} className={studioFieldLabel}>
            Font size
          </label>
          <input
            id={`caption-style-font-size-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_FONT_SIZE_MIN}
            max={CAPTION_STYLE_FONT_SIZE_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={fontSize}
            onChange={(event) =>
              applySceneStyle({
                fontSize: clampCaptionStyleFontSize(Number(event.target.value), fontSize),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{fontSize}px</p>
        </div>

        <div>
          <label htmlFor={`caption-style-letter-spacing-${scene.id}`} className={studioFieldLabel}>
            Letter spacing
          </label>
          <input
            id={`caption-style-letter-spacing-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_LETTER_SPACING_MIN}
            max={CAPTION_STYLE_LETTER_SPACING_MAX}
            step={0.01}
            className="mt-2 w-full accent-primary"
            value={letterSpacing}
            onChange={(event) =>
              applySceneStyle({
                letterSpacing: clampCaptionStyleLetterSpacing(
                  Number(event.target.value),
                  letterSpacing,
                ),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{letterSpacing.toFixed(2)}em</p>
        </div>

        <div>
          <label htmlFor={`caption-style-line-height-${scene.id}`} className={studioFieldLabel}>
            Line height
          </label>
          <input
            id={`caption-style-line-height-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_LINE_HEIGHT_MIN}
            max={CAPTION_STYLE_LINE_HEIGHT_MAX}
            step={0.05}
            className="mt-2 w-full accent-primary"
            value={lineHeight}
            onChange={(event) =>
              applySceneStyle({
                lineHeight: clampCaptionStyleLineHeight(Number(event.target.value), lineHeight),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{lineHeight.toFixed(2)}</p>
        </div>

        <div>
          <label htmlFor={`caption-style-text-transform-${scene.id}`} className={studioFieldLabel}>
            Text transform
          </label>
          <div className="relative mt-1.5">
            <select
              id={`caption-style-text-transform-${scene.id}`}
              className={`${studioSelectCompact} w-full appearance-none pr-8`}
              value={textTransform}
              onChange={(event) =>
                applySceneStyle({
                  textTransform: event.target.value as CaptionTextTransform,
                })
              }
            >
              {CAPTION_STYLE_TEXT_TRANSFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevronCompact} aria-hidden />
          </div>
        </div>

        <div>
          <label htmlFor={`caption-style-text-color-${scene.id}`} className={studioFieldLabel}>
            Text color
          </label>
          <input
            id={`caption-style-text-color-${scene.id}`}
            type="color"
            className="mt-1.5 h-9 w-full cursor-pointer rounded-md border border-border bg-background"
            value={textColor}
            onChange={(event) =>
              applySceneStyle({
                textColor: normalizeCaptionStyleTextColor(event.target.value, textColor),
              })
            }
          />
        </div>
      </StyleSubsection>

      <StyleSubsection title="Outline">
        <label className="flex items-center gap-2 text-xs text-foreground/80">
          <input
            type="checkbox"
            checked={outlineEnabled}
            onChange={(event) => applySceneStyle({ outlineEnabled: event.target.checked })}
          />
          Enable outline
        </label>

        <div>
          <label htmlFor={`caption-style-outline-color-${scene.id}`} className={studioFieldLabel}>
            Outline color
          </label>
          <input
            id={`caption-style-outline-color-${scene.id}`}
            type="color"
            className="mt-1.5 h-9 w-full cursor-pointer rounded-md border border-border bg-background"
            value={outlineColor.startsWith("#") ? outlineColor : "#000000"}
            disabled={!outlineEnabled}
            onChange={(event) =>
              applySceneStyle({
                outlineColor: normalizeCaptionStyleEffectColor(event.target.value, outlineColor),
              })
            }
          />
        </div>

        <div>
          <label htmlFor={`caption-style-outline-width-${scene.id}`} className={studioFieldLabel}>
            Outline width
          </label>
          <input
            id={`caption-style-outline-width-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_OUTLINE_WIDTH_MIN}
            max={CAPTION_STYLE_OUTLINE_WIDTH_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={outlineWidth}
            disabled={!outlineEnabled}
            onChange={(event) =>
              applySceneStyle({
                outlineWidth: clampCaptionStyleOutlineWidth(Number(event.target.value), outlineWidth),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{outlineWidth}px</p>
        </div>
      </StyleSubsection>

      <StyleSubsection title="Shadow">
        <label className="flex items-center gap-2 text-xs text-foreground/80">
          <input
            type="checkbox"
            checked={shadowEnabled}
            onChange={(event) => applySceneStyle({ shadowEnabled: event.target.checked })}
          />
          Enable shadow
        </label>

        <div>
          <label htmlFor={`caption-style-shadow-color-${scene.id}`} className={studioFieldLabel}>
            Shadow color
          </label>
          <input
            id={`caption-style-shadow-color-${scene.id}`}
            type="color"
            className="mt-1.5 h-9 w-full cursor-pointer rounded-md border border-border bg-background"
            value={shadowColor.startsWith("#") ? shadowColor : "#000000"}
            disabled={!shadowEnabled}
            onChange={(event) =>
              applySceneStyle({
                shadowColor: normalizeCaptionStyleEffectColor(event.target.value, shadowColor),
              })
            }
          />
        </div>

        <div>
          <label htmlFor={`caption-style-shadow-blur-${scene.id}`} className={studioFieldLabel}>
            Blur
          </label>
          <input
            id={`caption-style-shadow-blur-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_SHADOW_BLUR_MIN}
            max={CAPTION_STYLE_SHADOW_BLUR_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={shadowBlur}
            disabled={!shadowEnabled}
            onChange={(event) =>
              applySceneStyle({
                shadowBlur: clampCaptionStyleShadowBlur(Number(event.target.value), shadowBlur),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{shadowBlur}px</p>
        </div>

        <div>
          <label htmlFor={`caption-style-shadow-offset-x-${scene.id}`} className={studioFieldLabel}>
            Offset X
          </label>
          <input
            id={`caption-style-shadow-offset-x-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_SHADOW_OFFSET_MIN}
            max={CAPTION_STYLE_SHADOW_OFFSET_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={shadowOffsetX}
            disabled={!shadowEnabled}
            onChange={(event) =>
              applySceneStyle({
                shadowOffsetX: clampCaptionStyleShadowOffset(
                  Number(event.target.value),
                  shadowOffsetX,
                ),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{shadowOffsetX}px</p>
        </div>

        <div>
          <label htmlFor={`caption-style-shadow-offset-y-${scene.id}`} className={studioFieldLabel}>
            Offset Y
          </label>
          <input
            id={`caption-style-shadow-offset-y-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_SHADOW_OFFSET_MIN}
            max={CAPTION_STYLE_SHADOW_OFFSET_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={shadowOffsetY}
            disabled={!shadowEnabled}
            onChange={(event) =>
              applySceneStyle({
                shadowOffsetY: clampCaptionStyleShadowOffset(
                  Number(event.target.value),
                  shadowOffsetY,
                ),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{shadowOffsetY}px</p>
        </div>
      </StyleSubsection>

      <StyleSubsection title="Glow">
        <label className="flex items-center gap-2 text-xs text-foreground/80">
          <input
            type="checkbox"
            checked={glowEnabled}
            onChange={(event) => applySceneStyle({ glowEnabled: event.target.checked })}
          />
          Enable glow
        </label>

        <div>
          <label htmlFor={`caption-style-glow-color-${scene.id}`} className={studioFieldLabel}>
            Glow color
          </label>
          <input
            id={`caption-style-glow-color-${scene.id}`}
            type="color"
            className="mt-1.5 h-9 w-full cursor-pointer rounded-md border border-border bg-background"
            value={glowColor.startsWith("#") ? glowColor : "#ffffff"}
            disabled={!glowEnabled}
            onChange={(event) =>
              applySceneStyle({
                glowColor: normalizeCaptionStyleEffectColor(event.target.value, glowColor),
              })
            }
          />
        </div>

        <div>
          <label htmlFor={`caption-style-glow-blur-${scene.id}`} className={studioFieldLabel}>
            Glow blur
          </label>
          <input
            id={`caption-style-glow-blur-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_GLOW_BLUR_MIN}
            max={CAPTION_STYLE_GLOW_BLUR_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={glowBlur}
            disabled={!glowEnabled}
            onChange={(event) =>
              applySceneStyle({
                glowBlur: clampCaptionStyleGlowBlur(Number(event.target.value), glowBlur),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{glowBlur}px</p>
        </div>
      </StyleSubsection>

      <StyleSubsection title="Container">
        <label className="flex items-center gap-2 text-xs text-foreground/80">
          <input
            type="checkbox"
            checked={backgroundEnabled}
            onChange={(event) => applySceneStyle({ backgroundEnabled: event.target.checked })}
          />
          Background enabled
        </label>

        <div>
          <label htmlFor={`caption-style-bg-color-${scene.id}`} className={studioFieldLabel}>
            Background color
          </label>
          <input
            id={`caption-style-bg-color-${scene.id}`}
            type="color"
            className="mt-1.5 h-9 w-full cursor-pointer rounded-md border border-border bg-background"
            value={backgroundColor}
            onChange={(event) =>
              applySceneStyle({
                backgroundColor: normalizeCaptionStyleBackgroundColor(
                  event.target.value,
                  backgroundColor,
                ),
              })
            }
          />
        </div>

        <div>
          <label htmlFor={`caption-style-opacity-${scene.id}`} className={studioFieldLabel}>
            Opacity
          </label>
          <input
            id={`caption-style-opacity-${scene.id}`}
            type="range"
            min={0}
            max={100}
            step={1}
            className="mt-2 w-full accent-primary"
            value={backgroundOpacity}
            disabled={!backgroundEnabled}
            onChange={(event) =>
              applySceneStyle({
                backgroundOpacity: clampCaptionStyleBackgroundOpacity(
                  Number(event.target.value),
                  backgroundOpacity,
                ),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{backgroundOpacity}%</p>
        </div>
      </StyleSubsection>

      <StyleSubsection title="Spacing">
        <div>
          <label htmlFor={`caption-style-pad-x-${scene.id}`} className={studioFieldLabel}>
            Padding X
          </label>
          <input
            id={`caption-style-pad-x-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_PADDING_MIN}
            max={CAPTION_STYLE_PADDING_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={paddingX}
            onChange={(event) =>
              applySceneStyle({
                paddingX: clampCaptionStylePadding(Number(event.target.value), paddingX),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{paddingX}px</p>
        </div>

        <div>
          <label htmlFor={`caption-style-pad-y-${scene.id}`} className={studioFieldLabel}>
            Padding Y
          </label>
          <input
            id={`caption-style-pad-y-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_PADDING_MIN}
            max={CAPTION_STYLE_PADDING_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={paddingY}
            onChange={(event) =>
              applySceneStyle({
                paddingY: clampCaptionStylePadding(Number(event.target.value), paddingY),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{paddingY}px</p>
        </div>

        <div>
          <label htmlFor={`caption-style-radius-${scene.id}`} className={studioFieldLabel}>
            Corner radius
          </label>
          <input
            id={`caption-style-radius-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_CORNER_RADIUS_MIN}
            max={CAPTION_STYLE_CORNER_RADIUS_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={cornerRadius}
            onChange={(event) =>
              applySceneStyle({
                cornerRadius: clampCaptionStyleCornerRadius(Number(event.target.value), cornerRadius),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{cornerRadius}px</p>
        </div>
      </StyleSubsection>

      <StyleSubsection title="Text Box">
        <div>
          <label htmlFor={`caption-style-max-lines-${scene.id}`} className={studioFieldLabel}>
            Max lines
          </label>
          <input
            id={`caption-style-max-lines-${scene.id}`}
            type="range"
            min={CAPTION_STYLE_MAX_LINES_MIN}
            max={CAPTION_STYLE_MAX_LINES_MAX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={maxLines}
            onChange={(event) =>
              applySceneStyle({
                maxLines: clampCaptionStyleMaxLines(Number(event.target.value), maxLines),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{maxLines}</p>
        </div>

        <div>
          <p className={studioFieldLabel}>Overflow behavior</p>
          <div
            className={`${studioSegmentedControl} mt-1.5`}
            role="radiogroup"
            aria-label="Caption overflow behavior"
          >
            {OVERFLOW_OPTIONS.map((option) => {
              const isActive = overflowBehavior === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={isActive ? studioSegmentActive : studioSegment}
                  onClick={() => applySceneStyle({ overflowBehavior: option.value })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </StyleSubsection>
    </div>
  );
}
