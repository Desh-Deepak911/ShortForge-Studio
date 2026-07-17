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
import type { CreatorAssetPlanningSnapshot } from "@/features/editor/creator-asset-planning/creator-asset-planning.types";
import {
  generateVoiceoverFromScript,
  type GenerateVoiceoverFromScriptOptions,
} from "./voiceover.service";
import {
  buildNeutralResearchEvidence,
  storyScriptFromHookedNarration,
  type HookNeutralResearchEvidence,
} from "@/features/hook-engine/integration";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type {
  HookDiagnostics,
  HookPlanSnapshot,
  HookSelectableStrategyId,
  HookStyleSelection,
} from "@/features/hook-engine";
import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import type { NarrativePlan } from "@/features/intelligence/prompts/narrative-plan.types";
import {
  runRetentionProductionNarration,
  type RetentionProductionSafeDiagnostics,
  type RetentionStoryPlanSnapshot,
  type RetentionValidationSummary,
  type RetentionPlannerCallback,
  type RetentionComposerCallback,
  type RetentionBodyRewriteCallback,
  type RetentionHookRunner,
} from "@/features/retention-story";

export interface RetentionGenerationEnvelope {
  readonly planSnapshot?: RetentionStoryPlanSnapshot;
  readonly validationSummary?: RetentionValidationSummary;
  readonly diagnostics?: RetentionProductionSafeDiagnostics;
  readonly generationDisposition?: import("@/features/retention-story").RetentionGenerationDispositionSummary;
}

export interface GenerateAudioFirstStoryInput {
  prompt: string;
  sceneCount: number;
  voiceOptions?: GenerateVoiceoverFromScriptOptions;
  /** Optional overrides for script and scene AI generation. */
  tone?: Tone;
  duration?: number;
  /**
   * Explicit creator quality selection. When omitted, Retention contract
   * defaults to balanced for narration; VO/scenes still resolve via lib/ai.
   */
  qualityMode?: QualityMode;
  /** True when the HTTP body explicitly included qualityMode. */
  qualityModeExplicit?: boolean;
  model?: string;
  scriptMode?: ScriptMode;
  /**
   * Combined generation prose (may include assembled research) for Hook /
   * advisory consumers. Not Retention creator-context identity authority.
   */
  context?: string;
  /**
   * Original creator-authored manual notes only. Must not be assembled research.
   */
  creatorManualContext?: string | null;
  /** When research was enabled but returned no passable context. */
  researchAttemptedWithoutData?: boolean;
  top5RankedDataAvailable?: boolean;
  /** Advisory creator template prompt block for script-only generation. */
  templatePromptBlock?: string;
  templateId?: CreatorTemplateId;
  openingStyleAdvisory?: string;
  userAuthoredHook?: string;
  /** Explicit allowlisted Hook Style — Auto = omit (Sprint 7E.6). */
  requestedStrategyId?: HookSelectableStrategyId;
  hookStyle?: HookStyleSelection;
  /** Creator Story Strategy — Auto / omit = legacy default (Sprint 10G). */
  formatStrategyId?: import("@/features/retention-story/presentation").StoryStrategySelection;
  /** Sprint 10H.3 Fact Handling. */
  factHandlingMode?: "verified_facts_only" | "creative_premise" | string;
  premiseDetails?: string;
  /** Flexible (default) vs Precise adaptation policy. */
  creationReliabilityMode?: "flexible" | "precise";
  researchEvidence?: HookNeutralResearchEvidence;
  researchApplied?: boolean;
  graphContext?: GraphContext | null;
  assembledContext?: AssembledContext | null;
  narrativePlan?: NarrativePlan | null;
  onProgress?: AudioFirstProgressCallback;
  /**
   * Optional deterministic doubles for Sprint 7E / 10F.3 path QA.
   * Production leaves these unset. Narration doubles enter via Retention
   * composer / Hook runner — never a parallel Hook-only modelCall.
   */
  retentionPlanner?: RetentionPlannerCallback | null;
  retentionComposer?: RetentionComposerCallback | null;
  retentionRewriteComposer?: RetentionBodyRewriteCallback | null;
  retentionHookRunner?: RetentionHookRunner;
  voiceoverFromScript?: typeof generateVoiceoverFromScript;
  scenesFromScriptAndAudio?: typeof generateScenesFromScriptAndAudio;
}

