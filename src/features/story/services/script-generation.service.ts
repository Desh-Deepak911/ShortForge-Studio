import "server-only";

import { getOpenAIClient, buildStoryScriptPrompt, resolveQualityMode, resolveScriptModel } from "@/lib/ai";
import type { StoryScriptWordBudget } from "@/lib/ai";
import type { StoryScript } from "@/features/story/types";
import {
  countWords,
  createStoryScriptId,
  enforceNarrationWordBudget,
  estimateNarrationDurationMs,
  getNarrationWordBudget,
  isWithinNarrationScriptBudget,
  resolveNarrationMaxOutputTokens,
  type NarrationWordBudget,
} from "@/features/story/utils";
import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";

import { cleanJsonText } from "./story-parse.service";

const EMPTY_RESPONSE_ERROR =
  "The model returned an empty response. Try Balanced mode or increase max output tokens.";
const INVALID_JSON_ERROR = "The model returned invalid JSON. Please try again.";
export const SCRIPT_LENGTH_COMPRESSION_FAILED_WARNING =
  "Generated script exceeded the duration budget and automatic compression failed; review narration length before voiceover.";
const SCRIPT_LENGTH_TRUNCATED_AFTER_COMPRESSION_WARNING =
  "Script was trimmed to fit the duration budget after compression.";

export interface GenerateStoryScriptOptions {
  tone?: Tone;
  /** Target spoken duration in seconds — guides narration length only. */
  duration?: number;
  qualityMode?: QualityMode;
  model?: string;
  scriptMode?: ScriptMode;
  context?: string;
  /** When research was enabled but returned no passable context. */
  researchAttemptedWithoutData?: boolean;
  /** Explicit top_5 ranked-data signal from research resolution. */
  top5RankedDataAvailable?: boolean;
  /** Advisory creator template prompt block for script-only generation. */
  templatePromptBlock?: string;
}

export type StoryScriptGenerationResult =
  | { success: true; data: StoryScript; lengthWarning?: string }
  | { success: false; error: string; kind: "empty"; response: unknown }
  | { success: false; error: string; kind: "parse_error"; rawText: string };

type RawStoryScript = {
  title?: string;
  narration?: string;
};

type ParsedStoryScript = StoryScript;

function resolveDuration(duration: unknown): number {
  const value = Number(duration);
  if (!Number.isFinite(value) || value <= 0) {
    return 30;
  }
  return Math.max(15, Math.min(60, Math.round(value)));
}

function toPromptWordBudget(budget: NarrationWordBudget): StoryScriptWordBudget {
  return {
    idealMinWords: budget.idealMinWords,
    idealMaxWords: budget.idealMaxWords,
    hardCapWords: budget.hardCapWords,
    maxDurationSeconds: budget.maxDurationSeconds,
  };
}

function buildPrompt(
  prompt: string,
  tone: Tone,
  duration: number,
  scriptMode: ScriptMode,
  wordBudget: NarrationWordBudget,
  context?: string,
  promptOptions: {
    researchAttemptedWithoutData?: boolean;
    top5RankedDataAvailable?: boolean;
    templatePromptBlock?: string;
  } = {},
): string {
  return [
    "FootieBitz narration writer. Output JSON only. No markdown or prose.",
    buildStoryScriptPrompt(
      prompt,
      tone,
      duration,
      scriptMode,
      context,
      toPromptWordBudget(wordBudget),
      promptOptions,
    ),
  ].join("\n\n");
}

function buildScriptCompressionPrompt(input: {
  script: ParsedStoryScript;
  topic: string;
  tone: Tone;
  duration: number;
  scriptMode: ScriptMode;
  wordBudget: NarrationWordBudget;
}): string {
  const { script, topic, tone, duration, scriptMode, wordBudget } = input;

  return [
    "FootieBitz narration editor. Compress an existing script for length. Output JSON only. No markdown or prose.",
    `Content brief: "${topic}"`,
    `Script mode: ${scriptMode.replace(/_/g, " ")} — preserve this mode's voice, structure, and emphasis while compressing.`,
    `Tone: ${tone} — preserve tone; dramatic intensity must not increase length.`,
    "",
    "Script length budget (hard rules):",
    `- Target duration: ${duration}s`,
    `- Hard maximum word count: ${wordBudget.hardCapWords}`,
    `- Maximum spoken duration: ~${wordBudget.maxDurationSeconds}s`,
    "- Do not exceed the hard maximum word count.",
    "",
    "Compression rules (strict):",
    "- Shorten the narration to fit within the hard maximum word count.",
    "- Preserve factual accuracy — do not change, invent, or remove core facts.",
    "- Do not add new facts, stats, events, or claims.",
    "- Keep the selected script mode and tone.",
    "- Keep the title if still suitable; change it only if the compressed narration no longer fits.",
    "- Shorter is better than complete — cut lower-priority detail first.",
    "",
    "Original script:",
    JSON.stringify({ title: script.title, narration: script.narration }, null, 2),
    "",
    'Output shape: { "title": string, "narration": string }',
  ].join("\n");
}

function parseStoryScriptJson(text: string, existingId?: string): ParsedStoryScript {
  let parsed: RawStoryScript;

  try {
    parsed = JSON.parse(cleanJsonText(text)) as RawStoryScript;
  } catch {
    throw new Error("Failed to parse story script JSON from model response");
  }

  const title = parsed.title?.trim();
  const narration = parsed.narration?.trim();

  if (!title) {
    throw new Error("Story title is missing");
  }

  if (!narration) {
    throw new Error("Story narration is missing");
  }

  return {
    id: existingId ?? createStoryScriptId(),
    title,
    narration,
    estimatedDurationMs: estimateNarrationDurationMs(narration),
  };
}

