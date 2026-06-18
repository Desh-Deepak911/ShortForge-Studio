import { getOpenAIClient } from "@/lib/openai";
import { parseFootieScript } from "@/lib/parseScript";
import { buildFootieScriptPrompt } from "@/lib/prompts";
import type { FootieScript, Tone } from "@/types/footiebitz";

const SCRIPT_MAX_OUTPUT_TOKENS = 1200;

const EMPTY_RESPONSE_ERROR =
  "AI returned an empty response. Try Balanced mode or increase max output tokens.";
const INVALID_JSON_ERROR = "AI returned invalid JSON. Please try again.";

export type ScriptGenerationResult =
  | { success: true; data: FootieScript }
  | { success: false; error: string; kind: "empty"; response: unknown }
  | { success: false; error: string; kind: "invalid_json"; rawText: string };

function buildPrompt(topic: string, tone: Tone, duration: number): string {
  return [
    "Football YouTube Shorts scriptwriter. Output compact JSON only. No markdown or prose.",
    buildFootieScriptPrompt(topic, tone, duration),
  ].join("\n\n");
}

async function requestScriptText(
  model: string,
  prompt: string,
): Promise<{ rawText: string; response: unknown }> {
  const openai = getOpenAIClient();

  const response = await openai.responses.create({
    model,
    input: prompt,
    temperature: 0.7,
    max_output_tokens: SCRIPT_MAX_OUTPUT_TOKENS,
  });

  const rawText = response.output_text?.trim() ?? "";

  return { rawText, response };
}

export async function generateFootieScript(
  topic: string,
  tone: Tone,
  duration: number,
  model: string,
): Promise<ScriptGenerationResult> {
  const prompt = buildPrompt(topic, tone, duration);
  const { rawText, response } = await requestScriptText(model, prompt);

  if (!rawText) {
    return {
      success: false,
      error: EMPTY_RESPONSE_ERROR,
      kind: "empty",
      response,
    };
  }

  try {
    const data = parseFootieScript(rawText);
    return { success: true, data };
  } catch {
    return {
      success: false,
      error: INVALID_JSON_ERROR,
      kind: "invalid_json",
      rawText,
    };
  }
}
