import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import { materializeMappedScenesToFootieScript } from "@/features/studio-intelligence/footie-script-materializer";
import { adaptSceneDensity } from "@/features/studio-intelligence/scene-density/scene-density-adapter";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";
import type { FootieScene } from "@/features/story/types";
import type { ScriptMode } from "@/types/footiebitz";
import { resolveSceneCount, resolveScriptMode } from "@/types/footiebitz";

export interface StudioIntelligenceScenePlanGateInput {
  requestFlag?: boolean;
}

export interface TryGenerateScenesFromStudioIntelligenceInput {
  topic: string;
  narration: string;
  voiceoverDurationMs: number;
  sceneCount: number;
  scriptMode?: ScriptMode;
}

export interface StudioIntelligenceScenePlanDiagnostics {
  strategyId?: string;
  blueprintCount: number;
  adaptedBlueprintCount: number;
  densityAdapterSuccess: boolean;
  densityAdapterStrategy?: string;
  mappedSceneCount: number;
  materializedSceneCount: number;
  adapterSuccess: boolean;
  materializerSuccess: boolean;
  adapterWarningCodes: string[];
  materializerWarningCodes: string[];
}

export type TryGenerateScenesFromStudioIntelligenceResult =
  | { success: true; scenes: FootieScene[]; diagnostics: StudioIntelligenceScenePlanDiagnostics }
  | { success: false; reason: string; diagnostics?: StudioIntelligenceScenePlanDiagnostics };

/** True only when both the request flag and env kill switch are enabled. */
export function isStudioIntelligenceScenePlanEnabled(
  input: StudioIntelligenceScenePlanGateInput,
): boolean {
  return (
    process.env.STUDIO_INTELLIGENCE_SCENE_PLAN_ENABLED === "true" &&
    input.requestFlag === true
  );
}

export function isStudioIntelligenceScenePlanDebugEnabled(): boolean {
  return process.env.STUDIO_INTELLIGENCE_SCENE_PLAN_DEBUG === "true";
}

export function logStudioIntelligenceScenePlanDebug(
  message: string,
  details?: Record<string, unknown>,
): void {
  if (!isStudioIntelligenceScenePlanDebugEnabled()) {
    return;
  }

  if (details) {
    console.warn(`studio-intelligence-scene-plan: ${message}`, details);
    return;
  }

  console.warn(`studio-intelligence-scene-plan: ${message}`);
}

/**
 * Attempts scene planning via Studio Intelligence → adapter → materializer.
 * Returns failure (never throws) so callers can fall back to AI scene generation.
 */
export function tryGenerateScenesFromStudioIntelligence(
  input: TryGenerateScenesFromStudioIntelligenceInput,
): TryGenerateScenesFromStudioIntelligenceResult {
  const topic = input.topic.trim();
  const narration = input.narration.trim();
  const voiceoverDurationMs = Math.round(input.voiceoverDurationMs);
  const requestedSceneCount = resolveSceneCount(input.sceneCount);
  const scriptMode = resolveScriptMode(input.scriptMode);

  if (!topic || !narration) {
    return { success: false, reason: "topic and narration are required" };
  }

  if (!Number.isFinite(voiceoverDurationMs) || voiceoverDurationMs <= 0) {
    return { success: false, reason: "valid voiceover duration is required" };
  }

  try {
    const intelligence = runStudioIntelligence({
      topic,
      narration,
      targetDurationSec: Math.max(1, Math.round(voiceoverDurationMs / 1000)),
      targetDurationMs: voiceoverDurationMs,
      mode: scriptMode,
    });

    const density = adaptSceneDensity(
      intelligence.sceneBlueprintCollection,
      requestedSceneCount,
    );

    const diagnosticsBase: StudioIntelligenceScenePlanDiagnostics = {
      strategyId: intelligence.strategyId,
      blueprintCount: intelligence.sceneBlueprintCollection.blueprints.length,
      adaptedBlueprintCount: density.collection.blueprints.length,
      densityAdapterSuccess: density.success,
      densityAdapterStrategy: density.diagnostics.strategy,
      mappedSceneCount: 0,
      materializedSceneCount: 0,
      adapterSuccess: false,
      materializerSuccess: false,
      adapterWarningCodes: [],
      materializerWarningCodes: [],
    };

    if (!density.success) {
      return {
        success: false,
        reason: density.reason ?? "scene density adapter failed",
        diagnostics: diagnosticsBase,
      };
    }

    const adapter = mapBlueprintsToScenes({
      collection: density.collection,
      strategyId: intelligence.strategyId,
      topic: intelligence.input.topic,
      normalizedNarration: intelligence.normalizedNarration,
      targetDurationMs: voiceoverDurationMs,
    });

    diagnosticsBase.mappedSceneCount = adapter.mappedScenes.length;
    diagnosticsBase.adapterSuccess = adapter.success;
    diagnosticsBase.adapterWarningCodes = adapter.warnings.map((warning) => warning.code);

    if (!adapter.success) {
      return {
        success: false,
        reason: "blueprint adapter failed",
        diagnostics: diagnosticsBase,
      };
    }

    const materializer = materializeMappedScenesToFootieScript({
      mappedScenes: adapter.mappedScenes,
      narration: intelligence.normalizedNarration,
      voiceoverDurationMs,
      adapterDiagnostics: adapter.diagnostics,
    });

    const diagnostics: StudioIntelligenceScenePlanDiagnostics = {
      ...diagnosticsBase,
      materializedSceneCount: materializer.footieScenes.length,
      materializerSuccess: materializer.success,
      materializerWarningCodes: materializer.warnings.map((warning) => warning.code),
    };

    if (!materializer.success) {
      return {
        success: false,
        reason: "footie script materializer failed",
        diagnostics,
      };
    }

    if (materializer.footieScenes.length !== requestedSceneCount) {
      return {
        success: false,
        reason: `scene count mismatch: materialized ${materializer.footieScenes.length} vs requested ${requestedSceneCount}`,
        diagnostics,
      };
    }

    logStudioIntelligenceScenePlanDebug("scene plan succeeded", {
      strategyId: diagnostics.strategyId,
      sceneCount: materializer.footieScenes.length,
      adapterWarnings: diagnostics.adapterWarningCodes,
      materializerWarnings: diagnostics.materializerWarningCodes,
    });

    return {
      success: true,
      scenes: materializer.footieScenes,
      diagnostics,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "studio intelligence scene plan failed";

    logStudioIntelligenceScenePlanDebug("scene plan threw", { reason });

    return { success: false, reason };
  }
}
