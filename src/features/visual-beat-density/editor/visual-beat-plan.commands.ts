/**
 * Immutable Suggest / Apply / Discard commands for visual-beat plans.
 * Capability flags are explicit inputs — never read from environment here.
 */

import { writeMixedMediaSequenceItems } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "@/features/scene-media-timeline/editor/scene-media-timeline.constants";
import type {
  FootieScene,
  FootieScript,
  SceneVisualSequenceItem,
} from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import { projectSceneVisualBeatPlanContext } from "../adapters/project-scene-visual-beat-plan";
import {
  evaluateVisualBeatPlanStaleness,
  parseStoredVisualBeatPlan,
  type VisualBeatPlanStaleReason,
  type VisualBeatPlanStalenessProjection,
} from "../domain/evaluate-visual-beat-plan-staleness";
import { generateVisualBeatPlan } from "../domain/generate-visual-beat-plan";
import {
  VISUAL_BEAT_COMMAND_TERMINAL_CODES,
  type VisualBeatCommandTerminalCode,
  type VisualBeatDensity,
  type VisualBeatPlanV1,
  type VisualBeatPlanWarningCode,
} from "../domain/visual-beat-plan";

export type VisualBeatCommandWarningCode =
  | VisualBeatPlanWarningCode
  | "BEATS_PLAN_MALFORMED_IGNORED";

export interface VisualBeatCommandWarning {
  readonly code: VisualBeatCommandWarningCode | string;
  readonly message: string;
}

export type VisualBeatCommandSuccess = {
  readonly ok: true;
  readonly script: FootieScript;
  readonly sceneId: string;
  readonly plan: VisualBeatPlanV1 | undefined;
  readonly warnings: readonly VisualBeatCommandWarning[];
  readonly staleness?: VisualBeatPlanStalenessProjection;
};

export type VisualBeatCommandFailure = {
  readonly ok: false;
  readonly script: FootieScript;
  readonly sceneId: string | null;
  readonly terminalCode: VisualBeatCommandTerminalCode;
  readonly warnings: readonly VisualBeatCommandWarning[];
  readonly staleReasons?: readonly VisualBeatPlanStaleReason[];
  readonly staleness?: VisualBeatPlanStalenessProjection;
};

export type VisualBeatCommandResult =
  | VisualBeatCommandSuccess
  | VisualBeatCommandFailure;

function resolveScene(
  script: FootieScript,
  sceneRef: { readonly sceneId?: string; readonly sceneIndex?: number },
): FootieScene | null {
  if (typeof sceneRef.sceneId === "string" && sceneRef.sceneId.length > 0) {
    return script.scenes.find((scene) => scene.id === sceneRef.sceneId) ?? null;
  }
  if (
    typeof sceneRef.sceneIndex === "number" &&
    Number.isInteger(sceneRef.sceneIndex) &&
    sceneRef.sceneIndex >= 0 &&
    sceneRef.sceneIndex < script.scenes.length
  ) {
    return script.scenes[sceneRef.sceneIndex] ?? null;
  }
  return null;
}

function replaceScene(
  script: FootieScript,
  sceneId: string,
  nextScene: FootieScene,
): FootieScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) =>
      scene.id === sceneId ? nextScene : scene,
    ),
  };
}

function failure(
  script: FootieScript,
  sceneId: string | null,
  terminalCode: VisualBeatCommandTerminalCode,
  warnings: readonly VisualBeatCommandWarning[] = [],
  extras: {
    readonly staleReasons?: readonly VisualBeatPlanStaleReason[];
    readonly staleness?: VisualBeatPlanStalenessProjection;
  } = {},
): VisualBeatCommandFailure {
  return {
    ok: false,
    script,
    sceneId,
    terminalCode,
    warnings,
    ...extras,
  };
}

