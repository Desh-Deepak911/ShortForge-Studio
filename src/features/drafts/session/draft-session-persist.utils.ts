import { getCanonicalVoiceover } from "@/features/audio";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import { getDraft, updateDraft } from "../services";
import type { Draft, DraftPipelineStage } from "../types";
import { hydrateDraftScriptAudio, type DraftPersistedScript } from "../utils/draft-audio-persistence.utils";
import { resolvePipelineStageFromScript } from "../utils/draft-pipeline.utils";
import { serializeEditorStateForDraftAsync } from "../utils/draft-serialization.utils";

/** Keeps generated scenes when a stale voiceover-only save would wipe them. */
export function resolvePersistPayload(
  incoming: FootieScript,
  draftId: string,
  requestedStage: DraftPipelineStage | undefined,
  fallbackStage: DraftPipelineStage | undefined,
  sessionScript?: FootieScript | null,
): { script: FootieScript; stage: DraftPipelineStage } {
  const stored = getDraft(draftId);
  const stage =
    requestedStage ?? resolvePipelineStageFromScript(incoming, fallbackStage);

  if (incoming.scenes.length > 0) {
    return {
      script: incoming,
      stage: stage === "script_review" || stage === "voiceover_ready" ? "editor_ready" : stage,
    };
  }

  const sessionScenes = sessionScript?.scenes ?? [];
  const storedScenes = stored?.script.scenes ?? [];
  const preservedScript =
    sessionScenes.length > 0
      ? sessionScript!
      : storedScenes.length > 0
        ? stored!.script
        : null;

  if (!preservedScript || preservedScript.scenes.length === 0) {
    return { script: incoming, stage };
  }

  const persistedIncoming = incoming as DraftPersistedScript;
  const voiceoverUrl = getCanonicalVoiceover(incoming)?.url ?? incoming.voiceoverUrl;

  return {
    script: syncFootieScript({
      ...preservedScript,
      title: incoming.title,
      narration: incoming.narration,
      voiceSettings: incoming.voiceSettings,
      voiceoverUrl,
      voiceoverDurationMs:
        getCanonicalVoiceover(incoming)?.durationMs ?? incoming.voiceoverDurationMs,
      ...(persistedIncoming.voiceoverAudioBase64
        ? { voiceoverAudioBase64: persistedIncoming.voiceoverAudioBase64 }
        : {}),
    }),
    stage: "editor_ready",
  };
}

export async function persistDraftSessionToStorage(
  draftId: string,
  nextScript: FootieScript,
  nextStage?: DraftPipelineStage,
  fallbackStage?: DraftPipelineStage,
  sessionScript?: FootieScript | null,
): Promise<Draft | null> {
  const { script: scriptToPersist, stage } = resolvePersistPayload(
    nextScript,
    draftId,
    nextStage,
    fallbackStage,
    sessionScript,
  );
  const serialized = await serializeEditorStateForDraftAsync(scriptToPersist);

  const updated = updateDraft(draftId, {
    script: serialized,
    pipelineStage: stage,
  });

  if (!updated) {
    return null;
  }

  return {
    ...updated,
    script: syncFootieScript(hydrateDraftScriptAudio(updated.script)),
  };
}
