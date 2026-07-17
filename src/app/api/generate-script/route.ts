import { NextResponse } from "next/server";

import {
  buildScenesOnlyStoryResponse,
  generateAudioFirstStory,
  generateScenesForReviewedScript,
  generateScriptOnlyStory,
  normalizeFootieStory,
} from "@/features/story/services";
import {
  buildCreatorTemplatePromptContext,
  resolveCreatorTemplatePromptBlock,
} from "@/features/creator-templates/creator-template-prompt.utils";
import { resolveScriptResearchContext } from "@/features/research/utils/script-research-context.server.utils";
import {
  buildNeutralResearchEvidence,
} from "@/features/hook-engine/integration";
import type {
  HookDiagnostics,
  HookPlanSnapshot,
  HookSelectableStrategyId,
} from "@/features/hook-engine";
import {
  HOOK_MAX_USER_AUTHORED_HOOK_CHARS,
  assertRequestedStrategyAllowed,
  isHookStyleSelection,
  parseHookStyleSelection,
  requestedStrategyIdFromHookStyle,
  validateWriteMyOwnOpening,
} from "@/features/hook-engine";
import {
  assertStoryStrategyAllowed,
  formatStrategyIdFromStoryStrategy,
  isStoryStrategySelection,
  parseStoryStrategySelection,
  type StoryStrategySelection,
} from "@/features/retention-story/presentation";
import { resolveQualityMode, resolveScriptModel } from "@/lib/ai";
import type { AudioFirstGenerationResult, FootieScript } from "@/features/story/types";
import type {
  GenerateScriptMode,
  GenerateScriptProgressEvent,
  GenerateScriptRequest,
  GenerateScriptResponse,
  GenerationLoadingStep,
  GenerateScriptResearchPreview,
  ScriptMode,
  Tone,
} from "@/types/footiebitz";
import { resolveSceneCount, resolveScriptMode } from "@/types/footiebitz";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";

const VALID_TONES: Tone[] = ["dramatic", "funny", "tactical", "news", "emotional"];
const DEFAULT_TONE: Tone = "dramatic";
const DEFAULT_DURATION = 30;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ProgressEmitter = (step: GenerationLoadingStep, label: string) => void | Promise<void>;

function jsonResponse(body: GenerateScriptResponse, status = 200) {
  return NextResponse.json(body, { status });
}

function resolveTone(tone: unknown): Tone {
  if (typeof tone === "string" && VALID_TONES.includes(tone as Tone)) {
    return tone as Tone;
  }
  return DEFAULT_TONE;
}

function resolveDuration(duration: unknown): number {
  const value = Number(duration);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_DURATION;
  }
  return Math.max(15, Math.min(60, Math.round(value)));
}

function mapOpenAIError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("OPENAI_API_KEY")) {
      return "Server configuration error";
    }
    return error.message;
  }
  return "Failed to create story";
}

function buildStoryResponse(story: FootieScript): FootieScript {
  return normalizeFootieStory(story);
}

function buildHookResponseEnvelope(input?: {
  snapshot?: HookPlanSnapshot;
  diagnostics?: HookDiagnostics;
}): Pick<GenerateScriptResponse, "hookPlan" | "hookDiagnostics"> {
  if (!input?.diagnostics) {
    return {};
  }
  return {
    ...(input.snapshot ? { hookPlan: input.snapshot } : {}),
    hookDiagnostics: input.diagnostics,
  };
}

function buildRetentionResponseEnvelope(
  input?: {
    planSnapshot?: import("@/features/retention-story").RetentionStoryPlanSnapshot;
    validationSummary?: import("@/features/retention-story").RetentionValidationSummary;
    diagnostics?: import("@/features/retention-story").RetentionProductionSafeDiagnostics;
    generationDisposition?: import("@/features/retention-story").RetentionGenerationDispositionSummary;
  },
  options: { readonly allowSnapshots?: boolean } = {},
): Pick<
  GenerateScriptResponse,
  | "retentionPlan"
  | "retentionValidation"
  | "retentionDiagnostics"
  | "generationDisposition"
> {
  if (!input) return {};
  const allowSnapshots = options.allowSnapshots === true;
  return {
    ...(allowSnapshots && input.planSnapshot
      ? { retentionPlan: input.planSnapshot }
      : {}),
    ...(allowSnapshots && input.validationSummary
      ? { retentionValidation: input.validationSummary }
      : {}),
    ...(input.diagnostics
      ? { retentionDiagnostics: input.diagnostics }
      : {}),
    ...(allowSnapshots && input.generationDisposition
      ? { generationDisposition: input.generationDisposition }
      : {}),
  };
}

