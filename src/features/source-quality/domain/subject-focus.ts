/**
 * Subject-focus helpers for source-quality authoring.
 * Types + fail-closed normalize are story-owned; this module type-imports story
 * and provides the manual 3×3 grid + fingerprints used by suggestion/commands.
 */

import type {
  SceneMediaFramingSnapshot,
  SceneMediaSubjectFocus,
  SceneMediaSubjectFocusSource,
} from "@/features/story/types/subject-focus.types";
import {
  SCENE_MEDIA_SUBJECT_FOCUS_VERSION,
  normalizeSceneMediaSubjectFocus,
} from "@/features/story/types/subject-focus.types";

import { sourceQualityStableHash } from "./safe-visual-adjustment-recommendation";

export {
  normalizeSceneMediaSubjectFocus,
  normalizeSceneMediaSubjectAwareFramingProvenance,
  sceneMediaFramingSnapshotsEqual,
} from "@/features/story/types/subject-focus.types";

export type SubjectFocusGridId =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface SubjectFocusGridOption {
  readonly id: SubjectFocusGridId;
  readonly label: string;
  readonly row: 0 | 1 | 2;
  readonly col: 0 | 1 | 2;
  readonly centerX: number;
  readonly centerY: number;
}

/** Named 3×3 positions — centers at 0.25 / 0.5 / 0.75. */
export const SUBJECT_FOCUS_GRID_OPTIONS: readonly SubjectFocusGridOption[] =
  Object.freeze([
    Object.freeze({
      id: "top-left",
      label: "Top left",
      row: 0,
      col: 0,
      centerX: 0.25,
      centerY: 0.25,
    }),
    Object.freeze({
      id: "top-center",
      label: "Top center",
      row: 0,
      col: 1,
      centerX: 0.5,
      centerY: 0.25,
    }),
    Object.freeze({
      id: "top-right",
      label: "Top right",
      row: 0,
      col: 2,
      centerX: 0.75,
      centerY: 0.25,
    }),
    Object.freeze({
      id: "middle-left",
      label: "Middle left",
      row: 1,
      col: 0,
      centerX: 0.25,
      centerY: 0.5,
    }),
    Object.freeze({
      id: "center",
      label: "Center",
      row: 1,
      col: 1,
      centerX: 0.5,
      centerY: 0.5,
    }),
    Object.freeze({
      id: "middle-right",
      label: "Middle right",
      row: 1,
      col: 2,
      centerX: 0.75,
      centerY: 0.5,
    }),
    Object.freeze({
      id: "bottom-left",
      label: "Bottom left",
      row: 2,
      col: 0,
      centerX: 0.25,
      centerY: 0.75,
    }),
    Object.freeze({
      id: "bottom-center",
      label: "Bottom center",
      row: 2,
      col: 1,
      centerX: 0.5,
      centerY: 0.75,
    }),
    Object.freeze({
      id: "bottom-right",
      label: "Bottom right",
      row: 2,
      col: 2,
      centerX: 0.75,
      centerY: 0.75,
    }),
  ]);

const GRID_BY_ID = new Map(
  SUBJECT_FOCUS_GRID_OPTIONS.map((option) => [option.id, option]),
);

export function resolveSubjectFocusGridOption(
  id: string | null | undefined,
): SubjectFocusGridOption | undefined {
  if (typeof id !== "string" || !id.trim()) return undefined;
  return GRID_BY_ID.get(id.trim() as SubjectFocusGridId);
}

/** Nearest named grid cell for a normalized focus (for radiogroup selection). */
export function matchSubjectFocusGridId(
  focus: Pick<SceneMediaSubjectFocus, "centerX" | "centerY"> | null | undefined,
): SubjectFocusGridId | null {
  if (!focus) return null;
  let best: SubjectFocusGridOption | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const option of SUBJECT_FOCUS_GRID_OPTIONS) {
    const dx = option.centerX - focus.centerX;
    const dy = option.centerY - focus.centerY;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = option;
    }
  }
  return best?.id ?? null;
}

export function buildManualSubjectFocusFromGrid(
  id: SubjectFocusGridId,
): SceneMediaSubjectFocus | undefined {
  const option = resolveSubjectFocusGridOption(id);
  if (!option) return undefined;
  return Object.freeze({
    version: SCENE_MEDIA_SUBJECT_FOCUS_VERSION,
    centerX: option.centerX,
    centerY: option.centerY,
    source: "manual" as const satisfies SceneMediaSubjectFocusSource,
  });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function fingerprintSubjectFocus(
  focus: SceneMediaSubjectFocus | null | undefined,
): string {
  const normalized = normalizeSceneMediaSubjectFocus(focus);
  if (!normalized) {
    return sourceQualityStableHash(stableStringify({ empty: true }));
  }
  return sourceQualityStableHash(
    stableStringify({
      version: normalized.version,
      centerX: normalized.centerX,
      centerY: normalized.centerY,
      width: normalized.width ?? null,
      height: normalized.height ?? null,
      source: normalized.source,
    }),
  );
}

export function toStoryFramingSnapshot(input: {
  readonly fitMode: "fit" | "fill";
  readonly positionX: number;
  readonly positionY: number;
  readonly zoom: number;
  readonly rotationDeg: number;
}): SceneMediaFramingSnapshot {
  return Object.freeze({
    fitMode: input.fitMode === "fit" ? "fit" : "fill",
    positionX: input.positionX,
    positionY: input.positionY,
    zoom: input.zoom,
    rotationDeg: input.rotationDeg,
  });
}
