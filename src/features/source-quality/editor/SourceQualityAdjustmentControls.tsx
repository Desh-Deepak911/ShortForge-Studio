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

import { evaluateSourceQualityAdjustmentStaleness } from "../domain/evaluate-source-quality-adjustment-staleness";
import type { SourceQualityAdjustmentStaleReason } from "../domain/evaluate-source-quality-adjustment-staleness";
import {
  recommendSafeVisualAdjustment,
  type SourceQualitySafeAdjustmentRecommendation,
} from "../domain/safe-visual-adjustment-recommendation";
import {
  applySourceQualityAdjustmentRecommendation,
  dismissSourceQualityAdjustmentProvenance,
  undoSourceQualityAdjustmentRecommendation,
  type SourceQualityAdjustmentTerminalCode,
} from "./source-quality-adjustment.commands";

export interface SourceQualityAdjustmentControlsProps {
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
  readonly sourceQualityIntelligenceEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
  /** Parent Details toggle — focused when no Apply control survives. */
  readonly detailsToggleRef?: RefObject<HTMLButtonElement | null>;
}

const STALE_REASON_COPY: Record<SourceQualityAdjustmentStaleReason, string> = {
  MEDIA_CHANGED: "The media source changed after this adjustment was saved.",
  MEDIA_ITEM_CHANGED:
    "A different media item is selected than the one this adjustment was saved for.",
  FRAMING_CHANGED: "Framing was edited manually after this adjustment was applied.",
  RECOMMENDATION_CHANGED:
    "This saved suggestion is from an older recommendation.",
  PROVENANCE_INVALID: "Saved adjustment info could not be read.",
};

const TERMINAL_COPY: Record<SourceQualityAdjustmentTerminalCode, string> = {
  SOURCE_QUALITY_CAPABILITY_OFF:
    "Source quality adjustments are unavailable right now.",
  SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE:
    "No safe framing adjustment is available for this media.",
  SOURCE_QUALITY_RECOMMENDATION_STALE:
    "The suggestion is out of date. Review Details and try again.",
  SOURCE_QUALITY_RECOMMENDATION_INVALID:
    "That suggestion could not be verified. No changes were made.",
  SOURCE_QUALITY_MEDIA_ITEM_MISMATCH:
    "The selected media item no longer matches this suggestion.",
  SOURCE_QUALITY_UNDO_UNAVAILABLE:
    "Undo is not available after media or framing changed.",
  SOURCE_QUALITY_PROVENANCE_INVALID:
    "Saved adjustment info could not be read. You can dismiss it safely.",
  SOURCE_QUALITY_FRAMING_UNAVAILABLE:
    "Framing could not be updated for this media.",
};

type PendingFocusTarget =
  | "apply"
  | "undo"
  | "keep"
  | "dismiss"
  | "details-toggle"
  | null;

function mapTerminalCopy(code: SourceQualityAdjustmentTerminalCode): string {
  return TERMINAL_COPY[code] ?? "Could not complete the source quality action.";
}

