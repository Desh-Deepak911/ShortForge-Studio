import type { FootieScene } from "@/features/story/types";

/** Placeholder copy that must never be treated as spoken text. */
const PLACEHOLDER_SPOKEN_TEXTS = new Set([
  "add subtitle...",
  "add caption...",
  "add narration...",
]);

export type SceneSpokenTextSource = "subtitleText" | "narration" | "empty" | "placeholder";

export interface SceneSpokenTextResolution {
  text: string;
  source: SceneSpokenTextSource;
  isUsable: boolean;
  reason?: string;
}

function isPlaceholderSpokenText(text: string): boolean {
  return PLACEHOLDER_SPOKEN_TEXTS.has(text.trim().toLowerCase());
}

/**
 * Authoritative spoken text for one scene.
 * Priority: subtitleText (user override) → narration (generated/default).
 * Written captions (`subtitle`, `caption`) are visual-only and never used here.
 */
export function resolveSceneSpokenText(scene: FootieScene): SceneSpokenTextResolution {
  const subtitleText = scene.subtitleText?.trim() ?? "";
  if (subtitleText) {
    if (isPlaceholderSpokenText(subtitleText)) {
      return {
        text: "",
        source: "placeholder",
        isUsable: false,
        reason: "placeholder_subtitle_text",
      };
    }

    return {
      text: subtitleText,
      source: "subtitleText",
      isUsable: true,
    };
  }

  const narration = scene.narration?.trim() ?? "";
  if (narration) {
    if (isPlaceholderSpokenText(narration)) {
      return {
        text: "",
        source: "placeholder",
        isUsable: false,
        reason: "placeholder_narration",
      };
    }

    return {
      text: narration,
      source: "narration",
      isUsable: true,
    };
  }

  return {
    text: "",
    source: "empty",
    isUsable: false,
    reason: "missing_spoken_text",
  };
}
