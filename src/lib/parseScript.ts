import { getStoryTotalDuration, normalizeSceneTiming } from "@/lib/sceneTiming";
import { ensureTimelineItems, normalizeSceneIds } from "@/lib/timelineItems";
import type { FootieScene, FootieScript } from "@/types/footiebitz";

type RawScene = {
  id?: string;
  start?: number;
  end?: number;
  duration?: number;
  subtitle?: string;
};

type RawFootieScript = {
  title?: string;
  totalDuration?: number;
  narration?: string;
  scenes?: RawScene[];
};

export function cleanJsonText(text: string): string {
  const trimmed = text.trim();
  const withoutFences = trimmed
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }

  return withoutFences.slice(start, end + 1);
}

/** @deprecated Use cleanJsonText */
export function extractJson(text: string): string {
  return cleanJsonText(text);
}

function resolveSceneId(rawId: string | undefined, index: number, usedIds: Set<string>): string {
  let id = rawId?.trim() || String(index + 1);

  if (usedIds.has(id)) {
    id = `scene-${index + 1}`;
  }

  usedIds.add(id);
  return id;
}

function resolveSceneDuration(scene: RawScene): number {
  const duration = Number(scene.duration);
  if (Number.isFinite(duration) && duration > 0) {
    return Math.max(1, Math.round(duration));
  }

  const start = Number(scene.start);
  const end = Number(scene.end);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.max(1, Math.round(end - start));
  }

  return 0;
}

function hasContiguousSceneTiming(rawScenes: RawScene[]): boolean {
  if (rawScenes.length === 0) {
    return false;
  }

  let expectedStart = 0;

  for (const scene of rawScenes) {
    const start = Number(scene.start);
    const end = Number(scene.end);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return false;
    }

    if (Math.round(start) !== expectedStart) {
      return false;
    }

    expectedStart = Math.round(end);
  }

  return true;
}

function resolveScenes(rawScenes: RawScene[]): FootieScene[] {
  const usedIds = new Set<string>();

  const sceneInputs = rawScenes.map((scene, index) => {
    const subtitle = String(scene.subtitle ?? "").trim();
    const duration = resolveSceneDuration(scene);

    if (!subtitle) {
      throw new Error(`Scene ${index + 1} is missing a subtitle`);
    }

    if (!duration) {
      throw new Error(`Scene ${index + 1} is missing duration or valid start/end times`);
    }

    const id = resolveSceneId(
      scene.id !== undefined ? String(scene.id) : undefined,
      index,
      usedIds,
    );

    return { id, duration, subtitle };
  });

  if (hasContiguousSceneTiming(rawScenes)) {
    return rawScenes.map((scene, index) => {
      const start = Math.round(Number(scene.start));
      const end = Math.round(Number(scene.end));
      const duration = Math.max(1, end - start);

      return {
        id: sceneInputs[index].id,
        start,
        end,
        duration,
        subtitle: sceneInputs[index].subtitle,
      };
    });
  }

  // start/end are placeholders — normalizeSceneTiming recomputes them.
  return normalizeSceneTiming(sceneInputs.map((s) => ({ ...s, start: 0, end: 0 })));
}

function resolveTotalDuration(scenes: FootieScene[]): number {
  return getStoryTotalDuration(scenes);
}

export function normalizeFootieStory(story: FootieScript): FootieScript {
  const scenes = normalizeSceneTiming(
    normalizeSceneIds(story.scenes ?? []).map((scene) => ({ ...scene, start: 0, end: 0 })),
  );

  return {
    title: story.title.trim(),
    narration: story.narration.trim(),
    totalDuration: getStoryTotalDuration(scenes),
    scenes,
    timelineItems: ensureTimelineItems(scenes, story.timelineItems),
    ...(story.voiceoverUrl ? { voiceoverUrl: story.voiceoverUrl } : {}),
  };
}

export function parseFootieScript(text: string): FootieScript {
  let parsed: RawFootieScript;

  try {
    parsed = JSON.parse(cleanJsonText(text)) as RawFootieScript;
  } catch {
    throw new Error("Failed to parse story JSON from model response");
  }

  if (!parsed.title?.trim()) {
    throw new Error("Story title is missing");
  }

  if (!parsed.narration?.trim()) {
    throw new Error("Story narration is missing");
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 5) {
    throw new Error("Story must contain exactly 5 scenes");
  }

  const scenes = resolveScenes(parsed.scenes.slice(0, 5));
  const totalDuration = resolveTotalDuration(scenes);

  return {
    title: parsed.title.trim(),
    narration: parsed.narration.trim(),
    totalDuration,
    scenes,
    timelineItems: ensureTimelineItems(scenes),
  };
}
