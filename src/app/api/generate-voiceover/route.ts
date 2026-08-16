import { NextResponse } from "next/server";

import { generateVoiceover } from "@/features/story/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GenerateVoiceoverRequest {
  narration?: string;
  /** @deprecated Use `narration`. */
  text?: string;
  voice?: string;
  speed?: number;
  stylePreset?: string;
  expressiveDelivery?: boolean;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function mapOpenAIError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("OPENAI_API_KEY")) {
      return "Server configuration error";
    }
    return error.message;
  }
  return "Failed to create narration";
}

export async function POST(request: Request) {
  try {
    let body: GenerateVoiceoverRequest;

    try {
      body = (await request.json()) as GenerateVoiceoverRequest;
    } catch {
      return jsonError("Invalid request body", 400);
    }

    const narration = body.narration?.trim() || body.text?.trim();
    if (!narration) {
      return jsonError("Narration is required", 400);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "your_key_here") {
      return jsonError("Server configuration error", 500);
    }

    const voiceover = await generateVoiceover({
      narration,
      voice: body.voice,
      speed: body.speed,
      stylePreset: body.stylePreset,
      expressiveDelivery: body.expressiveDelivery,
    });

    return new NextResponse(new Uint8Array(voiceover.audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="footiebitz-voiceover.mp3"',
        "Cache-Control": "no-store",
        "X-Voiceover-Duration-Ms": String(voiceover.durationMs),
        ...(voiceover.metadata?.speed != null
          ? { "X-Voiceover-Speed": String(voiceover.metadata.speed) }
          : {}),
        ...(voiceover.metadata?.speedRendering
          ? { "X-Voiceover-Speed-Rendering": voiceover.metadata.speedRendering }
          : {}),
      },
    });
  } catch (error) {
    console.error("generate-voiceover error:", error);
    return jsonError(mapOpenAIError(error), 500);
  }
}
