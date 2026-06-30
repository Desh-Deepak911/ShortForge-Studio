import "server-only";

import {
  getOpenAIClient,
  buildScenePlanPrompt,
  resolveQualityMode,
  resolveScriptModel,
} from "@/lib/ai";
import type { FootieScene, SceneType, StoryScript } from "@/features/story/types";
import {
  applyGeneratedStorySceneCaptions,
  attachEvenVoiceoverTiming,
  attachSceneNarrationFromScript,
} from "@/features/story/utils";
import type { QualityMode, ScriptMode } from "@/types/footiebitz";
import { resolveSceneCount } from "@/types/footiebitz";

import { cleanJsonText } from "./story-parse.service";
import type { ScenePlanOutcomeMeta } from "@/features/story/utils/studio-intelligence-scene-plan-dev.utils";
import type { CreatorAssetPlanningSnapshot } from "@/features/editor/creator-asset-planning/creator-asset-planning.types";
import {
  isStudioIntelligenceScenePlanEnabled,
  logStudioIntelligenceScenePlanDebug,
  tryGenerateScenesFromStudioIntelligence,
  type StudioIntelligenceScenePlanDiagnostics,
} from "./studio-intelligence-scene-plan.utils";

const SCENE_PLAN_MAX_OUTPUT_TOKENS = 1200;

const EMPTY_RESPONSE_ERROR =
  "The model returned an empty response. Try Balanced mode or increase max output tokens.";
const INVALID_JSON_ERROR = "The model returned invalid JSON. Please try again.";

const VALID_SCENE_TYPES = new Set<SceneType>([
  "intro",
  "context",
  "match",
  "transition",
  "ending",
]);

export interface GenerateScenesFromScriptAndAudioInput {
  prompt: string;
  script: StoryScript;
  voiceoverDurationMs: number;
  sceneCount: number;
  scriptMode?: ScriptMode;
  useStudioIntelligenceScenes?: boolean;
}

export interface GenerateScenesFromScriptAndAudioOptions {
  qualityMode?: QualityMode;
  model?: string;
}

export type ScenePlanningResult =
  | {
      success: true;
      scenes: FootieScene[];
      scenePlanMeta?: ScenePlanOutcomeMeta;
      assetPlanningSnapshot?: CreatorAssetPlanningSnapshot;
    }
  | { success: false; error: string; kind: "empty"; response: unknown }
  | { success: false; error: string; kind: "parse_error"; rawText: string };

type RawPlannedScene = {
  id?: string;
  subtitle?: string;
  sceneType?: string;
};

type RawScenePlan = {
  scenes?: RawPlannedScene[];
};

function resolveVoiceoverDurationMs(voiceoverDurationMs: unknown): number {
  const value = Number(voiceoverDurationMs);
  if (!Number.isFinite(value) || value <= 0) {
    return 30_000;
  }
  return Math.round(value);
}

function normalizeSceneType(value: unknown): SceneType | undefined {
  if (typeof value === "string" && VALID_SCENE_TYPES.has(value as SceneType)) {
    return value as SceneType;
  }
  return undefined;
}

function resolveSceneId(rawId: string | undefined, index: number, usedIds: Set<string>): string {
  let id = rawId?.trim() || String(index + 1);

  if (usedIds.has(id)) {
    id = `scene-${index + 1}`;
  }

  usedIds.add(id);
  return id;
}

function parseScenePlanJson(text: string, sceneCount: number): RawPlannedScene[] {
  let parsed: RawScenePlan;

  try {
    parsed = JSON.parse(cleanJsonText(text)) as RawScenePlan;
  } catch {
    throw new Error("Failed to parse scene plan JSON from model response");
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== sceneCount) {
    throw new Error(`Scene plan must contain exactly ${sceneCount} scenes`);
  }

  return parsed.scenes;
}

function buildPlannedScenes(rawScenes: RawPlannedScene[]): FootieScene[] {
  const usedIds = new Set<string>();

  return rawScenes.map((scene, index) => {
    const subtitle = String(scene.subtitle ?? "").trim();
    if (!subtitle) {
      throw new Error(`Scene ${index + 1} is missing a subtitle`);
    }

    const sceneType = normalizeSceneType(scene.sceneType);
    const id = resolveSceneId(scene.id !== undefined ? String(scene.id) : undefined, index, usedIds);

    return {
      id,
      start: 0,
      end: 0,
      duration: 1,
      subtitle,
      ...(sceneType ? { sceneType } : {}),
    };
  });
}