function normalizeMediaItemId(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function describeProposedChanges(
  recommendation: SourceQualitySafeAdjustmentRecommendation,
): string {
  const fit = recommendation.proposedFramingPatch.fitMode === "fit";
  const zoom =
    typeof recommendation.proposedFramingPatch.zoom === "number" &&
    recommendation.proposedFramingPatch.zoom === 1;
  if (fit && zoom) {
    return "This will switch framing to Fit and return zoom to 1×.";
  }
  if (fit) {
    return "This will switch framing to Fit. Letterboxing may appear.";
  }
  if (zoom) {
    return "This will return zoom to 1×.";
  }
  return "This will update framing only.";
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
  onScriptChange: SourceQualityAdjustmentControlsProps["onScriptChange"],
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
 * Explicit Apply / Undo / Keep / Dismiss controls for source-quality framing.
 * Never auto-applies. Commands own all framing writes.
 */
export default function SourceQualityAdjustmentControls({
  script,
  scene,
  media,
  framing,
  mediaItemId,
  onScriptChange,
  sourceQualityIntelligenceEnabled,
  mixedMediaScenesEnabled,
  detailsToggleRef,
}: SourceQualityAdjustmentControlsProps) {
  const statusId = useId();
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<PendingFocusTarget>(null);
  const [pendingFocusEpoch, setPendingFocusEpoch] = useState(0);
  const normalizedMediaItemId = normalizeMediaItemId(mediaItemId);
  const winningKey = `${scene.id}::${normalizedMediaItemId ?? "single"}`;
  /** Feedback is keyed to the winning media so scene/item changes clear it without effects. */
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

  const recommendation = useMemo(
    () =>
      recommendSafeVisualAdjustment({
        media,
        framing,
        mediaItemId: normalizedMediaItemId,
      }),
    [framing, media, normalizedMediaItemId],
  );

  const staleness = useMemo(
    () =>
      evaluateSourceQualityAdjustmentStaleness({
        provenance: media?.sourceQualityAdjustmentProvenance,
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
    staleness.dismissAllowed &&
    staleness.provenance != null;
  const showDismiss =
    (effectiveStatus === "stale" || effectiveStatus === "invalid") &&
    staleness.dismissAllowed;
  const showApply =
    recommendation.applicable &&
    (effectiveStatus === "absent" ||
      (staleness.applyAllowed &&
        (effectiveStatus === "stale" || effectiveStatus === "invalid")));

  const staleReasonMessages = useMemo(() => {
    if (effectiveStatus !== "stale" && effectiveStatus !== "invalid") {
      return [] as string[];
    }
    if (effectiveStatus === "invalid") {
      return [
        "Saved adjustment info could not be read. Preview and export are unaffected.",
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
    if (!sourceQualityIntelligenceEnabled) {
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
      // Preferred control unmounted — fall back to Details toggle.
      detailsToggleRef?.current?.focus();
    }
    pendingFocusRef.current = null;
  }, [
    pendingFocusEpoch,
    sourceQualityIntelligenceEnabled,
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
      code: SourceQualityAdjustmentTerminalCode,
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

  const handleApply = useCallback(() => {
    if (!sourceQualityIntelligenceEnabled || !showApply) {
      return;
    }
    const latestScript = script;
    const latestScene = resolveLatestScene(latestScript, scene.id);
    if (!latestScene) {
      failTerminal("SOURCE_QUALITY_MEDIA_ITEM_MISMATCH", "apply");
      return;
    }
    if (normalizedMediaItemId) {
      const stillPresent = resolveLatestTargetMedia(
        latestScene,
        normalizedMediaItemId,
        mixedMediaScenesEnabled,
      );
      if (!stillPresent) {
        failTerminal("SOURCE_QUALITY_MEDIA_ITEM_MISMATCH", "apply");
        return;
      }
    }

    const result = applySourceQualityAdjustmentRecommendation({
      scene: latestScene,
      mediaItemId: normalizedMediaItemId,
      recommendation,
      expectedRecommendationFingerprint:
        recommendation.recommendationFingerprint,
      sourceQualityIntelligenceEnabled,
      mixedMediaScenesEnabled,
    });
    if (!result.ok) {
      failTerminal(result.terminalCode, "apply");
      return;
    }
    publishFeedback({
      politeStatus: "Suggested framing adjustment applied.",
    });
    requestFocusAfterCommit("undo");
    commitSceneReplacement(
      latestScript,
      scene.id,
      result.scene,
      onScriptChange,
    );
  }, [
    failTerminal,
    mixedMediaScenesEnabled,
    normalizedMediaItemId,
    onScriptChange,
    publishFeedback,
    recommendation,
    requestFocusAfterCommit,
    scene.id,
    script,
    showApply,
    sourceQualityIntelligenceEnabled,
  ]);

  const handleUndo = useCallback(() => {
    if (!sourceQualityIntelligenceEnabled || !showUndo) {
      return;
    }
    const latestScript = script;
    const latestScene = resolveLatestScene(latestScript, scene.id);
    if (!latestScene) {
      failTerminal("SOURCE_QUALITY_UNDO_UNAVAILABLE", "undo");
      return;
    }
    if (normalizedMediaItemId) {
      const stillPresent = resolveLatestTargetMedia(
        latestScene,
        normalizedMediaItemId,
        mixedMediaScenesEnabled,
      );
      if (!stillPresent) {
        failTerminal("SOURCE_QUALITY_UNDO_UNAVAILABLE", "undo");
        return;
      }
    }

    const result = undoSourceQualityAdjustmentRecommendation({
      scene: latestScene,
      mediaItemId: normalizedMediaItemId,
      sourceQualityIntelligenceEnabled,
      mixedMediaScenesEnabled,
    });
    if (!result.ok) {
      failTerminal(result.terminalCode, "undo");
      return;
    }
    // Prefer Apply when still offered after undo; otherwise Details toggle.
    publishFeedback({
      politeStatus: "Framing restored to the previous adjustment.",
    });
    requestFocusAfterCommit("apply");
    commitSceneReplacement(
      latestScript,
      scene.id,
      result.scene,
      onScriptChange,
    );
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
    sourceQualityIntelligenceEnabled,
  ]);

  const handleDismissOrKeep = useCallback(
    (mode: "keep" | "dismiss") => {
      if (!sourceQualityIntelligenceEnabled) {
        return;
      }
      if (mode === "keep" && !showKeep) {
        return;
      }
      if (mode === "dismiss" && !showDismiss) {
        return;
      }
      const latestScript = script;
      const latestScene = resolveLatestScene(latestScript, scene.id);
      if (!latestScene) {
        failTerminal("SOURCE_QUALITY_PROVENANCE_INVALID", mode);
        return;
      }
      if (normalizedMediaItemId) {
        const stillPresent = resolveLatestTargetMedia(
          latestScene,
          normalizedMediaItemId,
          mixedMediaScenesEnabled,
        );
        if (!stillPresent) {
          failTerminal("SOURCE_QUALITY_MEDIA_ITEM_MISMATCH", mode);
          return;
        }
      }

      const result = dismissSourceQualityAdjustmentProvenance({
        scene: latestScene,
        mediaItemId: normalizedMediaItemId,
        sourceQualityIntelligenceEnabled,
        mixedMediaScenesEnabled,
      });
      if (!result.ok) {
        failTerminal(result.terminalCode, mode);
        return;
      }
      publishFeedback({
        politeStatus:
          mode === "keep"
            ? "Saved Undo history removed. Current framing is unchanged."
            : "Saved adjustment info dismissed. Current framing is unchanged.",
      });
      requestFocusAfterCommit("apply");
      commitSceneReplacement(
        latestScript,
        scene.id,
        result.scene,
        onScriptChange,
      );
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
      sourceQualityIntelligenceEnabled,
    ],
  );

  if (!sourceQualityIntelligenceEnabled) {
    return null;
  }

  const hasActionControls =
    showApply || showUndo || showKeep || showDismiss;
  // Keep status/alert mounted after actions even when buttons leave the tree.
  if (!hasActionControls && !politeStatus && !alertMessage) {
    return null;
  }

  const applyLabel =
    effectiveStatus === "absent"
      ? "Apply suggested adjustment"
      : "Apply current suggestion";

  return (
    <div
      className="min-w-0 space-y-2"
      data-source-quality-adjustment-controls=""
      data-source-quality-adjustment-status={effectiveStatus}
    >
      {effectiveStatus === "applied" ? (
        <p
          className="text-[11px] font-medium text-foreground/85"
          data-source-quality-adjustment-applied=""
        >
          Adjustment applied
        </p>
      ) : null}

      {staleReasonMessages.length > 0 ? (
        <ul
          className="space-y-1"
          data-source-quality-adjustment-stale-reasons=""
        >
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

      {showApply ? (
        <div className="space-y-1.5" data-source-quality-adjustment-apply-block="">
          <p className={`${studioSubtleText} text-[11px] leading-snug`}>
            {describeProposedChanges(recommendation)} Timing, media order,
            narration, captions, and music will not change.
          </p>
          <button
            ref={applyButtonRef}
            type="button"
            className={`${studioPrimaryButton} w-full min-w-0 sm:w-auto`}
            data-source-quality-adjustment-apply=""
            data-source-quality-recommendation-fingerprint={
              recommendation.recommendationFingerprint
            }
            onClick={handleApply}
          >
            {applyLabel}
          </button>
        </div>
      ) : null}

      {showUndo ? (
        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            ref={undoButtonRef}
            type="button"
            className={`${studioSecondaryButton} min-w-0`}
            data-source-quality-adjustment-undo=""
            onClick={handleUndo}
          >
            Undo adjustment
          </button>
          {showKeep ? (
            <button
              ref={keepButtonRef}
              type="button"
              className={`${studioGhostButton} min-w-0`}
              data-source-quality-adjustment-keep=""
              title="Removes the stored Undo history but does not revert the visual change."
              onClick={() => handleDismissOrKeep("keep")}
            >
              Keep adjustment
            </button>
          ) : null}
        </div>
      ) : null}

      {showKeep ? (
        <p className={`${studioSubtleText} text-[11px] leading-snug`}>
          Keep removes the stored Undo history but does not revert the visual
          change.
        </p>
      ) : null}

      {showDismiss ? (
        <button
          ref={dismissButtonRef}
          type="button"
          className={`${studioGhostButton} min-w-0`}
          data-source-quality-adjustment-dismiss=""
          onClick={() => handleDismissOrKeep("dismiss")}
        >
          Dismiss saved adjustment info
        </button>
      ) : null}

      {showUndo &&
      effectiveStatus === "stale" &&
      staleness.reasons.includes("RECOMMENDATION_CHANGED") &&
      !staleness.reasons.includes("FRAMING_CHANGED") &&
      !staleness.reasons.includes("MEDIA_CHANGED") &&
      !staleness.reasons.includes("MEDIA_ITEM_CHANGED") ? (
        <p className={`${studioSubtleText} text-[11px] leading-snug`}>
          Exact Undo is still available for the framing that was applied.
        </p>
      ) : null}

      <p
        id={statusId}
        className="sr-only"
        role="status"
        aria-live="polite"
        data-source-quality-adjustment-status-live=""
      >
        {politeStatus}
      </p>
      {alertMessage ? (
        <p
          className="text-[11px] leading-snug text-red-300/90"
          role="alert"
          data-source-quality-adjustment-alert=""
          data-source-quality-adjustment-alert-code={alertCode ?? undefined}
        >
          {alertMessage}
        </p>
      ) : null}
    </div>
  );
}
