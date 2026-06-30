import "server-only";

import { resolveQualityMode, resolveScriptModel } from "@/lib/ai";
import { DEFAULT_VOICEOVER_VOICE, resolveVoiceoverVoice } from "@/lib/utils/voiceoverOptions";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type { AudioFirstGenerationResult, FootieScript, StoryScript } from "@/features/story/types";
import {
  attachVoiceoverTimingMs,
  attachSceneNarrationFromScript,
  buildAudioFirstGenerationResult,
  createStoryScriptId,
  ensureTimelineItems,
  footieScriptFromAudioFirst,
  getStoryTotalDuration,
  secondsToMs,
} from "@/features/story/utils";
import type { QualityMode, ScriptMode, ScenePlanDevDebug, Tone } from "@/types/footiebitz";
import { resolveSceneCount } from "@/types/footiebitz";

import { generateScenesFromScriptAndAudio } from "./scene-planning.service";
import { resolveScenePlanDevDebug } from "@/features/story/utils/studio-intelligence-scene-plan-dev.utils";
import { generateStoryScript } from "./script-generation.service";
import {
  generateVoiceoverFromScript,
  type GenerateVoiceoverFromScriptOptions,
} from "./voiceover.service";

export interface GenerateAudioFirstStoryInput {
  prompt: string;
  sceneCount: number;
  voiceOptions?: GenerateVoiceoverFromScriptOptions;
  /** Optional overrides for script and scene AI generation. */
  tone?: Tone;
  duration?: number;
  qualityMode?: QualityMode;
  model?: string;
  scriptMode?: ScriptMode;
  context?: string;
  /** When research was enabled but returned no passable context. */
  researchAttemptedWithoutData?: boolean;
  top5RankedDataAvailable?: boolean;
  onProgress?: AudioFirstProgressCallback;
}

export type AudioFirstStoryGenerationResult =
  | { success: true; data: AudioFirstGenerationResult; footieScript: FootieScript }
  | { success: false; error: string };

export type ScriptOnlyStoryGenerationResult =
  | { success: true; footieScript: FootieScript; scriptLengthWarning?: string; scenePlanDevDebug?: ScenePlanDevDebug }
  | { success: false; error: string };

export interface GenerateScenesForReviewedScriptInput {
  prompt: string;
  title: string;
  narration: string;
  voiceoverDurationMs: number;
  sceneCount: number;
  tone?: Tone;
  qualityMode?: QualityMode;
  model?: string;
  scriptMode?: ScriptMode;
  useStudioIntelligenceScenes?: boolean;
  onProgress?: AudioFirstProgressCallback;
}

export type AudioFirstGenerationStep = 1 | 2 | 3 | 4;

export type AudioFirstProgressCallback = (
  step: AudioFirstGenerationStep,
  label: string,
) => void | Promise<void>;

export const AUDIO_FIRST_GENERATION_STEP_LABELS = [
  "Writing narration...",
  "Generating voiceover...",
  "Planning scenes...",
  "Building storyboard...",
] as const;

export interface ApplyAudioFirstTimingOutcome {
  /** Structured audio-first payload. */
  audioFirst: AudioFirstGenerationResult;
  /** FootieScript compatible with existing editor/preview/export flows. */
  footieScript: FootieScript;
  /** True when voiceover was generated and scene timings were fitted to it. */
  applied: boolean;
}

function confirmVoiceoverDurationMs(durationMs: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return Math.round(durationMs);
}

/**
 * Stage 1 only: generates title + narration without voiceover or scenes.
 * Used by the staged create workflow before script review.
 */