function buildTimedItems(
  items: readonly SceneVisualSequenceItem[],
  starts: readonly number[],
  sceneDurationMs: number,
): SceneVisualSequenceItem[] | null {
  if (items.length !== starts.length || items.length === 0) {
    return null;
  }
  if (starts[0] !== 0) {
    return null;
  }
  const rebuilt: SceneVisualSequenceItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const start = starts[i]!;
    const end = i + 1 < starts.length ? starts[i + 1]! : sceneDurationMs;
    if (!(end > start)) {
      return null;
    }
    if (end - start < SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
      return null;
    }
    const item = items[i]!;
    rebuilt.push({
      id: item.id,
      media: item.media,
      startOffsetMs: start,
      durationMs: end - start,
    });
  }
  return rebuilt;
}

function mapGeneratorWarnings(
  codes: readonly VisualBeatPlanWarningCode[],
): VisualBeatCommandWarning[] {
  return codes.map((code) => ({
    code,
    message: code,
  }));
}

/**
 * Suggest a draft visualBeatPlan for one scene. Never mutates visualSequence/mediaTimeline.
 */
export function suggestVisualBeatPlan(
  script: FootieScript,
  input: {
    readonly sceneId?: string;
    readonly sceneIndex?: number;
    readonly density: VisualBeatDensity;
    readonly generatedAtIso: string;
    readonly visualBeatDensityEnabled: boolean;
  },
): VisualBeatCommandResult {
  if (input.visualBeatDensityEnabled !== true) {
    return failure(
      script,
      null,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_CAPABILITY_OFF,
    );
  }

  const scene = resolveScene(script, input);
  if (!scene) {
    return failure(
      script,
      null,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_INVALID,
      [{ code: "BEATS_PLAN_INVALID", message: "Scene not found." }],
    );
  }

  const context = projectSceneVisualBeatPlanContext(scene);
  const generated = generateVisualBeatPlan({
    narrationText: context.narrationText,
    sceneDurationMs: context.sceneDurationMs,
    usableMedia: context.usableMedia,
    density: input.density,
    generatedAtIso: input.generatedAtIso,
  });

  if (!generated.ok) {
    return failure(script, scene.id, generated.terminalCode, []);
  }

  const draftPlan: VisualBeatPlanV1 = {
    ...generated.plan,
    status: "draft",
  };

  const nextScene: FootieScene = {
    ...scene,
    visualBeatPlan: draftPlan,
  };

  return {
    ok: true,
    script: replaceScene(script, scene.id, nextScene),
    sceneId: scene.id,
    plan: draftPlan,
    warnings: mapGeneratorWarnings(draftPlan.warningCodes),
  };
}

/**
 * Apply a non-stale plan into visualSequence + dual-written mediaTimeline.
 * Never adds/removes/reorders media. Terminal failures return the original script.
 */
