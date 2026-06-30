import type { BlueprintMappedScene } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import { adaptSceneDensity } from "@/features/studio-intelligence/scene-density/scene-density-adapter";
import { runStudioIntelligence } from "@/features/studio-intelligence/studio-intelligence-runtime";
import type {
  SceneImportanceScore,
  StudioIntelligenceResult,
  VisualIntentType,
} from "@/features/studio-intelligence/studio-intelligence.types";
import type { SceneBlueprintKind } from "@/features/studio-intelligence/scene-blueprint.types";
import { mapModeToStoryStrategyId } from "@/features/studio-intelligence/story-strategy/story-strategy.utils";
import type { StoryStrategyId } from "@/features/studio-intelligence/story-strategy/story-strategy.types";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { ensureTimelineItems, getStoryTotalDuration } from "@/features/story/utils";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type { ScriptMode } from "@/types/footiebitz";
import { resolveSceneCount, resolveScriptMode } from "@/types/footiebitz";

import type { CreatorAssetPlanningSnapshot } from "./creator-asset-planning.types";
import {
  buildCreatorAssetPlanningFromScenePlan,
  buildCreatorAssetPlanningSnapshot,
} from "./creator-asset-planning.utils";

export interface AssetPlanningContext {
  intelligence: StudioIntelligenceResult;
  mappedScenes: BlueprintMappedScene[];
}

export interface BuildCreatorAssetPlanningSnapshotForGeneratedScenesInput {
  script: FootieScript;
  scenes: FootieScene[];
  title: string;
  narration: string;
  topic: string;
  scriptMode?: ScriptMode;
  sceneCount: number;
  voiceoverDurationMs: number;
  assetPlanningContext?: AssetPlanningContext;
}

/** Returns whether asset planning snapshots should be built during generation. */
export function isAssetIntelligencePlanningEnabled(): boolean {
  return (
    process.env.ASSET_INTELLIGENCE_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_ASSET_INTELLIGENCE_ENABLED === "true"
  );
}

function logAssetPlanningDebug(message: string, details?: Record<string, unknown>): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ASSET_INTELLIGENCE_PLANNING_DEBUG !== "true"
  ) {
    return;
  }

  if (details) {
    console.warn(`creator-asset-planning: ${message}`, details);
    return;
  }

  console.warn(`creator-asset-planning: ${message}`);
}

function makeImportance(value: number): SceneImportanceScore {
  return {
    value,
    tier: value >= 0.85 ? "critical" : value >= 0.65 ? "high" : value >= 0.35 ? "medium" : "low",
  };
}

function resolveVisualIntent(scene: FootieScene): VisualIntentType {
  switch (scene.sceneType) {
    case "match":
      return "match_action";
    case "ending":
      return "archive_footage";
    case "intro":
      return "player_portrait";
    default:
      return "neutral_broll";
  }
}

function resolveBlueprintKind(scene: FootieScene): SceneBlueprintKind {
  switch (scene.sceneType) {
    case "intro":
      return "hook_opener";
    case "match":
      return "match_highlight";
    case "ending":
      return "closing_moment";
    default:
      return "neutral_broll";
  }
}

function resolveTemplateId(scriptMode: ScriptMode): StoryStrategyId {
  return mapModeToStoryStrategyId(scriptMode) ?? "default";
}

function buildSyntheticMappedSceneFromFootieScene(
  scene: FootieScene,
  index: number,
  scriptMode: ScriptMode,
): BlueprintMappedScene {
  const visualIntentType = resolveVisualIntent(scene);
  const subtitle = scene.subtitle?.trim() || `Scene ${index + 1}`;
  const narrationExcerpt = scene.narration?.trim() || subtitle;

  return {
    id: scene.id,
    order: index,
    sourceBlueprintId: `generated-scene-${index + 1}`,
    sourceBeatIds: [],
    blueprintRole: scene.sceneType === "intro" ? "intro" : scene.sceneType === "ending" ? "payoff" : "context",
    blueprintKind: resolveBlueprintKind(scene),
    proposedSceneType: scene.sceneType ?? "context",
    title: subtitle,
    narrationExcerpt,
    durationMs: Math.max(1000, Math.round((scene.duration ?? 1) * 1000)),
    importance: makeImportance(0.55),
    visualIntentType,
    motionSuggestion: "ken_burns",
    captionText: subtitle,
    assetSearchQuery: subtitle,
    visualHints: {
      visualIntentType,
      subject: subtitle,
    },
    mediaHints: {
      assetRequirementType: "image",
      searchQuery: subtitle,
      preferredOrientation: "landscape",
      imageCount: 1,
    },
    motionHints: {
      suggestedMotion: "ken_burns",
      intensity: "medium",
    },
    captionHints: {
      emphasis: "phrase",
      highlightWords: [],
      captionStyleHint: "default",
      captionText: subtitle,
    },
    timingMetadata: {
      suggestedDurationMs: Math.max(1000, Math.round((scene.duration ?? 1) * 1000)),
      minDurationMs: 1000,
      maxDurationMs: 8000,
      pacing: "normal",
    },
    narrationMetadata: {
      narrationStartIndex: 0,
      sentenceRange: { start: index, end: index },
      slicingStrategy: "topic_fallback",
      narrationConfidence: 0.55,
    },
    semanticSlotId: scene.sceneType ?? "context",
    semanticSlotLabel: subtitle,
    semanticRole: scene.sceneType ?? "Context",
    templateId: resolveTemplateId(scriptMode),
    templateApplied: false,
    contentPattern: "generated_scene",
    planningTags: ["generated_scene", scene.sceneType ?? "context"],
    confidence: 0.55,
    mappingDecisions: [],
  };
}