function buildGenerateScriptResponse(
  footieScript: FootieScript,
  audioFirst: AudioFirstGenerationResult,
  applied: boolean,
  hookEnvelope?: {
    snapshot?: HookPlanSnapshot;
    diagnostics?: HookDiagnostics;
  },
  retentionEnvelope?: {
    planSnapshot?: import("@/features/retention-story").RetentionStoryPlanSnapshot;
    validationSummary?: import("@/features/retention-story").RetentionValidationSummary;
    diagnostics?: import("@/features/retention-story").RetentionProductionSafeDiagnostics;
    generationDisposition?: import("@/features/retention-story").RetentionGenerationDispositionSummary;
  },
): GenerateScriptResponse {
  const hook = buildHookResponseEnvelope(hookEnvelope);
  const retention = buildRetentionResponseEnvelope(retentionEnvelope, {
    allowSnapshots: true,
  });

  if (!applied || !audioFirst.voiceover?.audioBase64) {
    return { success: true, data: footieScript, audioFirst, ...hook, ...retention };
  }

  return {
    success: true,
    data: footieScript,
    audioFirst,
    audioFirstApplied: true,
    voiceoverAudioBase64: audioFirst.voiceover.audioBase64,
    ...hook,
    ...retention,
  };
}

interface GenerationParams {
  topic: string;
  tone: Tone;
  duration: number;
  qualityMode: ReturnType<typeof resolveQualityMode>;
  sceneCount: number;
  model: string;
  mode: GenerateScriptMode;
  scriptMode: ScriptMode;
  context?: string;
  enableResearch?: boolean;
  researchPreview?: GenerateScriptResearchPreview;
  title?: string;
  narration?: string;
  voiceoverDurationMs?: number;
  useStudioIntelligenceScenes?: boolean;
  templateId?: CreatorTemplateId;
  templatePromptBlock?: string;
  openingStyleAdvisory?: string;
  userAuthoredHook?: string;
  requestedStrategyId?: HookSelectableStrategyId;
  hookStyle?: import("@/features/hook-engine").HookStyleSelection;
  /** Creator Story Strategy — Auto / omit = legacy default (Sprint 10G). */
  formatStrategyId?: StoryStrategySelection;
  /** Sprint 10H.3 Fact Handling. */
  factHandlingMode?: "verified_facts_only" | "creative_premise";
  premiseDetails?: string;
  /** Flexible (default) vs Precise — opt-in strict adaptation policy. */
  creationReliabilityMode?: "flexible" | "precise";
  /** True when the request body explicitly included qualityMode. */
  qualityModeExplicit: boolean;
}

type GenerationSuccess = {
  ok: true;
  response: GenerateScriptResponse;
  /** Always false after Sprint 7D — legacy one-shot script fallback retired. */
  usedFallback: false;
};

type GenerationFailure = {
  ok: false;
  response: GenerateScriptResponse;
  status: number;
};

async function resolveNarrationGenerationContext(params: {
  topic: string;
  scriptMode: ScriptMode;
  manualContext?: string;
  enableResearch?: boolean;
  researchPreview?: GenerateScriptResearchPreview;
}) {
  return resolveScriptResearchContext(params);
}