export function applyVisualBeatPlan(
  script: FootieScript,
  input: {
    readonly sceneId?: string;
    readonly sceneIndex?: number;
    readonly selectedDensity: VisualBeatDensity;
    readonly visualBeatDensityEnabled: boolean;
    readonly mixedMediaScenesEnabled: boolean;
  },
): VisualBeatCommandResult {
  if (
    input.visualBeatDensityEnabled !== true ||
    input.mixedMediaScenesEnabled !== true
  ) {
    return failure(
      script,
      null,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_CAPABILITY_OFF,
    );
  }

  const scene = resolveScene(script, input);
  if (!scene) {
    return failure(
      script,
      null,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_MISSING,
    );
  }

  const parsed = parseStoredVisualBeatPlan(scene.visualBeatPlan);
  if (parsed.invalid) {
    return failure(
      script,
      scene.id,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_INVALID,
      [
        {
          code: "BEATS_PLAN_MALFORMED_IGNORED",
          message: parsed.warning ?? "visualBeatPlan invalid.",
        },
      ],
    );
  }
  if (!parsed.plan) {
    return failure(
      script,
      scene.id,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_MISSING,
    );
  }

  const context = projectSceneVisualBeatPlanContext(scene);
  const sceneDurationMs = getSceneDurationMs(scene);

  if (
    context.usableMedia.length > 0 &&
    context.usableMedia.length * SCENE_MEDIA_MIN_ITEM_DURATION_MS >
      sceneDurationMs
  ) {
    return failure(
      script,
      scene.id,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_SCENE_TOO_SHORT,
    );
  }

  const staleness = evaluateVisualBeatPlanStaleness({
    storedPlan: parsed.plan,
    narrationText: context.narrationText,
    sceneDurationMs: context.sceneDurationMs,
    usableMedia: context.usableMedia,
    currentStartOffsetsMs: context.currentStartOffsetsMs,
    selectedDensity: input.selectedDensity,
  });

  if (!staleness.applyAllowed || !staleness.plan) {
    const terminalCode =
      staleness.effectiveStatus === "invalid"
        ? VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_INVALID
        : staleness.staleReasons.length > 0
          ? VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_STALE
          : VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_INVALID;
    return failure(script, scene.id, terminalCode, [], {
      staleReasons: staleness.staleReasons,
      staleness,
    });
  }

  const timed = buildTimedItems(
    context.sequenceItems,
    staleness.plan.proposedStartOffsetsMs,
    sceneDurationMs,
  );
  if (!timed) {
    return failure(
      script,
      scene.id,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_INVALID,
      [],
      { staleness },
    );
  }

  try {
    const written = writeMixedMediaSequenceItems(scene, timed, {
      mixedMediaScenesEnabled: true,
    });
    const appliedPlan: VisualBeatPlanV1 = {
      ...staleness.plan,
      status: "applied",
    };
    const nextScene: FootieScene = {
      ...written.scene,
      visualBeatPlan: appliedPlan,
    };
    const nextContext = projectSceneVisualBeatPlanContext(nextScene);
    const warnings: VisualBeatCommandWarning[] = [
      ...mapGeneratorWarnings(appliedPlan.warningCodes),
      ...written.warnings.map((warning) => ({
        code: warning.code,
        message: warning.message,
      })),
    ];
    return {
      ok: true,
      script: replaceScene(script, scene.id, nextScene),
      sceneId: scene.id,
      plan: appliedPlan,
      warnings,
      staleness: evaluateVisualBeatPlanStaleness({
        storedPlan: appliedPlan,
        narrationText: nextContext.narrationText,
        sceneDurationMs: nextContext.sceneDurationMs,
        usableMedia: nextContext.usableMedia,
        currentStartOffsetsMs: nextContext.currentStartOffsetsMs,
        selectedDensity: input.selectedDensity,
      }),
    };
  } catch {
    return failure(
      script,
      scene.id,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_INVALID,
      [],
      { staleness },
    );
  }
}

/**
 * Discard visualBeatPlan metadata only. Timing/media are untouched.
 * Absence is a safe no-op. Allowed even when capability is off.
 */
export function discardVisualBeatPlan(
  script: FootieScript,
  input: {
    readonly sceneId?: string;
    readonly sceneIndex?: number;
  },
): VisualBeatCommandResult {
  const scene = resolveScene(script, input);
  if (!scene) {
    return failure(
      script,
      null,
      VISUAL_BEAT_COMMAND_TERMINAL_CODES.BEATS_PLAN_MISSING,
    );
  }

  if (scene.visualBeatPlan === undefined) {
    return {
      ok: true,
      script,
      sceneId: scene.id,
      plan: undefined,
      warnings: [],
    };
  }

  const nextScene: FootieScene = { ...scene };
  delete nextScene.visualBeatPlan;

  return {
    ok: true,
    script: replaceScene(script, scene.id, nextScene),
    sceneId: scene.id,
    plan: undefined,
    warnings: [],
  };
}

/** Convenience projection for UI/editor consumers (no mutation). */
export function projectVisualBeatPlanStalenessForScene(
  scene: FootieScene,
  selectedDensity?: VisualBeatDensity,
): VisualBeatPlanStalenessProjection {
  const context = projectSceneVisualBeatPlanContext(scene);
  return evaluateVisualBeatPlanStaleness({
    storedPlan: scene.visualBeatPlan,
    narrationText: context.narrationText,
    sceneDurationMs: context.sceneDurationMs,
    usableMedia: context.usableMedia,
    currentStartOffsetsMs: context.currentStartOffsetsMs,
    selectedDensity,
  });
}