export type AudioFirstStoryGenerationResult =
  | {
      success: true;
      data: AudioFirstGenerationResult;
      footieScript: FootieScript;
      hookEnvelope?: {
        snapshot: HookPlanSnapshot;
        diagnostics: HookDiagnostics;
      };
      retentionEnvelope?: RetentionGenerationEnvelope;
    }
  | {
      success: false;
      error: string;
      hookEnvelope?: { diagnostics: HookDiagnostics; snapshot?: HookPlanSnapshot };
      retentionEnvelope?: RetentionGenerationEnvelope;
    };

export type ScriptOnlyStoryGenerationResult =
  | {
      success: true;
      footieScript: FootieScript;
      scriptLengthWarning?: string;
      scenePlanDevDebug?: ScenePlanDevDebug;
      assetPlanningSnapshot?: CreatorAssetPlanningSnapshot;
      hookEnvelope?: {
        snapshot: HookPlanSnapshot;
        diagnostics: HookDiagnostics;
      };
      retentionEnvelope?: RetentionGenerationEnvelope;
    }
  | {
      success: false;
      error: string;
      hookEnvelope?: { diagnostics: HookDiagnostics; snapshot?: HookPlanSnapshot };
      retentionEnvelope?: RetentionGenerationEnvelope;
    };

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
  /**
   * Optional deterministic double for Sprint 7E.1 scenes-only QA.
   * Production and the HTTP API leave this unset — never accepted from request JSON.
   */
  scenesFromScriptAndAudio?: typeof generateScenesFromScriptAndAudio;
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

function buildRetentionSharedInput(
  input: GenerateAudioFirstStoryInput,
  generationPath: "script_only" | "audio_first_full",
) {
  const prompt = input.prompt.trim();
  const tone = input.tone ?? "dramatic";
  const duration = input.duration ?? 30;
  const scriptMode = input.scriptMode ?? "story";
  const model =
    input.model ??
    resolveScriptModel(
      input.qualityModeExplicit === true
        ? resolveQualityMode(input.qualityMode)
        : resolveQualityMode(input.qualityMode ?? "balanced"),
    );

  const creatorManualContext =
    input.creatorManualContext !== undefined
      ? input.creatorManualContext
      : null;

  const researchEvidence =
    input.researchEvidence ??
    buildNeutralResearchEvidence({
      assembled: input.assembledContext,
      graphContext: input.graphContext,
      narrativePlan: input.narrativePlan,
      researchAttempted:
        input.researchAttemptedWithoutData === true ||
        input.researchApplied === true,
      researchApplied: input.researchApplied === true,
      ...(creatorManualContext != null
        ? { manualContext: creatorManualContext }
        : {}),
    });

  return {
    topic: prompt,
    durationSec: duration,
    generationPath,
    scriptMode,
    tone,
    ...(input.qualityModeExplicit === true || input.qualityMode != null
      ? { qualityMode: resolveQualityMode(input.qualityMode) }
      : {}),
    model,
    templateId: input.templateId,
    templatePromptBlock: input.templatePromptBlock,
    openingStyleAdvisory: input.openingStyleAdvisory,
    userAuthoredHook: input.userAuthoredHook,
    requestedStrategyId: input.requestedStrategyId,
    hookStyle: input.hookStyle,
    formatStrategyId: input.formatStrategyId ?? "auto",
    // Creator-context authority — never assembled/research prose.
    ...(creatorManualContext != null && String(creatorManualContext).trim()
      ? { manualContext: String(creatorManualContext).trim() }
      : {}),
    // Hook/advisory generation prose only.
    ...(input.context != null && input.context.trim()
      ? { generationContext: input.context.trim() }
      : {}),
    ...(input.factHandlingMode
      ? { factHandlingMode: input.factHandlingMode }
      : {}),
    ...(input.premiseDetails != null
      ? { premiseDetails: input.premiseDetails }
      : {}),
    ...(input.creationReliabilityMode
      ? { creationReliabilityMode: input.creationReliabilityMode }
      : {}),
    researchApplied: input.researchApplied,
    researchAttemptedWithoutData: input.researchAttemptedWithoutData,
    researchEvidence,
    graphContext: input.graphContext,
    assembledContext: input.assembledContext,
    narrativePlan: input.narrativePlan,
    ...(input.retentionPlanner !== undefined
      ? { planner: input.retentionPlanner }
      : {}),
    ...(input.retentionComposer !== undefined
      ? { composer: input.retentionComposer }
      : {}),
    ...(input.retentionRewriteComposer !== undefined
      ? { rewriteComposer: input.retentionRewriteComposer }
      : {}),
    ...(input.retentionHookRunner
      ? { hookRunner: input.retentionHookRunner }
      : {}),
  } as const;
}