async function runGeneration(
  params: GenerationParams,
  emitProgress?: ProgressEmitter,
): Promise<GenerationSuccess | GenerationFailure> {
  if (params.mode === "scenes-only") {
    const title = params.title;
    const narration = params.narration;
    const voiceoverDurationMs = Number(params.voiceoverDurationMs);

    if (!title?.trim() || !narration?.trim()) {
      return {
        ok: false,
        response: { success: false, error: "Title and narration are required" },
        status: 400,
      };
    }

    if (!Number.isFinite(voiceoverDurationMs) || voiceoverDurationMs <= 0) {
      return {
        ok: false,
        response: { success: false, error: "Valid voiceover duration is required" },
        status: 400,
      };
    }

    const scenesResult = await generateScenesForReviewedScript({
      prompt: params.topic,
      title,
      narration,
      voiceoverDurationMs,
      sceneCount: params.sceneCount,
      tone: params.tone,
      qualityMode: params.qualityMode,
      model: params.model,
      scriptMode: params.scriptMode,
      useStudioIntelligenceScenes: params.useStudioIntelligenceScenes === true,
      onProgress: emitProgress,
    });

    if (!scenesResult.success) {
      return {
        ok: false,
        response: { success: false, error: scenesResult.error },
        status: 500,
      };
    }

    return {
      ok: true,
      usedFallback: false,
      response: {
        success: true,
        // Preserve reviewed title/narration byte-for-byte; do not trim via buildStoryResponse.
        data: buildScenesOnlyStoryResponse(scenesResult.footieScript),
        scenePlanDevDebug: scenesResult.scenePlanDevDebug,
        assetPlanningSnapshot: scenesResult.assetPlanningSnapshot,
      },
    };
  }

  const resolvedContext = await resolveNarrationGenerationContext({
    topic: params.topic,
    scriptMode: params.scriptMode,
    manualContext: params.context,
    enableResearch: params.enableResearch,
    researchPreview: params.researchPreview,
  });

  const researchEvidence = buildNeutralResearchEvidence({
    assembled: resolvedContext.assembledContext,
    graphContext: resolvedContext.graphContext,
    narrativePlan: resolvedContext.narrativePlan,
    researchAttempted: params.enableResearch === true,
    researchApplied: resolvedContext.researchApplied,
    manualContext: params.context,
  });

  const narrationShared = {
    // Generation prose for Hook/advisory — may include assembled research.
    context: resolvedContext.context,
    // Creator-authored notes only — Retention identity authority.
    creatorManualContext: params.context ?? null,
    researchAttemptedWithoutData:
      params.enableResearch === true && !resolvedContext.researchApplied,
    researchApplied: resolvedContext.researchApplied,
    top5RankedDataAvailable: resolvedContext.top5RankedDataAvailable,
    templatePromptBlock: params.templatePromptBlock,
    templateId: params.templateId,
    openingStyleAdvisory: params.openingStyleAdvisory,
    userAuthoredHook: params.userAuthoredHook,
    requestedStrategyId: params.requestedStrategyId,
    hookStyle: params.hookStyle,
    formatStrategyId: params.formatStrategyId ?? "auto",
    ...(params.factHandlingMode
      ? { factHandlingMode: params.factHandlingMode }
      : {}),
    ...(params.premiseDetails != null
      ? { premiseDetails: params.premiseDetails }
      : {}),
    ...(params.creationReliabilityMode
      ? { creationReliabilityMode: params.creationReliabilityMode }
      : {}),
    researchEvidence,
    graphContext: resolvedContext.graphContext,
    assembledContext: resolvedContext.assembledContext,
    narrativePlan: resolvedContext.narrativePlan,
    qualityModeExplicit: params.qualityModeExplicit,
  };

  if (params.mode === "script-only") {
    const scriptOnlyResult = await generateScriptOnlyStory({
      prompt: params.topic,
      sceneCount: params.sceneCount,
      tone: params.tone,
      duration: params.duration,
      qualityMode: params.qualityMode,
      model: params.model,
      scriptMode: params.scriptMode,
      ...narrationShared,
      onProgress: emitProgress,
    });

    if (!scriptOnlyResult.success) {
      return {
        ok: false,
        response: {
          success: false,
          error: scriptOnlyResult.error,
          ...buildHookResponseEnvelope(scriptOnlyResult.hookEnvelope),
          // Failures: diagnostics only — never retentionPlan / retentionValidation.
          ...buildRetentionResponseEnvelope(scriptOnlyResult.retentionEnvelope, {
            allowSnapshots: false,
          }),
        },
        status: 500,
      };
    }

    return {
      ok: true,
      usedFallback: false,
      response: {
        success: true,
        data: buildStoryResponse(scriptOnlyResult.footieScript),
        generationContext: resolvedContext.context,
        researchApplied: resolvedContext.researchApplied,
        researchWarning: resolvedContext.researchWarning,
        scriptLengthWarning: scriptOnlyResult.scriptLengthWarning,
        ...buildHookResponseEnvelope(scriptOnlyResult.hookEnvelope),
        ...buildRetentionResponseEnvelope(scriptOnlyResult.retentionEnvelope, {
          allowSnapshots: true,
        }),
      },
    };
  }

  // Full audio-first — Retention commit gate must pass before voiceover.
  const audioFirstResult = await generateAudioFirstStory({
    prompt: params.topic,
    sceneCount: params.sceneCount,
    tone: params.tone,
    duration: params.duration,
    qualityMode: params.qualityMode,
    model: params.model,
    scriptMode: params.scriptMode,
    ...narrationShared,
    onProgress: emitProgress,
  });

  if (!audioFirstResult.success) {
    console.warn("audio-first pipeline: generation failed");
    return {
      ok: false,
      response: {
        success: false,
        error: audioFirstResult.error,
        ...buildHookResponseEnvelope(audioFirstResult.hookEnvelope),
        // Failures: diagnostics only — never retentionPlan / retentionValidation.
        ...buildRetentionResponseEnvelope(audioFirstResult.retentionEnvelope, {
          allowSnapshots: false,
        }),
      },
      status: 500,
    };
  }

  return {
    ok: true,
    usedFallback: false,
    response: buildGenerateScriptResponse(
      audioFirstResult.footieScript,
      audioFirstResult.data,
      true,
      audioFirstResult.hookEnvelope,
      audioFirstResult.retentionEnvelope,
    ),
  };
}

