import type { FootieScene, FootieScript } from "@/features/story/types";

/** Placeholder copy that must never enter rebuilt global narration. */
const PLACEHOLDER_NARRATION_TEXTS = new Set([
  "add subtitle...",
  "add caption...",
  "add narration...",
]);

export const NO_USABLE_NARRATION_WARNING =
  "No scene narration or captions found to rebuild narration.";

export type RebuildNarrationResult =
  | { ok: true; script: FootieScript; narration: string }
  | { ok: false; reason: "no_usable_text"; script: FootieScript };

function isPlaceholderNarrationText(text: string): boolean {
  return PLACEHOLDER_NARRATION_TEXTS.has(text.trim().toLowerCase());
}

function resolveSceneCaptionOrSubtitle(scene: FootieScene): string | undefined {
  const withCaption = scene as FootieScene & { caption?: string };
  return withCaption.caption ?? scene.subtitle;
}

/**
 * Resolves spoken text for one scene: subtitleText → subtitle/caption → narration.
 * User-edited subtitle text wins over derived narration excerpts.
 * Placeholders and empty strings are ignored.
 */
export function resolveSceneNarrationSourceText(scene: FootieScene): string | null {
  const candidates = [
    scene.subtitleText,
    resolveSceneCaptionOrSubtitle(scene),
    scene.narration,
  ];

  for (const candidate of candidates) {
    const text = candidate?.trim() ?? "";
    if (!text || isPlaceholderNarrationText(text)) {
      continue;
    }
    return text;
  }

  return null;
}

/**
 * Builds global `script.narration` from the current scene order.
 * Does not mutate the input. Preserves scenes, media, audio, and metadata.
 */
export function rebuildNarrationFromScenes(script: FootieScript): RebuildNarrationResult {
  const parts: string[] = [];

  for (const scene of script.scenes) {
    const text = resolveSceneNarrationSourceText(scene);
    if (text) {
      parts.push(text);
    }
  }

  if (parts.length === 0) {
    return {
      ok: false,
      reason: "no_usable_text",
      script,
    };
  }

  const narration = parts.join(" ").replace(/\s+/g, " ").trim();

  return {
    ok: true,
    narration,
    script: {
      ...script,
      narration,
    },
  };
}