function withLengthMetrics(script: ParsedStoryScript): ParsedStoryScript {
  return {
    ...script,
    estimatedDurationMs: estimateNarrationDurationMs(script.narration),
  };
}

async function requestStoryScriptText(
  model: string,
  prompt: string,
  duration: number,
): Promise<{ rawText: string; response: unknown }> {
  const openai = getOpenAIClient();

  const response = await openai.responses.create({
    model,
    input: prompt,
    temperature: 0.7,
    max_output_tokens: resolveNarrationMaxOutputTokens(duration),
  });

  const rawText = response.output_text?.trim() ?? "";

  return { rawText, response };
}

async function generateStoryScriptAttempt(
  model: string,
  topic: string,
  tone: Tone,
  duration: number,
  scriptMode: ScriptMode,
  wordBudget: NarrationWordBudget,
  context: string | undefined,
  promptOptions: {
    researchAttemptedWithoutData?: boolean;
    top5RankedDataAvailable?: boolean;
    templatePromptBlock?: string;
  } = {},
): Promise<{ rawText: string; response: unknown }> {
  const fullPrompt = buildPrompt(
    topic,
    tone,
    duration,
    scriptMode,
    wordBudget,
    context,
    promptOptions,
  );
  return requestStoryScriptText(model, fullPrompt, duration);
}

async function compressStoryScript(input: {
  model: string;
  script: ParsedStoryScript;
  topic: string;
  tone: Tone;
  duration: number;
  scriptMode: ScriptMode;
  wordBudget: NarrationWordBudget;
}): Promise<{ script: ParsedStoryScript | null; rawText: string }> {
  const prompt = buildScriptCompressionPrompt(input);

  try {
    const { rawText } = await requestStoryScriptText(
      input.model,
      prompt,
      input.duration,
    );

    if (!rawText) {
      return { script: null, rawText: "" };
    }

    return {
      script: parseStoryScriptJson(rawText, input.script.id),
      rawText,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("script-generation: compression pass failed", error);
    }

    return { script: null, rawText: "" };
  }
}

function finalizeCompressedScript(
  script: ParsedStoryScript,
  wordBudget: NarrationWordBudget,
): { script: ParsedStoryScript; lengthWarning?: string } {
  if (isWithinNarrationScriptBudget(script.narration, wordBudget)) {
    return { script: withLengthMetrics(script) };
  }

  const enforced = enforceNarrationWordBudget(script.narration, wordBudget);

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "script-generation: narration trimmed after compression",
      `${countWords(script.narration)} → ${countWords(enforced.narration)} words (cap ${wordBudget.hardCapWords})`,
    );
  }

  return {
    script: withLengthMetrics({
      ...script,
      narration: enforced.narration,
    }),
    lengthWarning: SCRIPT_LENGTH_TRUNCATED_AFTER_COMPRESSION_WARNING,
  };
}

async function enforceScriptLengthBudget(input: {
  model: string;
  script: ParsedStoryScript;
  topic: string;
  tone: Tone;
  duration: number;
  scriptMode: ScriptMode;
  wordBudget: NarrationWordBudget;
}): Promise<{ script: ParsedStoryScript; lengthWarning?: string }> {
  const original = withLengthMetrics(input.script);

  if (isWithinNarrationScriptBudget(original.narration, input.wordBudget)) {
    return { script: original };
  }

  const compression = await compressStoryScript({
    model: input.model,
    script: original,
    topic: input.topic,
    tone: input.tone,
    duration: input.duration,
    scriptMode: input.scriptMode,
    wordBudget: input.wordBudget,
  });

  if (!compression.script) {
    return {
      script: original,
      lengthWarning: SCRIPT_LENGTH_COMPRESSION_FAILED_WARNING,
    };
  }

  return finalizeCompressedScript(compression.script, input.wordBudget);
}

/**
 * Generates a narration-only story script (title + full voiceover text).
 * Does not generate scenes, captions, or image prompts.
 */
export async function generateStoryScript(
  prompt: string,
  options: GenerateStoryScriptOptions = {},
): Promise<StoryScriptGenerationResult> {
  const topic = prompt.trim();
  if (!topic) {
    return {
      success: false,
      error: "Prompt is required",
      kind: "parse_error",
      rawText: "",
    };
  }

  const tone = options.tone ?? "dramatic";
  const duration = resolveDuration(options.duration);
  const wordBudget = getNarrationWordBudget(duration);
  const qualityMode = resolveQualityMode(options.qualityMode);
  const model = options.model ?? resolveScriptModel(qualityMode);
  const scriptMode = options.scriptMode ?? "story";
  const context = options.context?.trim() || undefined;
  const promptOptions = {
    researchAttemptedWithoutData: options.researchAttemptedWithoutData === true,
    top5RankedDataAvailable: options.top5RankedDataAvailable,
    ...(options.templatePromptBlock?.trim()
      ? { templatePromptBlock: options.templatePromptBlock.trim() }
      : {}),
  };

  const { rawText, response } = await generateStoryScriptAttempt(
    model,
    topic,
    tone,
    duration,
    scriptMode,
    wordBudget,
    context,
    promptOptions,
  );

  if (!rawText) {
    return {
      success: false,
      error: EMPTY_RESPONSE_ERROR,
      kind: "empty",
      response,
    };
  }

  try {
    const parsed = parseStoryScriptJson(rawText);
    const { script, lengthWarning } = await enforceScriptLengthBudget({
      model,
      script: parsed,
      topic,
      tone,
      duration,
      scriptMode,
      wordBudget,
    });

    return {
      success: true,
      data: lengthWarning ? { ...script, lengthWarning } : script,
      lengthWarning,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : INVALID_JSON_ERROR,
      kind: "parse_error",
      rawText,
    };
  }
}