function streamResponse(
  handler: (emit: ProgressEmitter) => Promise<GenerationSuccess | GenerationFailure>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const { createGenerateScriptStreamTerminalController } = await import(
        "@/lib/utils/generateScriptStreamTerminal"
      );

      const terminal = createGenerateScriptStreamTerminalController((event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      });

      const emitProgress: ProgressEmitter = (step, label) => {
        terminal.emit({
          type: "progress",
          step,
          label: label as GenerateScriptProgressEvent["label"],
        });
      };

      try {
        const outcome = await handler(emitProgress);

        if (!outcome.ok) {
          terminal.emit({
            type: "error",
            error: outcome.response.error ?? "Failed to create story",
            ...(outcome.response.hookPlan
              ? { hookPlan: outcome.response.hookPlan }
              : {}),
            ...(outcome.response.hookDiagnostics
              ? { hookDiagnostics: outcome.response.hookDiagnostics }
              : {}),
            ...(outcome.response.retentionDiagnostics
              ? { retentionDiagnostics: outcome.response.retentionDiagnostics }
              : {}),
          });
          return;
        }

        terminal.emit({
          type: "complete",
          ...outcome.response,
          usedFallback: outcome.usedFallback,
        });
      } catch (error) {
        console.error("generate-script stream error:", error);
        terminal.emit({ type: "error", error: mapOpenAIError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}

export async function POST(request: Request) {
  try {
    let body: GenerateScriptRequest;

    try {
      body = (await request.json()) as GenerateScriptRequest;
    } catch {
      return jsonResponse({ success: false, error: "Invalid request body" }, 400);
    }

    const topic = body.topic?.trim();
    if (!topic) {
      return jsonResponse({ success: false, error: "Topic is required" }, 400);
    }

    const tone = resolveTone(body.tone);
    const duration = resolveDuration(body.duration);
    const scriptMode = resolveScriptMode(body.scriptMode);
    const context = body.context?.trim() || undefined;
    const enableResearch = body.enableResearch === true || body.footballResearch === true;
    const mode =
      body.mode === "script-only" || body.mode === "scenes-only" ? body.mode : "full";
    const qualityModeExplicit = body.qualityMode != null;
    // Retention contract: legacy absence on narration paths → balanced
    // (not lib/ai cheap default). Scenes-only keeps resolveQualityMode.
    const qualityMode =
      !qualityModeExplicit && mode !== "scenes-only"
        ? "balanced"
        : resolveQualityMode(body.qualityMode);
    const sceneCount = resolveSceneCount(body.sceneCount);
    const model = resolveScriptModel(qualityMode);
    const templateContext = buildCreatorTemplatePromptContext({
      templateId: body.templateId,
      templatePromptHints: body.templatePromptHints,
    });

    // Hook Style (7E.6) + Story Strategy (10G) — ignore for scenes-only;
    // reject forged/unknown/incompatible. Never silently rewrite explicit intent.
    let userAuthoredHook: string | undefined;
    let requestedStrategyId: HookSelectableStrategyId | undefined;
    let hookStyle: import("@/features/hook-engine").HookStyleSelection | undefined;
    let formatStrategyId: StoryStrategySelection | undefined;
    let factHandlingMode: "verified_facts_only" | "creative_premise" | undefined;
    let creationReliabilityMode: "flexible" | "precise" | undefined;
    let premiseDetails: string | undefined;

    if (mode !== "scenes-only") {
      if (body.hookStyle != null && !isHookStyleSelection(body.hookStyle)) {
        return jsonResponse(
          { success: false, error: "Invalid Hook style selection." },
          400,
        );
      }
      hookStyle = parseHookStyleSelection(body.hookStyle) ?? "auto";

      if (body.formatStrategyId != null && !isStoryStrategySelection(body.formatStrategyId)) {
        return jsonResponse(
          { success: false, error: "Invalid Story strategy selection." },
          400,
        );
      }
      formatStrategyId = parseStoryStrategySelection(body.formatStrategyId) ?? "auto";
      try {
        assertStoryStrategyAllowed(formatStrategyId, duration);
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Incompatible Story strategy for this duration.",
          },
          400,
        );
      }

      if (hookStyle === "user_written") {
        const opening = validateWriteMyOwnOpening(
          typeof body.userAuthoredHook === "string" ? body.userAuthoredHook : "",
        );
        if (!opening.ok) {
          return jsonResponse({ success: false, error: opening.message }, 400);
        }
        // Accept validated text as-is — never silently rewrite over-limit openings.
        userAuthoredHook = opening.text;
      } else {
        // Explicit library selection — do not accept userAuthoredHook alongside.
        const candidate = requestedStrategyIdFromHookStyle(hookStyle);
        if (candidate) {
          try {
            assertRequestedStrategyAllowed(candidate, scriptMode);
            requestedStrategyId = candidate;
          } catch (error) {
            return jsonResponse(
              {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Incompatible Hook style for this content type.",
              },
              400,
            );
          }
        }
        // Auto: omit requestedStrategyId; optional legacy userAuthoredHook still honored.
        if (hookStyle === "auto") {
          userAuthoredHook = body.userAuthoredHook?.trim() || undefined;
          if (userAuthoredHook) {
            userAuthoredHook = userAuthoredHook.slice(0, HOOK_MAX_USER_AUTHORED_HOOK_CHARS);
          }
        }
      }

      if (
        body.factHandlingMode != null &&
        body.factHandlingMode !== "verified_facts_only" &&
        body.factHandlingMode !== "creative_premise"
      ) {
        return jsonResponse(
          { success: false, error: "Invalid Fact Handling selection." },
          400,
        );
      }
      factHandlingMode =
        body.factHandlingMode === "creative_premise"
          ? "creative_premise"
          : "verified_facts_only";
      if (
        factHandlingMode === "creative_premise" &&
        typeof body.premiseDetails === "string"
      ) {
        premiseDetails = body.premiseDetails.slice(0, 2_400);
      }

      if (
        body.creationReliabilityMode != null &&
        body.creationReliabilityMode !== "flexible" &&
        body.creationReliabilityMode !== "precise"
      ) {
        return jsonResponse(
          { success: false, error: "Invalid Generation mode selection." },
          400,
        );
      }
      if (body.creationReliabilityMode === "precise") {
        creationReliabilityMode = "precise";
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "your_key_here") {
      return jsonResponse(
        { success: false, error: "Server configuration error" },
        500,
      );
    }

    const params: GenerationParams = {
      topic,
      tone,
      duration,
      qualityMode,
      sceneCount,
      model,
      mode,
      scriptMode,
      context,
      enableResearch,
      researchPreview: body.researchPreview,
      title: body.title,
      narration: body.narration,
      voiceoverDurationMs: body.voiceoverDurationMs,
      useStudioIntelligenceScenes: body.useStudioIntelligenceScenes === true,
      ...(templateContext?.templateId ? { templateId: templateContext.templateId } : {}),
      templatePromptBlock: resolveCreatorTemplatePromptBlock({
        templateId: body.templateId,
        templatePromptHints: body.templatePromptHints,
      }) || undefined,
      ...(templateContext?.hints.openingStyle
        ? { openingStyleAdvisory: templateContext.hints.openingStyle }
        : {}),
      ...(userAuthoredHook ? { userAuthoredHook } : {}),
      ...(requestedStrategyId ? { requestedStrategyId } : {}),
      ...(hookStyle ? { hookStyle } : {}),
      ...(formatStrategyId
        ? { formatStrategyId: formatStrategyIdFromStoryStrategy(formatStrategyId) }
        : {}),
      ...(factHandlingMode ? { factHandlingMode } : {}),
      ...(premiseDetails != null ? { premiseDetails } : {}),
      ...(creationReliabilityMode
        ? { creationReliabilityMode }
        : {}),
      qualityModeExplicit,
    };

    if (body.stream) {
      return streamResponse((emitProgress) => runGeneration(params, emitProgress));
    }

    const outcome = await runGeneration(params);

    if (!outcome.ok) {
      return jsonResponse(outcome.response, outcome.status);
    }

    return jsonResponse(outcome.response);
  } catch (error) {
    console.error("generate-script error:", error);
    return jsonResponse({ success: false, error: mapOpenAIError(error) }, 500);
  }
}
