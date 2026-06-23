import { getCanonicalVoiceover } from "@/features/audio";
import type { FootieScript } from "@/features/story/types";

import type {
  Draft,
  DraftEditorSlices,
  DraftVoiceover,
  StoryCreationBrief,
  StoryDraftSummary,
} from "../types";

import type { DraftPersistedScript } from "./draft-audio-persistence.utils";
import { createDraftId } from "./draft-id.utils";

export function voiceoverFromScript(script: FootieScript): DraftVoiceover | undefined {
  const canonical = getCanonicalVoiceover(script);
  const audioBase64 = (script as DraftPersistedScript).voiceoverAudioBase64;

  if (!canonical?.url && script.voiceoverDurationMs == null && !audioBase64) {
    return undefined;
  }

  return {
    url: canonical?.url,
    durationMs: canonical?.durationMs ?? script.voiceoverDurationMs,
    ...(audioBase64 ? { audioBase64 } : {}),
  };
}

export function applyVoiceoverToScript(
  script: FootieScript,
  voiceover?: DraftVoiceover,
): FootieScript {
  if (!voiceover) {
    return script;
  }

  const next: DraftPersistedScript = {
    ...script,
    voiceoverUrl: voiceover.url,
    voiceoverDurationMs: voiceover.durationMs,
  };

  if (voiceover.audioBase64) {
    next.voiceoverAudioBase64 = voiceover.audioBase64;
  } else {
    delete next.voiceoverAudioBase64;
  }

  return next;
}

/** Extracts denormalized editor slices from the canonical script. */
export function extractEditorSlicesFromScript(script: FootieScript): DraftEditorSlices {
  return {
    scenes: script.scenes,
    timelineItems: script.timelineItems,
    voiceSettings: script.voiceSettings,
    voiceover: voiceoverFromScript(script),
    exportSettings: script.exportSettings,
    backgroundMusic: script.backgroundMusic,
  };
}

/** Applies denormalized editor slices onto a script without dropping other script fields. */
export function applyEditorSlicesToScript(
  script: FootieScript,
  slices: DraftEditorSlices,
): FootieScript {
  const withVoiceover = applyVoiceoverToScript(script, slices.voiceover);

  return {
    ...withVoiceover,
    scenes: slices.scenes,
    timelineItems: slices.timelineItems,
    voiceSettings: slices.voiceSettings,
    exportSettings: slices.exportSettings,
    backgroundMusic: slices.backgroundMusic,
  };
}

export function buildDraftSummaryFields(script: FootieScript) {
  const canonical = getCanonicalVoiceover(script);
  const hasPersistedVoiceover = Boolean(
    (script as DraftPersistedScript).voiceoverAudioBase64,
  );

  return {
    sceneCount: script.scenes.length,
    totalDuration: script.totalDuration,
    hasVoiceover: Boolean(canonical?.url || hasPersistedVoiceover),
  };
}

/**
 * Normalizes a draft so `script` remains canonical and top-level editor slices match it.
 * Fills defaults for list metadata and lifecycle fields.
 */
export function normalizeDraft(
  input: Partial<Draft> & Pick<Draft, "id" | "script">,
): Draft {
  const script = input.script;
  const slices = extractEditorSlicesFromScript(script);
  const summary = buildDraftSummaryFields(script);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const creationBrief = input.creationBrief;

  return {
    id: input.id,
    title: script.title.trim() || input.title?.trim() || "Untitled story",
    prompt: input.prompt ?? creationBrief?.topic,
    status: input.status ?? "draft",
    createdAt,
    updatedAt,
    script,
    scenes: slices.scenes,
    timelineItems: slices.timelineItems,
    voiceSettings: slices.voiceSettings,
    voiceover: slices.voiceover,
    exportSettings: slices.exportSettings,
    backgroundMusic: slices.backgroundMusic,
    sceneCount: summary.sceneCount,
    totalDuration: summary.totalDuration,
    hasVoiceover: summary.hasVoiceover,
    creationBrief,
  };
}

/** Upgrades persisted records that predate the full Draft shape. */
export function coerceLegacyDraft(
  stored: Partial<Draft> & Pick<Draft, "id" | "script">,
): Draft {
  return normalizeDraft({
    ...stored,
    status: stored.status ?? "draft",
    prompt: stored.prompt ?? stored.creationBrief?.topic,
    script: stored.script,
  });
}

export function draftToScript(draft: Draft): FootieScript {
  return draft.script;
}

export function toDraftSummary(draft: Draft): StoryDraftSummary {
  return {
    id: draft.id,
    title: draft.title,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    sceneCount: draft.sceneCount,
    totalDuration: draft.totalDuration,
    hasVoiceover: draft.hasVoiceover,
    status: draft.status,
    prompt: draft.prompt,
  };
}

export function createDraftFromScript(
  script: FootieScript,
  creationBrief?: StoryCreationBrief,
  id?: string,
): Draft {
  const now = new Date().toISOString();

  return normalizeDraft({
    id: id ?? createDraftId(),
    script,
    creationBrief,
    prompt: creationBrief?.topic,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
}

export function touchDraft(draft: Draft, script: FootieScript): Draft {
  return normalizeDraft({
    ...draft,
    script,
    updatedAt: new Date().toISOString(),
  });
}