function alignMappedScenesToFootieScenes(
  mappedScenes: BlueprintMappedScene[],
  footieScenes: FootieScene[],
  scriptMode: ScriptMode,
): BlueprintMappedScene[] {
  return footieScenes.map((scene, index) => {
    const source = mappedScenes[index] ?? mappedScenes[mappedScenes.length - 1];
    if (!source) {
      return buildSyntheticMappedSceneFromFootieScene(scene, index, scriptMode);
    }

    return {
      ...source,
      id: scene.id,
      order: index,
      title: scene.subtitle?.trim() || source.title,
      narrationExcerpt: scene.narration?.trim() || source.narrationExcerpt,
      captionText: scene.subtitle?.trim() || source.captionText,
    };
  });
}

function resolvePlanningContext(input: {
  topic: string;
  narration: string;
  voiceoverDurationMs: number;
  sceneCount: number;
  scriptMode: ScriptMode;
  scenes: FootieScene[];
  assetPlanningContext?: AssetPlanningContext;
}): { intelligence: StudioIntelligenceResult; mappedScenes: BlueprintMappedScene[] } {
  if (input.assetPlanningContext) {
    return {
      intelligence: input.assetPlanningContext.intelligence,
      mappedScenes: alignMappedScenesToFootieScenes(
        input.assetPlanningContext.mappedScenes,
        input.scenes,
        input.scriptMode,
      ),
    };
  }

  const intelligence = runStudioIntelligence({
    topic: input.topic,
    narration: input.narration,
    targetDurationSec: Math.max(1, Math.round(input.voiceoverDurationMs / 1000)),
    targetDurationMs: input.voiceoverDurationMs,
    mode: input.scriptMode,
  });

  const density = adaptSceneDensity(intelligence.sceneBlueprintCollection, input.sceneCount);
  if (density.success) {
    const adapter = mapBlueprintsToScenes({
      collection: density.collection,
      strategyId: intelligence.strategyId,
      topic: intelligence.input.topic,
      normalizedNarration: intelligence.normalizedNarration,
      targetDurationMs: input.voiceoverDurationMs,
    });

    if (adapter.success && adapter.mappedScenes.length > 0) {
      return {
        intelligence,
        mappedScenes: alignMappedScenesToFootieScenes(
          adapter.mappedScenes,
          input.scenes,
          input.scriptMode,
        ),
      };
    }
  }

  return {
    intelligence,
    mappedScenes: input.scenes.map((scene, index) =>
      buildSyntheticMappedSceneFromFootieScene(scene, index, input.scriptMode),
    ),
  };
}

/** Builds asset planning snapshot from generated scenes — SI metadata optional. */
export function buildCreatorAssetPlanningSnapshotForGeneratedScenes(
  input: BuildCreatorAssetPlanningSnapshotForGeneratedScenesInput,
): CreatorAssetPlanningSnapshot {
  const topic = input.topic.trim();
  const narration = input.narration.trim();
  const voiceoverDurationMs = Math.round(input.voiceoverDurationMs);

  if (!topic || !narration || input.scenes.length === 0) {
    throw new Error("asset planning requires topic, narration, and generated scenes");
  }

  if (!Number.isFinite(voiceoverDurationMs) || voiceoverDurationMs <= 0) {
    throw new Error("asset planning requires a valid voiceover duration");
  }

  const scriptMode = resolveScriptMode(input.scriptMode);
  const sceneCount = resolveSceneCount(input.sceneCount);
  const syncedScript = syncFootieScript({
    title: input.title.trim() || input.topic.trim(),
    narration: input.narration.trim(),
    totalDuration: getStoryTotalDuration(input.scenes),
    scenes: input.scenes,
    timelineItems: ensureTimelineItems(input.scenes),
    voiceoverDurationMs: input.voiceoverDurationMs,
  });

  const planningContext = resolvePlanningContext({
    topic,
    narration,
    voiceoverDurationMs,
    sceneCount,
    scriptMode,
    scenes: input.scenes,
    assetPlanningContext: input.assetPlanningContext,
  });

  const planning = buildCreatorAssetPlanningFromScenePlan({
    intelligence: planningContext.intelligence,
    mappedScenes: planningContext.mappedScenes,
    topic,
  });

  return buildCreatorAssetPlanningSnapshot({
    script: syncedScript,
    storyMode: scriptMode,
    planning,
  });
}

/** Attempts to build planning snapshot — never throws; returns undefined on failure. */
export function tryBuildCreatorAssetPlanningSnapshotForGeneratedScenes(
  input: BuildCreatorAssetPlanningSnapshotForGeneratedScenesInput,
): CreatorAssetPlanningSnapshot | undefined {
  if (!isAssetIntelligencePlanningEnabled()) {
    return undefined;
  }

  try {
    return buildCreatorAssetPlanningSnapshotForGeneratedScenes(input);
  } catch (error) {
    logAssetPlanningDebug("asset planning snapshot skipped", {
      reason: error instanceof Error ? error.message : "planning snapshot failed",
    });
    return undefined;
  }
}
