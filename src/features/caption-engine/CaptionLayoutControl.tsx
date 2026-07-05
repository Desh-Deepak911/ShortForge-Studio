"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import {
  buildSceneCaptionLayoutPatch,
  CAPTION_OFFSET_X_MAX_PX,
  CAPTION_OFFSET_X_MIN_PX,
  CAPTION_OFFSET_Y_MAX_PX,
  CAPTION_OFFSET_Y_MIN_PX,
  clampCaptionBackgroundOpacity,
  clampCaptionMaxWidthPercent,
  clampCaptionOffsetXPx,
  clampCaptionOffsetYPx,
  mergeCaptionLayoutSettings,
  normalizeCaptionAnchor,
  normalizeCaptionTextAlign,
} from "@/features/caption-layout";
import type { CaptionTextAlign } from "@/features/caption-layout";
import type { CaptionAnchor, CaptionLayout, FootieScene, FootieScript } from "@/features/story/types";
import {
  studioFieldLabel,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const ANCHOR_OPTIONS: { value: CaptionAnchor; label: string }[] = [
  { value: "top_left", label: "Top Left" },
  { value: "top_center", label: "Top Center" },
  { value: "top_right", label: "Top Right" },
  { value: "center_left", label: "Center Left" },
  { value: "center", label: "Center" },
  { value: "center_right", label: "Center Right" },
  { value: "bottom_left", label: "Bottom Left" },
  { value: "bottom_center", label: "Bottom Center" },
  { value: "bottom_right", label: "Bottom Right" },
];

const TEXT_ALIGN_OPTIONS: { value: CaptionTextAlign; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

export interface CaptionLayoutControlProps {
  scene: FootieScene;
  script: FootieScript;
  onSceneLayoutChange: (patch: Partial<FootieScene>) => void;
}

function LayoutSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <p className="text-[11px] font-semibold tracking-tight text-foreground/80">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function mergeLayout(
  scene: FootieScene,
  script: FootieScript,
  patch: Partial<CaptionLayout>,
): CaptionLayout {
  return {
    ...mergeCaptionLayoutSettings(scene.captionLayout, script.defaultCaptionLayout),
    ...patch,
    version: 2,
  };
}

function effectiveToStored(layout: CaptionLayout): CaptionLayout {
  return {
    version: layout.version,
    anchor: layout.anchor,
    textAlign: layout.textAlign,
    offsetX: layout.offsetX,
    offsetY: layout.offsetY,
    maxWidthPercent: layout.maxWidthPercent,
    safeAreaEnabled: layout.safeAreaEnabled,
    ...(layout.backgroundOpacity != null ? { backgroundOpacity: layout.backgroundOpacity } : {}),
  };
}

export default function CaptionLayoutControl({
  scene,
  script,
  onSceneLayoutChange,
}: CaptionLayoutControlProps) {
  const effective = mergeCaptionLayoutSettings(scene.captionLayout, script.defaultCaptionLayout);
  const anchor = effective.anchor ?? "bottom_center";
  const textAlign = effective.textAlign ?? "center";
  const opacityValue = effective.backgroundOpacity ?? 45;
  const maxWidthValue = effective.maxWidthPercent ?? 90;
  const offsetXValue = effective.offsetX ?? 0;
  const offsetYValue = effective.offsetY ?? 0;

  const applySceneLayout = (patch: Partial<CaptionLayout>) => {
    onSceneLayoutChange(buildSceneCaptionLayoutPatch(mergeLayout(scene, script, patch)));
  };

  return (
    <div className="space-y-4">
      <LayoutSubsection title="Placement">
        <div>
          <label htmlFor={`caption-layout-anchor-${scene.id}`} className={studioFieldLabel}>
            Anchor
          </label>
          <div className="relative mt-1.5">
            <select
              id={`caption-layout-anchor-${scene.id}`}
              className={`${studioSelectCompact} w-full appearance-none pr-8`}
              value={anchor}
              onChange={(event) =>
                applySceneLayout({
                  anchor: normalizeCaptionAnchor(event.target.value),
                })
              }
            >
              {ANCHOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevronCompact} aria-hidden />
          </div>
        </div>

        <div>
          <p className={studioFieldLabel}>Text Alignment</p>
          <div
            className={`${studioSegmentedControl} mt-1.5`}
            role="radiogroup"
            aria-label="Caption text alignment"
          >
            {TEXT_ALIGN_OPTIONS.map((option) => {
              const isActive = textAlign === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={isActive ? studioSegmentActive : studioSegment}
                  onClick={() =>
                    applySceneLayout({
                      textAlign: normalizeCaptionTextAlign(option.value),
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
          <label htmlFor={`caption-layout-offset-x-${scene.id}`} className={studioFieldLabel}>
            Offset X
          </label>
          <input
            id={`caption-layout-offset-x-${scene.id}`}
            type="range"
            min={CAPTION_OFFSET_X_MIN_PX}
            max={CAPTION_OFFSET_X_MAX_PX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={offsetXValue}
            onChange={(event) =>
              applySceneLayout({
                offsetX: clampCaptionOffsetXPx(Number(event.target.value), offsetXValue),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{offsetXValue}px</p>
        </div>

        <div>
          <label htmlFor={`caption-layout-offset-y-${scene.id}`} className={studioFieldLabel}>
            Offset Y
          </label>
          <input
            id={`caption-layout-offset-y-${scene.id}`}
            type="range"
            min={CAPTION_OFFSET_Y_MIN_PX}
            max={CAPTION_OFFSET_Y_MAX_PX}
            step={1}
            className="mt-2 w-full accent-primary"
            value={offsetYValue}
            onChange={(event) =>
              applySceneLayout({
                offsetY: clampCaptionOffsetYPx(Number(event.target.value), offsetYValue),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{offsetYValue}px</p>
        </div>
      </LayoutSubsection>

      <LayoutSubsection title="Sizing">
        <div>
          <label htmlFor={`caption-layout-max-width-${scene.id}`} className={studioFieldLabel}>
            Maximum Width
          </label>
          <input
            id={`caption-layout-max-width-${scene.id}`}
            type="range"
            min={40}
            max={100}
            step={1}
            className="mt-2 w-full accent-primary"
            value={maxWidthValue}
            onChange={(event) =>
              applySceneLayout({
                maxWidthPercent: clampCaptionMaxWidthPercent(Number(event.target.value)),
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{maxWidthValue}%</p>
        </div>
      </LayoutSubsection>

      <LayoutSubsection title="Appearance">
        <div>
          <label htmlFor={`caption-layout-opacity-${scene.id}`} className={studioFieldLabel}>
            Background Opacity
          </label>
          <input
            id={`caption-layout-opacity-${scene.id}`}
            type="range"
            min={0}
            max={100}
            step={1}
            className="mt-2 w-full accent-primary"
            value={opacityValue}
            onChange={(event) =>
              applySceneLayout({
                backgroundOpacity:
                  clampCaptionBackgroundOpacity(Number(event.target.value)) ?? opacityValue,
              })
            }
          />
          <p className={`${studioSubtleText} mt-1 tabular-nums`}>{opacityValue}%</p>
        </div>

        <label className="flex items-center gap-2 text-xs text-foreground/80">
          <input
            type="checkbox"
            checked={effective.safeAreaEnabled !== false}
            onChange={(event) => applySceneLayout({ safeAreaEnabled: event.target.checked })}
          />
          Safe Area Enabled
        </label>
      </LayoutSubsection>
    </div>
  );
}

export { effectiveToStored };