export async function generateScriptOnlyStory(
  input: GenerateAudioFirstStoryInput,
): Promise<ScriptOnlyStoryGenerationResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { success: false, error: "Prompt is required" };
  }

  const qualityMode = resolveQualityMode(input.qualityMode);
  const model = input.model ?? resolveScriptModel(qualityMode);
  const tone = input.tone ?? "dramatic";
  const duration = input.duration ?? 30;

  await input.onProgress?.(1, AUDIO_FIRST_GENERATION_STEP_LABELS[0]);

  const scriptResult = await generateStoryScript(prompt, {
    tone,
    duration,
    qualityMode,
    model,
    scriptMode: input.scriptMode,
    context: input.context,
    researchAttemptedWithoutData: input.researchAttemptedWithoutData,
    top5RankedDataAvailable: input.top5RankedDataAvailable,
  });

  if (!scriptResult.success) {
    return { success: false, error: scriptResult.error };
  }

  const script = scriptResult.data;

  return {
    success: true,
    footieScript: syncFootieScript({
      title: script.title,
      narration: script.narration,
      totalDuration: duration,
      scenes: [],
    }),
    scriptLengthWarning: scriptResult.lengthWarning,
  };
}

/**
 * Stages 3–4 for a reviewed script: plan scenes and fit timings to voiceover duration.
 * Voiceover audio remains on the client draft — only scene/timeline fields are returned.
 */
export async function generateScenesForReviewedScript(
  input: GenerateScenesForReviewedScriptInput,
): Promise<ScriptOnlyStoryGenerationResult> {
  const prompt = input.prompt.trim();
  const title = input.title.trim();
  const narration = input.narration.trim();
  const voiceoverDurationMs = confirmVoiceoverDurationMs(input.voiceoverDurationMs);

  if (!prompt) {
    return { success: false, error: "Prompt is required" };
  }

  if (!title || !narration) {
    return { success: false, error: "Title and narration are required" };
  }

  if (voiceoverDurationMs == null) {
    return { success: false, error: "Voiceover duration is required" };
  }

  const sceneCount = resolveSceneCount(input.sceneCount);
  const qualityMode = resolveQualityMode(input.qualityMode);
  const model = input.model ?? resolveScriptModel(qualityMode);
  const script: StoryScript = {
    id: createStoryScriptId(),
    title,
    narration,
    estimatedDurationMs: voiceoverDurationMs,
  };

  await input.onProgress?.(3, AUDIO_FIRST_GENERATION_STEP_LABELS[2]);

  const scenesResult = await generateScenesFromScriptAndAudio(
    {
      prompt,
      script,
      voiceoverDurationMs,
      sceneCount,
      scriptMode: input.scriptMode,
      useStudioIntelligenceScenes: input.useStudioIntelligenceScenes,
    },
    { qualityMode, model },
  );

  if (!scenesResult.success) {
    return { success: false, error: scenesResult.error };
  }

  await input.onProgress?.(4, AUDIO_FIRST_GENERATION_STEP_LABELS[3]);

  return {
    success: true,
    footieScript: syncFootieScript({
      title,
      narration,
      totalDuration: getStoryTotalDuration(scenesResult.scenes),
      scenes: scenesResult.scenes,
      timelineItems: ensureTimelineItems(scenesResult.scenes),
    }),
    scenePlanDevDebug: resolveScenePlanDevDebug(scenesResult.scenePlanMeta),
  };
}

/**
 * Full audio-first orchestration:
 * prompt → narration script → voiceover → scene plan → timeline with default transitions.
 */
