import { getCanonicalVoiceover } from "@/features/audio";
import { sanitizeCreationBriefRetentionPersistence } from "@/features/retention-story/production/sanitize-creation-brief-retention";
import type { FootieScript } from "@/features/story/types";

import type {
  Draft,
  DraftEditorSlices,
  DraftVoiceover,
  StoryCreationBrief,
  StoryDraftSummary,
} from "../types";

import {
  draftWorkflowStatusLabel,
  resolveDraftWorkflowStatus,
} from "./draft-pipeline.utils";

import type { DraftPersistedScript } from "./draft-audio-persistence.utils";
import { createDraftId } from "./draft-id.utils";

function isEphemeralAudioUrl(url: string | undefined): boolean {
  return Boolean(url?.trim().startsWith("blob:"));
}

function shouldApplySliceVoiceoverUrl(
  script: FootieScript,
  sliceUrl: string | undefined,
  mergedBase64: string | undefined,
): boolean {
  if (!sliceUrl) {
    return false;
  }

  if (mergedBase64 && isEphemeralAudioUrl(sliceUrl)) {
    return false;
  }

  if (mergedBase64 && isEphemeralAudioUrl(script.voiceoverUrl)) {
    return false;
  }

  return true;
}

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

  const persisted = script as DraftPersistedScript;
  const mergedBase64 = persisted.voiceoverAudioBase64 ?? voiceover.audioBase64;
  const sliceUrl = voiceover.url?.trim();

  const next: DraftPersistedScript = {
    ...script,
    voiceoverDurationMs: voiceover.durationMs ?? script.voiceoverDurationMs,
    voiceoverUrl: shouldApplySliceVoiceoverUrl(script, sliceUrl, mergedBase64)
      ? sliceUrl
      : script.voiceoverUrl,
  };

  if (mergedBase64) {
    next.voiceoverAudioBase64 = mergedBase64;
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
const CREATION_BRIEF_SAFE_KEYS = Object.freeze([
  "topic",
  "tone",
  "duration",
  "qualityMode",
  "sceneCount",
  "scriptMode",
  "context",
  "enableResearch",
  "footballResearch",
  "researchApplied",
  "researchWarning",
  "templateId",
  "templatePromptHints",
  "voiceId",
  "speechStylePreset",
  "captionPreset",
  "audioMixer",
  "hookPlan",
  "hookStyle",
] as const);

function safeBriefGet(brief: object, key: string): unknown {
  try {
    return Reflect.get(brief, key);
  } catch {
    return undefined;
  }
}

function sanitizeDraftCreationBrief(
  brief: StoryCreationBrief | undefined,
): StoryCreationBrief | undefined {
  try {
    if (!brief || typeof brief !== "object") return undefined;

    const retention = sanitizeCreationBriefRetentionPersistence(brief);

    // Materialize non-Retention fields via safe gets — never spread a hostile brief.
    const rest: Record<string, unknown> = {};
    for (const key of CREATION_BRIEF_SAFE_KEYS) {
      const value = safeBriefGet(brief, key);
      if (value !== undefined) rest[key] = value;
    }

    const topic = rest.topic;
    const tone = rest.tone;
    const duration = rest.duration;
    const qualityMode = rest.qualityMode;
    const sceneCount = rest.sceneCount;
    if (
      typeof topic !== "string" ||
      typeof tone !== "string" ||
      typeof duration !== "number" ||
      typeof qualityMode !== "string" ||
      typeof sceneCount !== "number"
    ) {
      // Required brief core unreadable — drop brief entirely (narration stays on script).
      return undefined;
    }

    return {
      ...(rest as unknown as StoryCreationBrief),
      topic,
      tone: tone as StoryCreationBrief["tone"],
      duration,
      qualityMode: qualityMode as StoryCreationBrief["qualityMode"],
      sceneCount,
      ...retention,
    };
  } catch {
    return undefined;
  }
}

export function normalizeDraft(
  input: Partial<Draft> & Pick<Draft, "id" | "script">,
): Draft {
  const script = input.script;
  const slices = extractEditorSlicesFromScript(script);
  const summary = buildDraftSummaryFields(script);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const creationBrief = sanitizeDraftCreationBrief(input.creationBrief);

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
    pipelineStage: input.pipelineStage,
    assetPlanningSnapshot: input.assetPlanningSnapshot,
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
    pipelineStage: stored.pipelineStage,
  });
}

export function draftToScript(draft: Draft): FootieScript {
  return draft.script;
}

export function toDraftSummary(draft: Draft): StoryDraftSummary {
  const workflowStatus = resolveDraftWorkflowStatus(draft);

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
    workflowStatus,
    workflowStatusLabel: draftWorkflowStatusLabel(workflowStatus),
  };
}

export function createDraftFromScript(
  script: FootieScript,
  creationBrief?: StoryCreationBrief,
  id?: string,
  pipelineStage?: Draft["pipelineStage"],
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
    pipelineStage,
  });
}

export function touchDraft(draft: Draft, script: FootieScript): Draft {
  return normalizeDraft({
    ...draft,
    script,
    updatedAt: new Date().toISOString(),
  });
}
