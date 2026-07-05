"use client";

import { ChevronDown } from "lucide-react";

import {
  buildSceneCaptionLayoutPatch,
  clampCaptionLayoutPercent,
  normalizeCaptionLayoutPosition,
  resolveCaptionLayout,
} from "@/features/caption-engine/caption-layout.utils";
import type { CaptionLayout, CaptionLayoutPosition, FootieScene, FootieScript } from "@/features/story/types";
import {
  studioFieldLabel,
  studioInputCompact,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const POSITION_OPTIONS: { value: CaptionLayoutPosition; label: string }[] = [
  { value: "bottom", label: "Bottom" },
  { value: "center", label: "Center" },
  { value: "top", label: "Top" },
  { value: "top_left", label: "Top left" },
  { value: "custom", label: "Custom" },
];

export interface CaptionLayoutControlProps {
  scene: FootieScene;
  script: FootieScript;
  onSceneLayoutChange: (patch: Partial<FootieScene>) => void;
  onProjectLayoutChange: (layout: CaptionLayout | undefined) => void;
}

function mergeLayout(
  scene: FootieScene,
  script: FootieScript,
  patch: Partial<CaptionLayout>,
): CaptionLayout {
  const current = resolveCaptionLayout(scene, script);
  return {
    position: current.position,
    xPercent: current.xPercent,
    yPercent: current.yPercent,
    ...(scene.captionLayout ?? script.defaultCaptionLayout ?? {}),
    ...patch,
  };
}

function effectiveToStored(layout: ReturnType<typeof resolveCaptionLayout>): CaptionLayout {
  return {
    position: layout.position,
    ...(layout.position === "custom"
      ? { xPercent: layout.xPercent, yPercent: layout.yPercent }
      : {}),
    ...(layout.backgroundOpacityPercent != null
      ? { backgroundOpacity: layout.backgroundOpacityPercent }
      : {}),
  };
}

export default function CaptionLayoutControl({
  scene,
  script,
  onSceneLayoutChange,
  onProjectLayoutChange,
}: CaptionLayoutControlProps) {
  const effective = resolveCaptionLayout(scene, script);
  const sceneUsesOverride = Boolean(scene.captionLayout);
  const position = effective.position;
  const opacityValue = effective.backgroundOpacityPercent ?? 45;

  const applySceneLayout = (patch: Partial<CaptionLayout>) => {
    onSceneLayoutChange(buildSceneCaptionLayoutPatch(mergeLayout(scene, script, patch)));
  };

  return (
    <div className="space-y-3 border-t border-border/15 pt-3">
      <div>
        <label htmlFor={`caption-layout-position-${scene.id}`} className={studioFieldLabel}>
          Position
        </label>
        <div className="relative mt-1.5">
          <select
            id={`caption-layout-position-${scene.id}`}
            className={`${studioSelectCompact} w-full appearance-none pr-8`}
            value={position}
            onChange={(event) =>
              applySceneLayout({
                position: normalizeCaptionLayoutPosition(event.target.value),
              })
            }
          >
            {POSITION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className={studioSelectChevronCompact} aria-hidden />
        </div>
      </div>

      {position === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`caption-layout-x-${scene.id}`} className={studioFieldLabel}>
              X %
            </label>
            <input
              id={`caption-layout-x-${scene.id}`}
              type="number"
              min={0}
              max={100}
              className={`${studioInputCompact} mt-1.5 w-full`}
              value={effective.xPercent}
              onChange={(event) =>
                applySceneLayout({
                  xPercent: clampCaptionLayoutPercent(Number(event.target.value), effective.xPercent),
                })
              }
            />
          </div>
          <div>
            <label htmlFor={`caption-layout-y-${scene.id}`} className={studioFieldLabel}>
              Y %
            </label>
            <input
              id={`caption-layout-y-${scene.id}`}
              type="number"
              min={0}
              max={100}
              className={`${studioInputCompact} mt-1.5 w-full`}
              value={effective.yPercent}
              onChange={(event) =>
                applySceneLayout({
                  yPercent: clampCaptionLayoutPercent(Number(event.target.value), effective.yPercent),
                })
              }
            />
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor={`caption-layout-opacity-${scene.id}`} className={studioFieldLabel}>
          Background opacity
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
              backgroundOpacity: clampCaptionLayoutPercent(Number(event.target.value), opacityValue),
            })
          }
        />
        <p className={`${studioSubtleText} mt-1 tabular-nums`}>{opacityValue}%</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-border/40 px-2.5 py-1 text-[11px] font-medium text-foreground/80 hover:bg-muted/40"
          onClick={() => onProjectLayoutChange(scene.captionLayout ?? effectiveToStored(effective))}
        >
          Save as project default
        </button>
        {sceneUsesOverride ? (
          <button
            type="button"
            className="rounded-md border border-border/40 px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-muted/40"
            onClick={() => onSceneLayoutChange({ captionLayout: undefined })}
          >
            Use project default
          </button>
        ) : null}
      </div>
    </div>
  );
}
