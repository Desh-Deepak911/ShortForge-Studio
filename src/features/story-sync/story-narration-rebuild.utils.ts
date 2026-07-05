import type { FootieScene, FootieScript } from "@/features/story/types";

import {
  resolveSceneSpokenText,
  type SceneSpokenTextSource,
} from "./story-spoken-text.utils";

export const NO_USABLE_NARRATION_WARNING =
  "No scene narration or captions found to rebuild narration.";

export const UNSAFE_NARRATION_REBUILD_WARNING =
  "Some scenes are missing spoken text. Add narrated subtitles or narration before updating narration.";

export type NarrationRebuildSourceType = SceneSpokenTextSource;

export interface NarrationRebuildSourceEntry {
  sceneId: string;
  sceneIndex: number;
  captionMode: FootieScene["captionMode"];
  sourceType: NarrationRebuildSourceType;
  text: string | null;
  isUsable: boolean;
  skipReason?: string;
}

export interface NarrationRebuildDiagnostics {
  contributingSceneCount: number;
  skippedSceneCount: number;
  missingSpokenTextSceneCount: number;
  narrationLength: number;
  sources: NarrationRebuildSourceEntry[];
}

export type RebuildNarrationResult =
  | {
      ok: true;
      script: FootieScript;
      narration: string;
      diagnostics: NarrationRebuildDiagnostics;
    }
  | {
      ok: false;
      reason: "no_usable_text" | "unsafe_partial_rebuild";
      script: FootieScript;
      diagnostics: NarrationRebuildDiagnostics;
      blockedSceneNumbers: number[];
    };

function resolveSceneRebuildSource(scene: FootieScene): NarrationRebuildSourceEntry {
  const resolved = resolveSceneSpokenText(scene);

  return {
    sceneId: scene.id,
    sceneIndex: -1,
    captionMode: scene.captionMode,
    sourceType: resolved.source,
    text: resolved.isUsable ? resolved.text : null,
    isUsable: resolved.isUsable,
    skipReason: resolved.isUsable ? undefined : resolved.reason,
  };
}

function buildDiagnostics(
  sources: NarrationRebuildSourceEntry[],
  narrationLength: number,
): NarrationRebuildDiagnostics {
  return {
    contributingSceneCount: sources.filter((entry) => entry.isUsable).length,
    skippedSceneCount: sources.filter((entry) => !entry.isUsable).length,
    missingSpokenTextSceneCount: sources.filter((entry) => !entry.isUsable).length,
    narrationLength,
    sources,
  };
}

/** Validates per-scene spoken text sources without mutating the script. */
export function validateNarrationRebuildSources(script: FootieScript): {
  sources: NarrationRebuildSourceEntry[];
  diagnostics: NarrationRebuildDiagnostics;
  isSafe: boolean;
  blockedSceneNumbers: number[];
} {
  const sources = script.scenes.map((scene, sceneIndex) => {
    const resolved = resolveSceneRebuildSource(scene);
    return { ...resolved, sceneIndex };
  });

  const blockedSceneNumbers = sources
    .filter((entry) => !entry.isUsable)
    .map((entry) => entry.sceneIndex + 1);

  const diagnostics = buildDiagnostics(sources, 0);

  return {
    sources,
    diagnostics,
    isSafe: blockedSceneNumbers.length === 0 && diagnostics.contributingSceneCount > 0,
    blockedSceneNumbers,
  };
}

export function formatUnsafeNarrationRebuildWarning(blockedSceneNumbers: number[]): string {
  if (blockedSceneNumbers.length === 0) {
    return UNSAFE_NARRATION_REBUILD_WARNING;
  }

  const sceneList = blockedSceneNumbers.join(", ");
  return `${UNSAFE_NARRATION_REBUILD_WARNING} (Scenes: ${sceneList})`;
}

/**
 * Returns resolved spoken text for one scene, or null when unavailable.
 * Written captions are never used.
 */
export function resolveSceneNarrationSourceText(scene: FootieScene): string | null {
  const resolved = resolveSceneSpokenText(scene);
  return resolved.isUsable ? resolved.text : null;
}

/**
 * Builds global `script.narration` from resolved spoken text in scene order.
 * Does not mutate the input. Preserves scenes, media, audio, and metadata.
 */
export function rebuildNarrationFromScenes(script: FootieScript): RebuildNarrationResult {
  const validation = validateNarrationRebuildSources(script);
  const { sources, blockedSceneNumbers } = validation;

  if (validation.diagnostics.contributingSceneCount === 0) {
    return {
      ok: false,
      reason: "no_usable_text",
      script,
      diagnostics: validation.diagnostics,
      blockedSceneNumbers,
    };
  }

  if (!validation.isSafe) {
    return {
      ok: false,
      reason: "unsafe_partial_rebuild",
      script,
      diagnostics: validation.diagnostics,
      blockedSceneNumbers,
    };
  }

  const parts = sources
    .filter((entry) => entry.isUsable && entry.text)
    .map((entry) => entry.text!.trim());

  const narration = parts.join(" ").replace(/\s+/g, " ").trim();
  const diagnostics = buildDiagnostics(sources, narration.length);

  return {
    ok: true,
    narration,
    script: {
      ...script,
      narration,
    },
    diagnostics,
  };
}