function retentionFailureEnvelope(
  result: Awaited<ReturnType<typeof runRetentionProductionNarration>>,
): {
  error: string;
  hookEnvelope?: { diagnostics: HookDiagnostics; snapshot?: HookPlanSnapshot };
  retentionEnvelope: RetentionGenerationEnvelope;
} {
  if (result.ok) {
    throw new Error("expected retention failure");
  }
  return {
    error: result.error,
    hookEnvelope: result.hookDiagnostics
      ? {
          diagnostics: result.hookDiagnostics,
          ...(result.hookPlan ? { snapshot: result.hookPlan } : {}),
        }
      : undefined,
    // Overall failure must never carry plan/validation snapshots (10F.3A).
    retentionEnvelope: {
      diagnostics: result.retentionDiagnostics,
    },
  };
}

/** Downstream failure after Retention commit — diagnostics only, never snapshots. */
function postCommitFailureRetentionEnvelope(
  approved: {
    readonly safeDiagnostics: RetentionProductionSafeDiagnostics;
  },
): RetentionGenerationEnvelope {
  return Object.freeze({
    diagnostics: Object.freeze({
      ...approved.safeDiagnostics,
      failureCategory: undefined,
      safeReasonIds: Object.freeze([
        ...approved.safeDiagnostics.safeReasonIds,
        "downstream_generation_failure",
      ]),
    }),
  });
}

/**
 * Stage 1 only: Retention production narration → commit → FootieScript.
 * Used by the staged create workflow before script review.
 * Sprint 10F.3: canonical Retention orchestrator (not Hook-only parallel path).
 */
export async function generateScriptOnlyStory(
  input: GenerateAudioFirstStoryInput,
): Promise<ScriptOnlyStoryGenerationResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { success: false, error: "Prompt is required" };
  }

  await input.onProgress?.(1, AUDIO_FIRST_GENERATION_STEP_LABELS[0]);

  const shared = buildRetentionSharedInput(input, "script_only");
  const retention = await runRetentionProductionNarration({
    ...shared,
    apiMode: "script-only",
  });

  if (!retention.ok) {
    const failed = retentionFailureEnvelope(retention);
    return {
      success: false,
      error: failed.error,
      ...(failed.hookEnvelope ? { hookEnvelope: failed.hookEnvelope } : {}),
      retentionEnvelope: failed.retentionEnvelope,
    };
  }

  const approved = retention.approved;
  const script = storyScriptFromHookedNarration({
    title: approved.title,
    approvedNarration: approved.narration,
    lengthWarning: approved.lengthWarning,
  });

  return {
    success: true,
    footieScript: syncFootieScript({
      title: script.title,
      narration: script.narration,
      totalDuration: shared.durationSec,
      scenes: [],
    }),
    scriptLengthWarning: approved.lengthWarning ?? script.lengthWarning,
    hookEnvelope: {
      snapshot: approved.hookPlan,
      diagnostics: approved.hookDiagnostics,
    },
    retentionEnvelope: {
      planSnapshot: approved.planSnapshot,
      validationSummary: approved.validationSummary,
      diagnostics: approved.safeDiagnostics,
      ...(approved.generationDisposition
        ? { generationDisposition: approved.generationDisposition }
        : {}),
    },
  };
}

/**
 * Stages 3–4 for a reviewed script: plan scenes and fit timings to voiceover duration.
 * Voiceover audio remains on the client draft — only scene/timeline fields are returned.
 * Scenes-only never runs Retention planner/composer/Hook/rewrite.
 */
