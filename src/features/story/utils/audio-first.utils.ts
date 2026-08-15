import { estimateNarrationDurationMs } from "./narration-duration-budget.utils";
import { getMp3DurationSeconds } from "@/lib/audio";

import type {
  AudioFirstGenerationResult,
  StoryScript,
  VoiceoverDurationSource,
  VoiceoverMetadata,
  VoiceoverProvider,
  VoiceoverResult,
} from "@/features/story/types/audio-first.types";
import type { FootieScene, FootieScript, TimelineItem } from "@/features/story/types";

import { ensureTimelineItems } from "./timeline.utils";
import { getStoryTotalDuration } from "./scene.utils";
import { attachSceneNarrationFromScript } from "./caption.utils";

const TTS_MODEL = "tts-1";

export { estimateNarrationDurationMs } from "./narration-duration-budget.utils";

export function resolveVoiceoverDurationMs(
  mp3: ArrayBuffer,
  narration: string,
): { durationMs: number; durationSource: VoiceoverDurationSource } {
  const measuredMs = secondsToMs(getMp3DurationSeconds(mp3));

  if (measuredMs > 0) {
    return { durationMs: measuredMs, durationSource: "measured" };
  }

  return {
    durationMs: estimateNarrationDurationMs(narration),
    durationSource: "estimated",
  };
}

export function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

export function msToSeconds(ms: number): number {
  return ms / 1000;
}

/** Adds millisecond timing fields derived from second-based scene timing. */
export function withSceneTimingMs(scene: FootieScene): FootieScene {
  const durationMs = scene.durationMs ?? secondsToMs(scene.duration);
  const startMs = scene.startMs ?? secondsToMs(scene.start);
  const endMs = scene.endMs ?? secondsToMs(scene.end);

  return {
    ...scene,
    startMs,
    endMs,
    durationMs,
  };
}

export function withScenesTimingMs(scenes: FootieScene[]): FootieScene[] {
  return scenes.map(withSceneTimingMs);
}

export function createStoryScriptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function toStoryScript(script: FootieScript, id?: string): StoryScript {
  return {
    id: id ?? createStoryScriptId(),
    title: script.title,
    narration: script.narration,
    estimatedDurationMs: secondsToMs(script.totalDuration),
  };
}

export function toVoiceoverResultFromMp3(
  mp3: ArrayBuffer,
  options: {
    provider?: VoiceoverProvider;
    voice?: string;
    speed?: number;
    audioBase64?: string;
    audioUrl?: string;
    narration?: string;
    metadata?: VoiceoverMetadata;
  } = {},
): VoiceoverResult {
  const narration = options.narration ?? "";
  const { durationMs, durationSource } = resolveVoiceoverDurationMs(mp3, narration);

  return {
    durationMs,
    provider: options.provider ?? "openai",
    ...(options.audioBase64 ? { audioBase64: options.audioBase64 } : {}),
    ...(options.audioUrl ? { audioUrl: options.audioUrl } : {}),
    metadata: {
      format: "audio/mpeg",
      model: TTS_MODEL,
      durationSource,
      ...(options.voice ? { voice: options.voice } : {}),
      ...(options.speed != null ? { speed: options.speed } : {}),
      ...options.metadata,
    },
  };
}

export function buildAudioFirstGenerationResult(
  story: FootieScript,
  voiceover: VoiceoverResult | null,
  scriptId?: string,
): AudioFirstGenerationResult {
  const scenes = withScenesTimingMs(story.scenes);
  const timelineItems: TimelineItem[] =
    story.timelineItems ?? ensureTimelineItems(scenes);

  return {
    script: toStoryScript(story, scriptId),
    voiceover,
    scenes,
    timelineItems,
  };
}

export function footieScriptFromAudioFirst(result: AudioFirstGenerationResult): FootieScript {
  const timedScenes = withScenesTimingMs(result.scenes);
  const scenes = timedScenes.every((scene) => scene.narration?.trim())
    ? timedScenes
    : attachSceneNarrationFromScript(timedScenes, result.script.narration);

  return {
    title: result.script.title,
    narration: result.script.narration,
    totalDuration: getStoryTotalDuration(scenes),
    scenes,
    timelineItems: result.timelineItems,
    ...(result.voiceover?.audioUrl ? { voiceoverUrl: result.voiceover.audioUrl } : {}),
    ...(result.voiceover?.durationMs
      ? { voiceoverDurationMs: result.voiceover.durationMs }
      : {}),
    ...(result.voiceover?.audioUrl
      ? { voiceoverNarration: result.script.narration.trim() }
      : {}),
    ...(result.voiceover?.audioUrl ? { voiceoverSourceKind: "generated" as const } : {}),
    ...(result.voiceover?.metadata?.speed != null
      ? {
          voiceSettings: {
            speed: result.voiceover.metadata.speed,
            ...(result.voiceover.metadata.voice
              ? { voice: result.voiceover.metadata.voice }
              : {}),
          },
        }
      : {}),
  };
}
