"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { SceneMediaFraming } from "@/features/media-framing";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import type { StoryScriptChangeOptions } from "@/lib/utils/voiceover";
import {
  studioGhostButton,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import { evaluateSubjectFramingStaleness } from "../domain/evaluate-subject-framing-staleness";
import type { SubjectAwareFramingStaleReason } from "../domain/evaluate-subject-framing-staleness";
import {
  buildManualSubjectFocusFromGrid,
  matchSubjectFocusGridId,
  type SubjectFocusGridId,
} from "../domain/subject-focus";
import { buildSubjectFocusFramingSuggestion } from "../domain/subject-focus-framing-suggestion";
import {
  applySubjectAwareFramingSuggestion,
  clearSubjectFocus,
  keepOrDismissSubjectAwareFraming,
  setSubjectFocus,
  undoSubjectAwareFraming,
  type SubjectAwareFramingTerminalCode,
} from "./subject-aware-framing.commands";
import SubjectFocusPicker from "./SubjectFocusPicker";

export interface SubjectAwareFramingControlsProps {
  readonly script: FootieScript;
  readonly scene: FootieScene;
  readonly media: SceneMedia | null | undefined;
  readonly framing: Pick<
    SceneMediaFraming,
    "fitMode" | "positionX" | "positionY" | "zoom" | "rotationDeg"
  >;
  readonly mediaItemId?: string | null;
  readonly onScriptChange: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
  readonly subjectAwareReframingEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
  readonly detailsToggleRef?: RefObject<HTMLButtonElement | null>;
}

const STALE_REASON_COPY: Record<SubjectAwareFramingStaleReason, string> = {
  MEDIA_CHANGED: "The media source changed after this framing was saved.",
  MEDIA_ITEM_CHANGED:
    "A different media item is selected than the one this framing was saved for.",
  SUBJECT_FOCUS_CHANGED:
    "The subject focus changed after this framing was applied.",
  FRAMING_CHANGED: "Framing was edited manually after this suggestion was applied.",
  RECOMMENDATION_CHANGED:
    "This saved suggestion is from an older recommendation.",
  PROVENANCE_INVALID: "Saved subject framing info could not be read.",
};

const TERMINAL_COPY: Record<SubjectAwareFramingTerminalCode, string> = {
  SUBJECT_AWARE_CAPABILITY_OFF:
    "Subject-aware framing is unavailable right now.",
  SUBJECT_AWARE_FOCUS_UNAVAILABLE: "No subject focus is available for this media.",
  SUBJECT_AWARE_FOCUS_INVALID: "That subject focus could not be saved.",
  SUBJECT_AWARE_SUGGESTION_UNAVAILABLE:
    "No subject framing suggestion is available for this media.",
  SUBJECT_AWARE_SUGGESTION_STALE:
    "The suggestion is out of date. Review Details and try again.",
  SUBJECT_AWARE_SUGGESTION_INVALID:
    "That suggestion could not be verified. No changes were made.",
  SUBJECT_AWARE_MEDIA_ITEM_MISMATCH:
    "The selected media item no longer matches this suggestion.",
  SUBJECT_AWARE_UNDO_UNAVAILABLE:
    "Undo is not available after media, focus, or framing changed.",
  SUBJECT_AWARE_PROVENANCE_INVALID:
    "Saved subject framing info could not be read. You can dismiss it safely.",
  SUBJECT_AWARE_FRAMING_UNAVAILABLE:
    "Framing could not be updated for this media.",
};

type PendingFocusTarget =
  | "apply"
  | "undo"
  | "keep"
  | "dismiss"
  | "details-toggle"
  | null;

function mapTerminalCopy(code: SubjectAwareFramingTerminalCode): string {
  return TERMINAL_COPY[code] ?? "Could not complete the subject framing action.";
}

function normalizeMediaItemId(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveLatestScene(
  script: FootieScript,
  sceneId: string,
): FootieScene | null {
  return script.scenes.find((entry) => entry.id === sceneId) ?? null;
}

function resolveLatestTargetMedia(
  scene: FootieScene,
  mediaItemId: string | null,
  mixedMediaScenesEnabled: boolean,
): SceneMedia | null {
  if (mediaItemId) {
    if (mixedMediaScenesEnabled) {
      const fromSequence = scene.visualSequence?.items.find(
        (item) => item.id === mediaItemId,
      )?.media;
      if (fromSequence) {
        return fromSequence;
      }
    }
    return (
      scene.mediaTimeline?.items.find((item) => item.id === mediaItemId)?.media ??
      null
    );
  }
  return scene.media ?? null;
}

function commitSceneReplacement(
  script: FootieScript,
  sceneId: string,
  nextScene: FootieScene,
  onScriptChange: SubjectAwareFramingControlsProps["onScriptChange"],
): void {
  const nextScript: FootieScript = {
    ...script,
    scenes: script.scenes.map((entry) =>
      entry.id === sceneId ? nextScene : entry,
    ),
  };
  onScriptChange(nextScript, { intent: "media" });
}

/**
 * Explicit subject-focus + Apply / Undo / Keep-Dismiss controls.
 * Never auto-applies. Mounted inside Source quality Details only.
 */
export default function SubjectAwareFramingControls({
  script,
  scene,
  media,
  framing,
  mediaItemId,
  onScriptChange,
  subjectAwareReframingEnabled,
  mixedMediaScenesEnabled,
  detailsToggleRef,
}: SubjectAwareFramingControlsProps) {
  const statusId = useId();
  const focusHeadingId = useId();
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<PendingFocusTarget>(null);
  const [pendingFocusEpoch, setPendingFocusEpoch] = useState(0);
  const normalizedMediaItemId = normalizeMediaItemId(mediaItemId);
  const winningKey = `${scene.id}::${normalizedMediaItemId ?? "single"}`;
  const [feedback, setFeedback] = useState<{
    readonly key: string;
    readonly politeStatus: string;
    readonly alertMessage: string | null;
    readonly alertCode: string | null;
  }>({
    key: winningKey,
    politeStatus: "",
    alertMessage: null,
    alertCode: null,
  });
  const politeStatus =
    feedback.key === winningKey ? feedback.politeStatus : "";
  const alertMessage =
    feedback.key === winningKey ? feedback.alertMessage : null;
  const alertCode = feedback.key === winningKey ? feedback.alertCode : null;

  const selectedGridId = useMemo(
    () => matchSubjectFocusGridId(media?.subjectFocus),
    [media?.subjectFocus],
  );

  const suggestion = useMemo(
    () =>
      buildSubjectFocusFramingSuggestion({
        media,
        mediaItemId: normalizedMediaItemId,
        currentFraming: framing,
        subjectFocus: media?.subjectFocus,
      }),
    [framing, media, normalizedMediaItemId],
  );

  const staleness = useMemo(
    () =>
      evaluateSubjectFramingStaleness({
        provenance: media?.subjectAwareFramingProvenance,
        media,
        framing,
        mediaItemId: normalizedMediaItemId,
      }),
    [framing, media, normalizedMediaItemId],
  );

  const effectiveStatus = staleness.effectiveStatus;
  const showUndo = staleness.undoAllowed && staleness.provenance != null;
  const showKeep =
    effectiveStatus === "applied" &&
    staleness.keepDismissAllowed &&
    staleness.provenance != null;
  const showDismiss =
    (effectiveStatus === "stale" || effectiveStatus === "invalid") &&
    staleness.keepDismissAllowed;
  const showApply =
    suggestion.available &&
    (effectiveStatus === "absent" ||
      (staleness.applyAllowed &&
        (effectiveStatus === "stale" || effectiveStatus === "invalid")));

  const staleReasonMessages = useMemo(() => {
    if (effectiveStatus !== "stale" && effectiveStatus !== "invalid") {
      return [] as string[];
    }
    if (effectiveStatus === "invalid") {
      return [
        "Saved subject framing info could not be read. Preview and export are unaffected.",
      ];
    }
    return staleness.reasons.map((reason) => STALE_REASON_COPY[reason]);
  }, [effectiveStatus, staleness.reasons]);

  const requestFocusAfterCommit = useCallback((target: PendingFocusTarget) => {
    pendingFocusRef.current = target;
    setPendingFocusEpoch((epoch) => epoch + 1);
  }, []);

  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) {
      return;
    }
    if (!subjectAwareReframingEnabled) {
      pendingFocusRef.current = null;
      return;
    }
    let node: HTMLButtonElement | null = null;
    if (target === "apply") {
      node = applyButtonRef.current;
    } else if (target === "undo") {
      node = undoButtonRef.current;
    } else if (target === "keep") {
      node = keepButtonRef.current;
    } else if (target === "dismiss") {
      node = dismissButtonRef.current;
    } else if (target === "details-toggle") {
      node = detailsToggleRef?.current ?? null;
    }
    if (node) {
      node.focus();
    } else if (target === "apply" || target === "undo") {
      detailsToggleRef?.current?.focus();
    }
    pendingFocusRef.current = null;
  }, [
    pendingFocusEpoch,
    subjectAwareReframingEnabled,
    detailsToggleRef,
    showApply,
    showUndo,
    showKeep,
    showDismiss,
    effectiveStatus,
  ]);

  const publishFeedback = useCallback(
    (next: {
      readonly politeStatus?: string;
      readonly alertMessage?: string | null;
      readonly alertCode?: string | null;
    }) => {
      setFeedback({
        key: winningKey,
        politeStatus: next.politeStatus ?? "",
        alertMessage: next.alertMessage ?? null,
        alertCode: next.alertCode ?? null,
      });
    },
    [winningKey],
  );

  const failTerminal = useCallback(
    (
      code: SubjectAwareFramingTerminalCode,
      focus: Exclude<PendingFocusTarget, "details-toggle" | null>,
    ) => {
      publishFeedback({
        politeStatus: "",
        alertMessage: mapTerminalCopy(code),
        alertCode: code,
      });
      if (focus === "apply") {
        applyButtonRef.current?.focus();
      } else if (focus === "undo") {
        undoButtonRef.current?.focus();
      } else if (focus === "keep") {
        keepButtonRef.current?.focus();
      } else if (focus === "dismiss") {
        dismissButtonRef.current?.focus();
      }
    },
    [publishFeedback],
  );

  const handleFocusChange = useCallback(
    (id: SubjectFocusGridId) => {
      if (!subjectAwareReframingEnabled) return;
      const latestScene = resolveLatestScene(script, scene.id);
      if (!latestScene) {
        failTerminal("SUBJECT_AWARE_MEDIA_ITEM_MISMATCH", "apply");
        return;
      }
      const focus = buildManualSubjectFocusFromGrid(id);
      if (!focus) {
        failTerminal("SUBJECT_AWARE_FOCUS_INVALID", "apply");
        return;
      }
      const result = setSubjectFocus({
        scene: latestScene,
        mediaItemId: normalizedMediaItemId,
        subjectFocus: focus,
        subjectAwareReframingEnabled,
        mixedMediaScenesEnabled,
      });
      if (!result.ok) {
        failTerminal(result.terminalCode, "apply");
        return;
      }
      publishFeedback({ politeStatus: "Subject focus updated." });
      commitSceneReplacement(script, scene.id, result.scene, onScriptChange);
    },
    [
      failTerminal,
      mixedMediaScenesEnabled,
      normalizedMediaItemId,
      onScriptChange,
      publishFeedback,
      scene.id,
      script,
      subjectAwareReframingEnabled,
    ],
  );

  const handleClearFocus = useCallback(() => {
    if (!subjectAwareReframingEnabled || !media?.subjectFocus) return;
    const latestScene = resolveLatestScene(script, scene.id);
    if (!latestScene) {
      failTerminal("SUBJECT_AWARE_FOCUS_UNAVAILABLE", "dismiss");
      return;
    }
    const result = clearSubjectFocus({
      scene: latestScene,
      mediaItemId: normalizedMediaItemId,
      subjectAwareReframingEnabled,
      mixedMediaScenesEnabled,
    });
    if (!result.ok) {
      failTerminal(result.terminalCode, "dismiss");
      return;
    }
    publishFeedback({
      politeStatus: "Subject focus cleared. Framing was left unchanged.",
    });
    requestFocusAfterCommit("details-toggle");
    commitSceneReplacement(script, scene.id, result.scene, onScriptChange);
  }, [
    failTerminal,
    media?.subjectFocus,
    mixedMediaScenesEnabled,
    normalizedMediaItemId,
    onScriptChange,
    publishFeedback,
    requestFocusAfterCommit,
    scene.id,
    script,
    subjectAwareReframingEnabled,
  ]);

  const handleApply = useCallback(() => {
    if (!subjectAwareReframingEnabled || !showApply) return;
    const latestScene = resolveLatestScene(script, scene.id);
    if (!latestScene) {
      failTerminal("SUBJECT_AWARE_MEDIA_ITEM_MISMATCH", "apply");
      return;
    }
    if (normalizedMediaItemId) {
      const stillPresent = resolveLatestTargetMedia(
        latestScene,
        normalizedMediaItemId,
        mixedMediaScenesEnabled,
      );
      if (!stillPresent) {
        failTerminal("SUBJECT_AWARE_MEDIA_ITEM_MISMATCH", "apply");
        return;
      }
    }
    const result = applySubjectAwareFramingSuggestion({
      scene: latestScene,
      mediaItemId: normalizedMediaItemId,
      suggestion,
      expectedRecommendationFingerprint: suggestion.recommendationFingerprint,
      subjectAwareReframingEnabled,
      mixedMediaScenesEnabled,
    });
    if (!result.ok) {
      failTerminal(result.terminalCode, "apply");
      return;
    }
    publishFeedback({
      politeStatus: "Subject framing suggestion applied.",
    });
    requestFocusAfterCommit("undo");
    commitSceneReplacement(script, scene.id, result.scene, onScriptChange);
  }, [
    failTerminal,
    mixedMediaScenesEnabled,
    normalizedMediaItemId,
    onScriptChange,
    publishFeedback,
    requestFocusAfterCommit,
    scene.id,
    script,
    showApply,
    subjectAwareReframingEnabled,
    suggestion,
  ]);

  const handleUndo = useCallback(() => {
    if (!subjectAwareReframingEnabled || !showUndo) return;
    const latestScene = resolveLatestScene(script, scene.id);
    if (!latestScene) {
      failTerminal("SUBJECT_AWARE_UNDO_UNAVAILABLE", "undo");
      return;
    }
    const result = undoSubjectAwareFraming({
      scene: latestScene,
      mediaItemId: normalizedMediaItemId,
      subjectAwareReframingEnabled,
      mixedMediaScenesEnabled,
    });
    if (!result.ok) {
      failTerminal(result.terminalCode, "undo");
      return;
    }
    publishFeedback({
      politeStatus: "Subject framing restored to the previous adjustment.",
    });
    requestFocusAfterCommit("apply");
    commitSceneReplacement(script, scene.id, result.scene, onScriptChange);
  }, [
    failTerminal,
    mixedMediaScenesEnabled,
    normalizedMediaItemId,
    onScriptChange,
    publishFeedback,
    requestFocusAfterCommit,
    scene.id,
    script,
    showUndo,
    subjectAwareReframingEnabled,
  ]);

  const handleKeepOrDismiss = useCallback(
    (mode: "keep" | "dismiss") => {
      if (!subjectAwareReframingEnabled) return;
      if (mode === "keep" && !showKeep) return;
      if (mode === "dismiss" && !showDismiss) return;
      const latestScene = resolveLatestScene(script, scene.id);
      if (!latestScene) {
        failTerminal("SUBJECT_AWARE_PROVENANCE_INVALID", mode);
        return;
      }
      const result = keepOrDismissSubjectAwareFraming({
        scene: latestScene,
        mediaItemId: normalizedMediaItemId,
        subjectAwareReframingEnabled,
        mixedMediaScenesEnabled,
      });
      if (!result.ok) {
        failTerminal(result.terminalCode, mode);
        return;
      }
      publishFeedback({
        politeStatus:
          mode === "keep"
            ? "Kept current framing. Suggestion info cleared."
            : "Dismissed saved subject framing info.",
      });
      requestFocusAfterCommit("details-toggle");
      commitSceneReplacement(script, scene.id, result.scene, onScriptChange);
    },
    [
      failTerminal,
      mixedMediaScenesEnabled,
      normalizedMediaItemId,
      onScriptChange,
      publishFeedback,
      requestFocusAfterCommit,
      scene.id,
      script,
      showDismiss,
      showKeep,
      subjectAwareReframingEnabled,
    ],
  );

  if (!subjectAwareReframingEnabled) {
    return null;
  }

  return (
    <div
      className="min-w-0 space-y-2 border-t border-border/25 pt-2"
      data-subject-aware-framing-controls=""
      data-subject-aware-status={effectiveStatus}
      data-subject-aware-suggestion-available={
        suggestion.available ? "true" : "false"
      }
      data-subject-aware-recommendation-fingerprint={
        suggestion.recommendationFingerprint
      }
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h4
            id={focusHeadingId}
            className="text-[11px] font-medium text-foreground/85"
          >
            Subject framing
          </h4>
          <p className={`${studioSubtleText} mt-0.5 text-[11px] leading-snug`}>
            Choose where the main subject sits, then apply a suggestion if one
            is offered. Nothing changes until you apply.
          </p>
        </div>
        {media?.subjectFocus ? (
          <button
            type="button"
            className={`${studioGhostButton} shrink-0 px-2 py-1 text-[11px]`}
            data-subject-aware-clear-focus=""
            title={
              showUndo || media.subjectAwareFramingProvenance
                ? "Removes the subject position and saved suggestion info. Current framing stays as-is; Undo will no longer be available."
                : "Removes the subject position. Framing stays as-is."
            }
            onClick={handleClearFocus}
          >
            Clear focus
          </button>
        ) : null}
      </div>

      <SubjectFocusPicker
        value={selectedGridId}
        onChange={handleFocusChange}
        labelledBy={focusHeadingId}
      />

      {suggestion.unavailableReason === "UNKNOWN_DIMENSIONS" ? (
        <p
          className={`${studioSubtleText} text-[11px] leading-snug`}
          data-subject-aware-unknown-dimensions=""
        >
          Dimensions are still loading or unavailable. You can keep editing;
          a suggestion will appear when source size is known. Preview and export
          stay available.
        </p>
      ) : null}

      <p
        className="text-[11px] leading-snug text-foreground/85"
        data-subject-aware-suggestion-summary=""
      >
        {suggestion.summary}
      </p>

      {staleReasonMessages.length > 0 ? (
        <ul className="space-y-1" data-subject-aware-stale-reasons="">
          {staleReasonMessages.map((message) => (
            <li
              key={message}
              className="text-[11px] leading-snug text-foreground/85"
            >
              {message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex min-w-0 flex-wrap gap-2">
        {showApply ? (
          <button
            ref={applyButtonRef}
            type="button"
            className={`${studioPrimaryButton} px-2.5 py-1.5 text-[11px]`}
            data-subject-aware-apply=""
            onClick={handleApply}
          >
            Apply suggestion
          </button>
        ) : null}
        {showUndo ? (
          <button
            ref={undoButtonRef}
            type="button"
            className={`${studioSecondaryButton} px-2.5 py-1.5 text-[11px]`}
            data-subject-aware-undo=""
            onClick={handleUndo}
          >
            Undo
          </button>
        ) : null}
        {showKeep ? (
          <button
            ref={keepButtonRef}
            type="button"
            className={`${studioGhostButton} px-2.5 py-1.5 text-[11px]`}
            data-subject-aware-keep=""
            title="Keeps the current framing and subject focus. Clears saved suggestion info so Undo is no longer offered."
            onClick={() => handleKeepOrDismiss("keep")}
          >
            Keep framing
          </button>
        ) : null}
        {showDismiss ? (
          <button
            ref={dismissButtonRef}
            type="button"
            className={`${studioGhostButton} px-2.5 py-1.5 text-[11px]`}
            data-subject-aware-dismiss=""
            title="Clears saved suggestion info only. Current framing and subject focus stay as they are."
            onClick={() => handleKeepOrDismiss("dismiss")}
          >
            Dismiss
          </button>
        ) : null}
      </div>
      <p className={`${studioSubtleText} text-[11px] leading-snug`}>
        Subject position is chosen manually. No automated face or motion
        tracking.
      </p>

      <div
        id={statusId}
        className="sr-only"
        aria-live="polite"
        data-subject-aware-status-live=""
      >
        {politeStatus}
      </div>
      {alertMessage ? (
        <p
          role="alert"
          className="text-[11px] leading-snug text-foreground/90"
          data-subject-aware-alert=""
          data-subject-aware-alert-code={alertCode ?? undefined}
        >
          {alertMessage}
        </p>
      ) : null}
    </div>
  );
}
