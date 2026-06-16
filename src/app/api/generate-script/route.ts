import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

import { buildFootieScriptPrompt } from "@/lib/prompts";
import type {
  FootieScene,
  FootieScript,
  GenerateScriptRequest,
  GenerateScriptResponse,
  Tone,
} from "@/types/footiebitz";

const VALID_TONES: Tone[] = ["dramatic", "funny", "tactical", "news", "emotional"];
const DEFAULT_TONE: Tone = "dramatic";
const DEFAULT_DURATION = 30;
const GEMINI_MODEL = "gemini-2.0-flash";

export const dynamic = "force-dynamic";

type RawScene = {
  id?: string;
  duration?: number;
  subtitle?: string;
  imagePrompt?: string;
};

type RawFootieScript = {
  title?: string;
  hook?: string;
  caption?: string;
  hashtags?: unknown;
  scenes?: RawScene[];
};

function jsonResponse(body: GenerateScriptResponse, status = 200) {
  return NextResponse.json(body, { status });
}

function extractJson(text: string): string {
  const withoutFences = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in AI response");
  }

  return withoutFences.slice(start, end + 1);
}

function parseFootieScript(text: string): FootieScript {
  let parsed: RawFootieScript;

  try {
    parsed = JSON.parse(extractJson(text)) as RawFootieScript;
  } catch {
    throw new Error("Failed to parse script JSON from AI response");
  }

  if (!parsed.title?.trim()) {
    throw new Error("Script title is missing");
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 5) {
    throw new Error("Script must contain 5 to 6 scenes");
  }

  const scenes: FootieScene[] = parsed.scenes.slice(0, 6).map((scene, index) => {
    const subtitle = String(scene.subtitle ?? "").trim();
    const imagePrompt = String(scene.imagePrompt ?? "").trim();
    const duration = Math.max(3, Math.min(8, Number(scene.duration) || 5));

    if (!subtitle || !imagePrompt) {
      throw new Error(`Scene ${index + 1} is missing subtitle or imagePrompt`);
    }

    const id = String(scene.id ?? "").trim() || `scene-${index + 1}`;

    return { id, duration, subtitle, imagePrompt };
  });

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  return {
    title: parsed.title.trim(),
    hook: String(parsed.hook ?? "").trim(),
    caption: String(parsed.caption ?? "").trim(),
    hashtags,
    scenes,
  };
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_key_here") {
      return jsonResponse(
        { success: false, error: "Server configuration error" },
        500,
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(
      buildFootieScriptPrompt(topic, tone, duration),
    );

    const text = result.response.text();
    if (!text?.trim()) {
      return jsonResponse(
        { success: false, error: "Empty response from AI model" },
        502,
      );
    }

    const script = parseFootieScript(text);

    return jsonResponse({ success: true, data: script });
  } catch (error) {
    console.error("generate-script error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to generate script";

    return jsonResponse({ success: false, error: message }, 500);
  }
}
