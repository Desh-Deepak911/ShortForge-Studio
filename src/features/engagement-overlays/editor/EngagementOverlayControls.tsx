"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import StudioNumberStepper from "@/components/ui/StudioNumberStepper";
import type { FootieScript } from "@/features/story/types";
import { useEngagementOverlaysEnabled } from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";
import {
  studioDestructiveButton,
  studioFieldLabel,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import {
  ENGAGEMENT_OVERLAY_KIND_OPTIONS,
  ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
  ENGAGEMENT_OVERLAY_POSITION_OPTIONS,
} from "../domain/engagement-overlay.presets";
import { getSceneEngagementOverlay } from "../domain/normalize-engagement-overlays";
import {
  addEngagementOverlay,
  removeEngagementOverlay,
  setEngagementOverlayDurationMs,
  setEngagementOverlayKind,
  setEngagementOverlayPosition,
  setEngagementOverlayStartMs,
  type EngagementOverlayCommandOptions,
  type EngagementOverlayCommandResult,
} from "./engagement-overlay.commands";

export interface EngagementOverlayControlsProps {
  controlId: string;
  script: FootieScript;
  sceneId: string;
  sceneDurationMs: number;
  disabled?: boolean;
  /**
   * Prefer an explicit parent gate (`capabilitiesReady && enabled`) so the
   * control never flashes before capability fetch settles.
   * Falls back to the visual-retention context hook when omitted.
   */
  engagementOverlaysEnabled?: boolean;
  /** When explicitly false, render nothing (no flash while capabilities load). */
  capabilitiesReady?: boolean;
  onScriptCommit: (result: EngagementOverlayCommandResult) => void;
}

type PendingFocusTarget = "add" | "kind" | "remove" | null;

const radioSelectedClass =
  "max-w-full shrink rounded-md border border-foreground/30 bg-foreground/10 px-2 py-1 text-[11px] font-medium text-foreground";
const radioIdleClass =
  "max-w-full shrink rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:border-foreground/20 hover:text-foreground";

function msToSeconds(ms: number): number {
  return Math.round(ms) / 1000;
}

export default function EngagementOverlayControls({
  controlId,
  script,
  sceneId,
  sceneDurationMs,
  disabled = false,
  engagementOverlaysEnabled,
  capabilitiesReady,
  onScriptCommit,
}: EngagementOverlayControlsProps) {
  const statusId = useId();
  const contextEnabled = useEngagementOverlaysEnabled();
  const enabled =
    typeof engagementOverlaysEnabled === "boolean"
      ? engagementOverlaysEnabled
      : contextEnabled;

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const kindButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const positionButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusRef = useRef<PendingFocusTarget>(null);
  const [focusEpoch, setFocusEpoch] = useState(0);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsAlert, setStatusIsAlert] = useState(false);

  const overlay = getSceneEngagementOverlay(script, sceneId);
  const commandOptions: EngagementOverlayCommandOptions = {
    engagementOverlaysEnabled: enabled,
  };

  const kindIndex = Math.max(
    0,
    ENGAGEMENT_OVERLAY_KIND_OPTIONS.findIndex(
      (option) => option.id === overlay?.kind,
    ),
  );
  const positionIndex = Math.max(
    0,
    ENGAGEMENT_OVERLAY_POSITION_OPTIONS.findIndex(
      (option) => option.id === overlay?.position,
    ),
  );

  const sceneDurationSeconds = Math.max(0, msToSeconds(sceneDurationMs));
  const maxDurationSeconds = Math.min(
    ENGAGEMENT_OVERLAY_MAX_DURATION_MS / 1000,
    sceneDurationSeconds || ENGAGEMENT_OVERLAY_MAX_DURATION_MS / 1000,
  );

  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    if (target === "add") {
      addButtonRef.current?.focus();
      return;
    }
    if (target === "remove") {
      removeButtonRef.current?.focus();
      return;
    }
    if (target === "kind") {
      kindButtonRefs.current[kindIndex]?.focus();
    }
  }, [focusEpoch, kindIndex, overlay?.id]);

  const queueFocus = (target: PendingFocusTarget) => {
    pendingFocusRef.current = target;
    setFocusEpoch((value) => value + 1);
  };

  const commit = (
    result: EngagementOverlayCommandResult,
    trigger?: "add" | "kind" | "position" | "timing" | "remove",
  ) => {
    if (result.status === "terminal") {
      setStatusMessage(
        result.message ?? "That engagement prompt change could not be applied.",
      );
      setStatusIsAlert(true);
      // Keep focus on the control that triggered the failure.
      return;
    }

    onScriptCommit(result);
    setStatusMessage(result.warnings[0] ?? null);
    setStatusIsAlert(false);

    if (result.focusTarget === "kind" || result.focusTarget === "add") {
      queueFocus(result.focusTarget);
    } else if (trigger === "remove") {
      queueFocus("add");
    }
  };

  const handleKindKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !overlay) return;
    const options = ENGAGEMENT_OVERLAY_KIND_OPTIONS;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (kindIndex + 1) % options.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (kindIndex - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    const nextKind = options[nextIndex]!.id;
    commit(
      setEngagementOverlayKind(script, sceneId, nextKind, commandOptions),
      "kind",
    );
    requestAnimationFrame(() => {
      kindButtonRefs.current[nextIndex!]?.focus();
    });
  };

  const handlePositionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !overlay) return;
    const options = ENGAGEMENT_OVERLAY_POSITION_OPTIONS;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (positionIndex + 1) % options.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (positionIndex - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    const nextPosition = options[nextIndex]!.id;
    commit(
      setEngagementOverlayPosition(
        script,
        sceneId,
        nextPosition,
        commandOptions,
      ),
      "position",
    );
    requestAnimationFrame(() => {
      positionButtonRefs.current[nextIndex!]?.focus();
    });
  };

  if (capabilitiesReady === false) {
    return null;
  }

  if (!enabled) {
    return null;
  }

  return (
    <div
      className="min-w-0 max-w-full space-y-2 overflow-x-hidden border-t border-border/60 pt-3"
      data-engagement-overlay-controls="true"
    >
      <div className="space-y-1">
        <p className={studioFieldLabel}>Engagement prompt</p>
        <p className={studioSubtleText}>
          A short on-screen nudge during this scene. Timing stays inside the
          scene and never changes its length.
        </p>
      </div>

      {!overlay ? (
        <button
          ref={addButtonRef}
          type="button"
          className={studioSecondaryButton}
          disabled={disabled}
          data-engagement-overlay-add="true"
          aria-label="Add engagement prompt"
          onClick={() => {
            commit(addEngagementOverlay(script, sceneId, commandOptions), "add");
          }}
        >
          Add engagement prompt
        </button>
      ) : (
        <>
          <div className="min-w-0 space-y-1.5">
            <p id={`${controlId}-kind-label`} className={studioFieldLabel}>
              Prompt
            </p>
            <div
              role="radiogroup"
              aria-labelledby={`${controlId}-kind-label`}
              aria-activedescendant={`${controlId}-kind-${overlay.kind}`}
              className="flex max-w-full flex-wrap gap-1.5"
              data-engagement-overlay-kind-group="true"
              onKeyDown={handleKindKeyDown}
            >
              {ENGAGEMENT_OVERLAY_KIND_OPTIONS.map((option, index) => {
                const selected = overlay.kind === option.id;
                return (
                  <button
                    key={option.id}
                    id={`${controlId}-kind-${option.id}`}
                    ref={(node) => {
                      kindButtonRefs.current[index] = node;
                    }}
                    type="button"
                    role="radio"
                    tabIndex={selected ? 0 : -1}
                    aria-checked={selected}
                    disabled={disabled}
                    data-engagement-overlay-kind={option.id}
                    data-selected={selected ? "true" : "false"}
                    className={selected ? radioSelectedClass : radioIdleClass}
                    onClick={() => {
                      commit(
                        setEngagementOverlayKind(
                          script,
                          sceneId,
                          option.id as EngagementOverlayKind,
                          commandOptions,
                        ),
                        "kind",
                      );
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <p id={`${controlId}-position-label`} className={studioFieldLabel}>
              Position
            </p>
            <div
              role="radiogroup"
              aria-labelledby={`${controlId}-position-label`}
              aria-activedescendant={`${controlId}-position-${overlay.position}`}
              className="flex max-w-full flex-wrap gap-1.5"
              data-engagement-overlay-position-group="true"
              onKeyDown={handlePositionKeyDown}
            >
              {ENGAGEMENT_OVERLAY_POSITION_OPTIONS.map((option, index) => {
                const selected = overlay.position === option.id;
                return (
                  <button
                    key={option.id}
                    id={`${controlId}-position-${option.id}`}
                    ref={(node) => {
                      positionButtonRefs.current[index] = node;
                    }}
                    type="button"
                    role="radio"
                    tabIndex={selected ? 0 : -1}
                    aria-checked={selected}
                    disabled={disabled}
                    data-engagement-overlay-position={option.id}
                    data-selected={selected ? "true" : "false"}
                    className={selected ? radioSelectedClass : radioIdleClass}
                    onClick={() => {
                      commit(
                        setEngagementOverlayPosition(
                          script,
                          sceneId,
                          option.id as EngagementOverlayPosition,
                          commandOptions,
                        ),
                        "position",
                      );
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor={`${controlId}-start`}
                className={studioFieldLabel}
              >
                Start
              </label>
              <StudioNumberStepper
                id={`${controlId}-start`}
                compact
                suffix="s"
                min={0}
                max={sceneDurationSeconds}
                step={0.1}
                value={msToSeconds(overlay.startOffsetMs)}
                disabled={disabled}
                aria-label="Engagement prompt start in seconds"
                data-engagement-overlay-start="true"
                onStepValue={(value) => {
                  commit(
                    setEngagementOverlayStartMs(
                      script,
                      sceneId,
                      value,
                      commandOptions,
                    ),
                    "timing",
                  );
                }}
                onValueCommit={(value) => {
                  commit(
                    setEngagementOverlayStartMs(
                      script,
                      sceneId,
                      value,
                      commandOptions,
                    ),
                    "timing",
                  );
                }}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor={`${controlId}-duration`}
                className={studioFieldLabel}
              >
                Duration
              </label>
              <StudioNumberStepper
                id={`${controlId}-duration`}
                compact
                suffix="s"
                min={0}
                max={maxDurationSeconds}
                step={0.1}
                value={msToSeconds(overlay.durationMs)}
                disabled={disabled}
                aria-label="Engagement prompt duration in seconds"
                data-engagement-overlay-duration="true"
                onStepValue={(value) => {
                  commit(
                    setEngagementOverlayDurationMs(
                      script,
                      sceneId,
                      value,
                      commandOptions,
                    ),
                    "timing",
                  );
                }}
                onValueCommit={(value) => {
                  commit(
                    setEngagementOverlayDurationMs(
                      script,
                      sceneId,
                      value,
                      commandOptions,
                    ),
                    "timing",
                  );
                }}
              />
            </div>
          </div>

          <button
            ref={removeButtonRef}
            type="button"
            className={studioDestructiveButton}
            disabled={disabled}
            data-engagement-overlay-remove="true"
            aria-label="Remove engagement prompt"
            onClick={() => {
              commit(
                removeEngagementOverlay(script, sceneId, commandOptions),
                "remove",
              );
            }}
          >
            Remove
          </button>
        </>
      )}

      <p
        id={statusId}
        className={studioSubtleText}
        role={statusIsAlert ? "alert" : "status"}
        aria-live={statusIsAlert ? "assertive" : "polite"}
      >
        {statusMessage}
      </p>
    </div>
  );
}