export async function generateAudioFirstStory(
  input: GenerateAudioFirstStoryInput,
): Promise<AudioFirstStoryGenerationResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { success: false, error: "Prompt is required" };
  }

  const sceneCount = resolveSceneCount(input.sceneCount);
  const qualityMode = resolveQualityMode(input.qualityMode);
  const model = input.model ?? resolveScriptModel(qualityMode);
  const tone = input.tone ?? "dramatic";
  const duration = input.duration ?? 30;

  await input.onProgress?.(1, AUDIO_FIRST_GENERATION_STEP_LABELS[0]);

  const scriptResult = await generateStoryScript(prompt, {
    tone,
    duration,
    qualityMode,
    model,
  });

  if (!scriptResult.success) {
    return { success: false, error: scriptResult.error };
  }

  const script = scriptResult.data;

  try {
    await input.onProgress?.(2, AUDIO_FIRST_GENERATION_STEP_LABELS[1]);

    const voiceover = await generateVoiceoverFromScript(script, input.voiceOptions);

    const voiceoverDurationMs = confirmVoiceoverDurationMs(voiceover.durationMs);
    if (voiceoverDurationMs === null) {
      return { success: false, error: "Voiceover duration could not be resolved" };
    }

    if (voiceover.metadata?.durationSource === "estimated") {
      console.warn("audio-first: using estimated voiceover duration from narration word count");
    }

    await input.onProgress?.(3, AUDIO_FIRST_GENERATION_STEP_LABELS[2]);

    const scenesResult = await generateScenesFromScriptAndAudio(
      {
        prompt,
        script,
        voiceoverDurationMs,
        sceneCount,
      },
      { qualityMode, model },
    );

    if (!scenesResult.success) {
      return { success: false, error: scenesResult.error };
    }

    await input.onProgress?.(4, AUDIO_FIRST_GENERATION_STEP_LABELS[3]);

    const syncedStory = syncFootieScript({
      title: script.title,
      narration: script.narration,
      totalDuration: getStoryTotalDuration(scenesResult.scenes),
      scenes: scenesResult.scenes,
      timelineItems: ensureTimelineItems(scenesResult.scenes),
    });

    const data = buildAudioFirstGenerationResult(syncedStory, voiceover, script.id);

    return {
      success: true,
      data,
      footieScript: footieScriptFromAudioFirst(data),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Audio-first generation failed",
    };
  }
}

/**
 * Fits an existing FootieScript's scene timings to a newly generated voiceover.
 * Falls back to the incoming story when TTS or duration parsing fails.
 */
export async function applyAudioFirstTiming(
  story: FootieScript,
  voice: unknown = DEFAULT_VOICEOVER_VOICE,
): Promise<ApplyAudioFirstTimingOutcome> {
  const scriptId = createStoryScriptId();

  try {
    const resolvedVoice = resolveVoiceoverVoice(voice);
    const scriptForVoiceover = {
      id: scriptId,
      title: story.title,
      narration: story.narration,
      estimatedDurationMs: secondsToMs(story.totalDuration),
    };

    const voiceover = await generateVoiceoverFromScript(scriptForVoiceover, {
      voice: resolvedVoice,
      speed: story.voiceSettings?.speed,
    });

    const voiceoverDurationMs = confirmVoiceoverDurationMs(voiceover.durationMs);

    if (voiceoverDurationMs === null) {
      console.warn("audio-first: could not resolve voiceover duration; using script timings");
      const audioFirst = buildAudioFirstGenerationResult(story, null, scriptId);
      return {
        audioFirst,
        footieScript: footieScriptFromAudioFirst(audioFirst),
        applied: false,
      };
    }

    if (voiceover.metadata?.durationSource === "estimated") {
      console.warn("audio-first: using estimated voiceover duration from narration word count");
    }

    const weights = story.scenes.map((scene) => Math.max(1, scene.duration));
    const fittedScenes = attachVoiceoverTimingMs(
      story.scenes,
      voiceoverDurationMs,
      weights,
    );
    const scenesWithNarration = attachSceneNarrationFromScript(
      fittedScenes,
      story.narration,
    );

    const fittedStory: FootieScript = syncFootieScript({
      ...story,
      scenes: scenesWithNarration,
      totalDuration: getStoryTotalDuration(scenesWithNarration),
      timelineItems: ensureTimelineItems(scenesWithNarration, story.timelineItems),
    });

    const audioFirst = buildAudioFirstGenerationResult(fittedStory, voiceover, scriptId);

    return {
      audioFirst,
      footieScript: footieScriptFromAudioFirst(audioFirst),
      applied: true,
    };
  } catch (error) {
    console.error("audio-first timing fallback:", error);
    const audioFirst = buildAudioFirstGenerationResult(story, null, scriptId);
    return {
      audioFirst,
      footieScript: footieScriptFromAudioFirst(audioFirst),
      applied: false,
    };
  }
}
