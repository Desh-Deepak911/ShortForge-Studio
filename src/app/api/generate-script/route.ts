import { NextResponse } from "next/server";

import { generateFootieScript } from "@/lib/generateFootieScript";
import { resolveQualityMode, resolveScriptModel } from "@/lib/scriptModels";
import type {
  GenerateScriptRequest,
  GenerateScriptResponse,
  Tone,
} from "@/types/footiebitz";

const VALID_TONES: Tone[] = ["dramatic", "funny", "tactical", "news", "emotional"];
const DEFAULT_TONE: Tone = "dramatic";
const DEFAULT_DURATION = 30;

export const dynamic = "force-dynamic";

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
  return "Failed to generate script";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
    const qualityMode = resolveQualityMode(body.qualityMode);
    const model = resolveScriptModel(qualityMode);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "your_key_here") {
      return jsonResponse(
        { success: false, error: "Server configuration error" },
        500,
      );
    }

    const result = await generateFootieScript(topic, tone, duration, model);

    if (!result.success) {
      if (result.kind === "empty") {
        console.error("FULL OPENAI RESPONSE:", safeStringify(result.response));
        return jsonResponse({ success: false, error: result.error }, 500);
      }

      console.error("OpenAI invalid JSON:", result.rawText);
      return jsonResponse({ success: false, error: result.error }, 500);
    }

    return jsonResponse({ success: true, data: result.data });
  } catch (error) {
    console.error("generate-script error:", error);
    return jsonResponse({ success: false, error: mapOpenAIError(error) }, 500);
  }
}