export async function generateScenesForReviewedScript(
  input: GenerateScenesForReviewedScriptInput,
): Promise<ScriptOnlyStoryGenerationResult> {
  const prompt = input.prompt.trim();
  const title = input.title;
  const narration = input.narration;
  const voiceoverDurationMs = confirmVoiceoverDurationMs(input.voiceoverDurationMs);

  if (!prompt) {
    return { success: false, error: "Prompt is required" };
  }

  // Validate non-emptiness after trim, but pass original title/narration through unchanged.
  if (!title.trim() || !narration.trim()) {
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

  const scenesFn = input.scenesFromScriptAndAudio ?? generateScenesFromScriptAndAudio;
  const scenesResult = await scenesFn(
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
    assetPlanningSnapshot: scenesResult.assetPlanningSnapshot,
  };
}

/**
 * Full audio-first orchestration (Sprint 10F.3):
 * Retention terminal Pass → commit → voiceover → scene plan → timeline.
 * Voiceover never begins before the Retention commit gate passes.
 */
export async function generateAudioFirstStory(
  input: GenerateAudioFirstStoryInput,
): Promise<AudioFirstStoryGenerationResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { success: false, error: "Prompt is required" };
  }

  const sceneCount = resolveSceneCount(input.sceneCount);
  const qualityMode = resolveQualityMode(
    input.qualityModeExplicit === true
      ? input.qualityMode
      : (input.qualityMode ?? "balanced"),
  );
  const model = input.model ?? resolveScriptModel(qualityMode);

  await input.onProgress?.(1, AUDIO_FIRST_GENERATION_STEP_LABELS[0]);

  const shared = buildRetentionSharedInput(input, "audio_first_full");
  const retention = await runRetentionProductionNarration({
    ...shared,
    apiMode: "full",
  });

  if (!retention.ok) {
    const failed = retentionFailureEnvelope(retention);
    return {
      success: false,
      error: failed.error,
      ...(failed.hookEnvelope ? { hookEnvelope: failed.hookEnvelope } : {}),
      retentionEnvelope: failed.retentionEnvelope,
    };
  }

  const approved = retention.approved;
  const script = storyScriptFromHookedNarration({
    title: approved.title,
    approvedNarration: approved.narration,
    lengthWarning: approved.lengthWarning,
  });

  const hookEnvelope = {
    snapshot: approved.hookPlan,
    diagnostics: approved.hookDiagnostics,
  };
  const successRetentionEnvelope: RetentionGenerationEnvelope = {
    planSnapshot: approved.planSnapshot,
    validationSummary: approved.validationSummary,
    diagnostics: approved.safeDiagnostics,
    ...(approved.generationDisposition
      ? { generationDisposition: approved.generationDisposition }
      : {}),
  };

  try {
    await input.onProgress?.(2, AUDIO_FIRST_GENERATION_STEP_LABELS[1]);

    const voiceoverFn = input.voiceoverFromScript ?? generateVoiceoverFromScript;
    const voiceover = await voiceoverFn(script, input.voiceOptions);

    const voiceoverDurationMs = confirmVoiceoverDurationMs(voiceover.durationMs);
    if (voiceoverDurationMs === null) {
      return {
        success: false,
        error: "Voiceover duration could not be resolved",
        hookEnvelope,
        retentionEnvelope: postCommitFailureRetentionEnvelope(approved),
      };
    }

    if (voiceover.metadata?.durationSource === "estimated") {
      console.warn("audio-first: using estimated voiceover duration from narration word count");
    }

    await input.onProgress?.(3, AUDIO_FIRST_GENERATION_STEP_LABELS[2]);

    const scenesFn = input.scenesFromScriptAndAudio ?? generateScenesFromScriptAndAudio;
    const scenesResult = await scenesFn(
      {
        prompt,
        script,
        voiceoverDurationMs,
        sceneCount,
        scriptMode: shared.scriptMode,
      },
      { qualityMode, model },
    );

    if (!scenesResult.success) {
      return {
        success: false,
        error: "Scene planning failed. Please try again.",
        hookEnvelope,
        retentionEnvelope: postCommitFailureRetentionEnvelope(approved),
      };
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
      hookEnvelope,
      retentionEnvelope: successRetentionEnvelope,
    };
  } catch {
    return {
      success: false,
      error: "Audio-first generation failed. Please try again.",
      hookEnvelope,
      retentionEnvelope: postCommitFailureRetentionEnvelope(approved),
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