function buildStudioIntelligenceScenePlanMeta(
  diagnostics: StudioIntelligenceScenePlanDiagnostics,
): ScenePlanOutcomeMeta {
  return {
    source: "studio_intelligence",
    densityAdapted: diagnostics.densityAdapterStrategy !== "none",
  };
}

async function requestScenePlanText(
  model: string,
  prompt: string,
): Promise<{ rawText: string; response: unknown }> {
  const openai = getOpenAIClient();

  const response = await openai.responses.create({
    model,
    input: prompt,
    temperature: 0.7,
    max_output_tokens: SCENE_PLAN_MAX_OUTPUT_TOKENS,
  });

  const rawText = response.output_text?.trim() ?? "";
  return { rawText, response };
}

/**
 * Generates visual scene beats from an existing narration script and measured voiceover duration.
 * Narration text always comes from `script`; AI outputs subtitles/captions only.
 */
export async function generateScenesFromScriptAndAudio(
  input: GenerateScenesFromScriptAndAudioInput,
  options: GenerateScenesFromScriptAndAudioOptions = {},
): Promise<ScenePlanningResult> {
  const prompt = input.prompt.trim();
  const narration = input.script.narration.trim();
  const sceneCount = resolveSceneCount(input.sceneCount);
  const voiceoverDurationMs = resolveVoiceoverDurationMs(input.voiceoverDurationMs);

  if (!prompt) {
    return {
      success: false,
      error: "Prompt is required",
      kind: "parse_error",
      rawText: "",
    };
  }

  if (!narration) {
    return {
      success: false,
      error: "Script narration is required",
      kind: "parse_error",
      rawText: "",
    };
  }

  if (
    isStudioIntelligenceScenePlanEnabled({
      requestFlag: input.useStudioIntelligenceScenes,
    })
  ) {
    const studioIntelligenceResult = tryGenerateScenesFromStudioIntelligence({
      topic: prompt,
      narration,
      voiceoverDurationMs,
      sceneCount,
      scriptMode: input.scriptMode,
    });

    if (studioIntelligenceResult.success) {
      return {
        success: true,
        scenes: studioIntelligenceResult.scenes,
        scenePlanMeta: buildStudioIntelligenceScenePlanMeta(studioIntelligenceResult.diagnostics),
        assetPlanningSnapshot: studioIntelligenceResult.assetPlanningSnapshot,
      };
    }

    logStudioIntelligenceScenePlanDebug("falling back to AI scene planner", {
      reason: studioIntelligenceResult.reason,
      diagnostics: studioIntelligenceResult.diagnostics,
    });

    const aiScenesResult = await requestAiScenePlan({
      prompt,
      script: input.script,
      narration,
      voiceoverDurationMs,
      sceneCount,
      qualityMode: options.qualityMode,
      model: options.model,
    });

    if (!aiScenesResult.success) {
      return aiScenesResult;
    }

    return {
      ...aiScenesResult,
      scenePlanMeta: {
        source: "ai_fallback",
        densityAdapted: false,
      },
    };
  }

  return requestAiScenePlan({
    prompt,
    script: input.script,
    narration,
    voiceoverDurationMs,
    sceneCount,
    qualityMode: options.qualityMode,
    model: options.model,
  });
}

async function requestAiScenePlan(input: {
  prompt: string;
  script: StoryScript;
  narration: string;
  voiceoverDurationMs: number;
  sceneCount: number;
  qualityMode?: QualityMode;
  model?: string;
}): Promise<ScenePlanningResult> {
  const qualityMode = resolveQualityMode(input.qualityMode);
  const model = input.model ?? resolveScriptModel(qualityMode);
  const aiPrompt = buildScenePlanPrompt(
    input.prompt,
    { title: input.script.title, narration: input.narration },
    input.sceneCount,
    input.voiceoverDurationMs,
  );

  const { rawText, response } = await requestScenePlanText(model, aiPrompt);

  if (!rawText) {
    return {
      success: false,
      error: EMPTY_RESPONSE_ERROR,
      kind: "empty",
      response,
    };
  }

  try {
    const rawScenes = parseScenePlanJson(rawText, input.sceneCount);
    const plannedScenes = buildPlannedScenes(rawScenes);
    const timedScenes = attachEvenVoiceoverTiming(plannedScenes, input.voiceoverDurationMs);
    const withNarration = attachSceneNarrationFromScript(timedScenes, input.narration);
    const scenes = applyGeneratedStorySceneCaptions(withNarration);

    return { success: true, scenes };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : INVALID_JSON_ERROR,
      kind: "parse_error",
      rawText,
    };
  }
}
