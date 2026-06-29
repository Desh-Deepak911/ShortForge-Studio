import { getCanonicalVoiceover } from "@/features/audio";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import type { Draft, DraftPipelineStage, DraftStatus } from "../types";

import type { DraftPersistedScript } from "./draft-audio-persistence.utils";
import { normalizeDraft } from "./draft-model.utils";

/** script_review < voiceover_ready < editor_ready < exported */
export const DRAFT_PROGRESS_RANK = {
  script_review: 1,
  voiceover_ready: 2,
  editor_ready: 3,
  exported: 4,
} as const;

export type DraftProgressRank = (typeof DRAFT_PROGRESS_RANK)[keyof typeof DRAFT_PROGRESS_RANK];

export function draftProgressRank(
  draft: Pick<Draft, "status" | "pipelineStage" | "scenes" | "script" | "hasVoiceover">,
): DraftProgressRank {
  if (draft.status === "exported") {
    return DRAFT_PROGRESS_RANK.exported;
  }

  if (draft.pipelineStage === "editor_ready" || draft.scenes.length > 0) {
    return DRAFT_PROGRESS_RANK.editor_ready;
  }

  if (
    draft.pipelineStage === "voiceover_ready" ||
    draft.hasVoiceover ||
    Boolean(getCanonicalVoiceover(draft.script)?.url)
  ) {
    return DRAFT_PROGRESS_RANK.voiceover_ready;
  }

  if (draft.pipelineStage === "script_review") {
    return DRAFT_PROGRESS_RANK.script_review;
  }

  return DRAFT_PROGRESS_RANK.script_review;
}

export function resolveMergedPipelineStage(
  existingDraft: Draft,
  incomingDraft: Draft,
): DraftPipelineStage | undefined {
  const mergedRank = Math.max(
    draftProgressRank(existingDraft),
    draftProgressRank(incomingDraft),
  ) as DraftProgressRank;

  if (mergedRank >= DRAFT_PROGRESS_RANK.editor_ready) {
    return "editor_ready";
  }

  if (mergedRank >= DRAFT_PROGRESS_RANK.voiceover_ready) {
    return "voiceover_ready";
  }

  return existingDraft.pipelineStage ?? incomingDraft.pipelineStage ?? "script_review";
}

function mergeScriptsSafely(
  existingScript: FootieScript,
  incomingScript: FootieScript,
  preferIncoming: boolean,
): FootieScript {
  if (existingScript.scenes.length > 0 && incomingScript.scenes.length === 0) {
    const incomingPersisted = incomingScript as DraftPersistedScript;
    const voiceoverUrl =
      getCanonicalVoiceover(incomingScript)?.url ?? incomingScript.voiceoverUrl;

    return syncFootieScript({
      ...existingScript,
      title: incomingScript.title,
      narration: incomingScript.narration,
      voiceSettings: incomingScript.voiceSettings ?? existingScript.voiceSettings,
      voiceoverUrl,
      voiceoverDurationMs:
        getCanonicalVoiceover(incomingScript)?.durationMs ??
        incomingScript.voiceoverDurationMs ??
        existingScript.voiceoverDurationMs,
      ...(incomingPersisted.voiceoverAudioBase64
        ? { voiceoverAudioBase64: incomingPersisted.voiceoverAudioBase64 }
        : {}),
    });
  }

  if (!preferIncoming && existingScript.scenes.length > 0) {
    return syncFootieScript(existingScript);
  }

  return syncFootieScript(incomingScript);
}

function resolveMergedStatus(existingDraft: Draft, incomingDraft: Draft): DraftStatus {
  if (existingDraft.status === "exported" || incomingDraft.status === "exported") {
    return "exported";
  }

  return incomingDraft.status ?? existingDraft.status;
}

/**
 * Merge an incoming draft write against the latest stored draft.
 * Prevents stale voiceover/script saves from wiping scenes or downgrading stage.
 */
export function mergeDraftUpdatesSafely(existingDraft: Draft, incomingDraft: Draft): Draft {
  if (existingDraft.id !== incomingDraft.id) {
    throw new Error("mergeDraftUpdatesSafely requires drafts with the same id.");
  }

  const existingRank = draftProgressRank(existingDraft);
  const incomingRank = draftProgressRank(incomingDraft);
  const preferIncoming =
    incomingDraft.updatedAt >= existingDraft.updatedAt || incomingRank >= existingRank;

  const primary = preferIncoming ? incomingDraft : existingDraft;
  const secondary = preferIncoming ? existingDraft : incomingDraft;
  const mergedScript = mergeScriptsSafely(
    existingDraft.script,
    incomingDraft.script,
    preferIncoming,
  );

  return normalizeDraft({
    id: existingDraft.id,
    createdAt: existingDraft.createdAt,
    title: primary.title,
    prompt: primary.prompt ?? secondary.prompt,
    status: resolveMergedStatus(existingDraft, incomingDraft),
    pipelineStage: resolveMergedPipelineStage(existingDraft, incomingDraft),
    script: mergedScript,
    creationBrief: primary.creationBrief ?? secondary.creationBrief,
    updatedAt:
      incomingDraft.updatedAt > existingDraft.updatedAt
        ? incomingDraft.updatedAt
        : existingDraft.updatedAt,
  });
}
