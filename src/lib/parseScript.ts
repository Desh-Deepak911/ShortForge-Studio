import type { FootieScene, FootieScript } from "@/types/footiebitz";

type RawScene = {
  id?: string;
  duration?: number;
  subtitle?: string;
  imagePrompt?: string;
  imageSearchQuery?: string;
};

type RawFootieScript = {
  title?: string;
  hook?: string;
  caption?: string;
  hashtags?: unknown;
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
    throw new Error("No JSON object found in AI response");
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

export function parseFootieScript(text: string): FootieScript {
  let parsed: RawFootieScript;

  try {
    parsed = JSON.parse(cleanJsonText(text)) as RawFootieScript;
  } catch {
    throw new Error("Failed to parse script JSON from AI response");
  }

  if (!parsed.title?.trim()) {
    throw new Error("Script title is missing");
  }

  if (!parsed.hook?.trim()) {
    throw new Error("Script hook is missing");
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 5) {
    throw new Error("Script must contain exactly 5 scenes");
  }

  const usedIds = new Set<string>();

  const scenes: FootieScene[] = parsed.scenes.slice(0, 5).map((scene, index) => {
    const subtitle = String(scene.subtitle ?? "").trim();
    const imagePrompt = String(scene.imagePrompt ?? "").trim();
    const imageSearchQuery =
      String(scene.imageSearchQuery ?? "").trim() || imagePrompt;
    const duration = Math.max(3, Math.min(15, Number(scene.duration) || 5));

    if (!subtitle || !imagePrompt) {
      throw new Error(`Scene ${index + 1} is missing subtitle or imagePrompt`);
    }

    const id = resolveSceneId(
      scene.id !== undefined ? String(scene.id) : undefined,
      index,
      usedIds,
    );

    return { id, duration, subtitle, imagePrompt, imageSearchQuery };
  });

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  return {
    title: parsed.title.trim(),
    hook: parsed.hook.trim(),
    caption: String(parsed.caption ?? "").trim(),
    hashtags,
    scenes,
  };
}
