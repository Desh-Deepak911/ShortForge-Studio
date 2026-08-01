"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { FootieScene, FootieScript } from "@/features/story/types";
import type { StoryScriptChangeOptions } from "@/lib/utils/voiceover";
import {
  studioFieldLabel,
  studioGhostButton,
  studioPrimaryButton,
  studioSecondaryButton,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
  studioSubtleText,
  studioWarningPanel,
} from "@/lib/utils/studioUi";

import { projectSceneVisualBeatPlanContext } from "../adapters/project-scene-visual-beat-plan";
import type { VisualBeatPlanStaleReason } from "../domain/evaluate-visual-beat-plan-staleness";
import type {
  VisualBeatCommandTerminalCode,
  VisualBeatDensity,
  VisualBeatPlanWarningCode,
} from "../domain/visual-beat-plan";
import * as visualBeatPlanCommands from "./visual-beat-plan.commands";
import VisualPacingSuggestionPreview, {
  formatVisualPacingChangesLabel,
} from "./VisualPacingSuggestionPreview";
import { useVisualPacingSelection } from "./useVisualPacingSelection";

/**
 * Mutable command runner for the panel. Production defaults to domain commands;
 * mounted verification may replace a single method without redefining ESM exports.
 */
export const visualPacingPanelCommandRunner = {
  suggestVisualBeatPlan: visualBeatPlanCommands.suggestVisualBeatPlan,
  applyVisualBeatPlan: visualBeatPlanCommands.applyVisualBeatPlan,
  discardVisualBeatPlan: visualBeatPlanCommands.discardVisualBeatPlan,
  projectVisualBeatPlanStalenessForScene:
    visualBeatPlanCommands.projectVisualBeatPlanStalenessForScene,
};

export interface VisualPacingPanelProps {
  readonly script: FootieScript;
  readonly scene: FootieScene;
  readonly onScriptChange: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
  readonly visualBeatDensityEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}

const DENSITY_OPTIONS: readonly {
  readonly value: VisualBeatDensity;
  readonly label: string;
  readonly supporting: string;
}[] = [
  { value: "fast", label: "More changes", supporting: "Fast" },
  { value: "balanced", label: "Balanced", supporting: "Recommended" },
  { value: "studio", label: "Fewer, clearer cuts", supporting: "Studio" },
];

const STALE_PRIMARY =
  "Pacing suggestion is out of date because narration, duration, visuals, or timing changed.";

const STALE_REASON_COPY: Record<VisualBeatPlanStaleReason, string> = {
  NARRATION_CHANGED: "Narration text changed since this suggestion was made.",
  DURATION_CHANGED: "Scene duration changed since this suggestion was made.",
  MEDIA_CHANGED: "Visuals changed since this suggestion was made.",
  MEDIA_ORDER_CHANGED: "Visual order changed since this suggestion was made.",
  DENSITY_CHANGED: "Density selection no longer matches this suggestion.",
  GENERATOR_CHANGED: "Pacing rules were updated; suggest again to continue.",
  TIMING_CHANGED: "Sequence timing was edited manually.",
  PLAN_INVALID: "This pacing suggestion can no longer be read.",
};

const WARNING_COPY: Record<VisualBeatPlanWarningCode | "BEATS_PLAN_MALFORMED_IGNORED", string> =
  {
    BEATS_ANCHORS_FALLBACK:
      "Narration cues were estimated; timing is a best-effort split.",
    BEATS_EQUAL_SPLIT_USED: "Even spacing was used across the scene.",
    BEATS_FEWER_VISUALS_THAN_TARGET:
      "This pacing prefers more visuals than are available. Add more visuals for closer pacing.",
    BEATS_MORE_VISUALS_THAN_TARGET:
      "All visuals remain included, even though this pacing prefers fewer cuts.",
    BEATS_PLAN_MALFORMED_IGNORED:
      "Saved pacing metadata could not be read. Discard it, then suggest again.",
  };

const TERMINAL_COPY: Record<VisualBeatCommandTerminalCode, string> = {
  BEATS_CAPABILITY_OFF: "Visual pacing is unavailable right now.",
  BEATS_PLAN_MISSING: "No pacing suggestion is available to apply.",
  BEATS_PLAN_INVALID:
    "This pacing suggestion is invalid. Discard it and suggest again.",
  BEATS_PLAN_STALE:
    "Pacing suggestion is out of date. Suggest again before applying.",
  BEATS_NO_USABLE_VISUALS: "Add visuals before suggesting pacing.",
  BEATS_SCENE_TOO_SHORT:
    "Scene is too short for the current visuals and pacing.",
  BEATS_INVALID_DURATION: "Scene duration is invalid for pacing suggestions.",
};

function mapWarningCopy(code: string): string {
  if (code in WARNING_COPY) {
    return WARNING_COPY[code as keyof typeof WARNING_COPY];
  }
  return "Pacing note: review the suggestion before applying.";
}

function mapTerminalCopy(code: VisualBeatCommandTerminalCode): string {
  return TERMINAL_COPY[code] ?? "Could not complete the pacing action.";
}

function handleDensityRadiogroupKeyDown(
  event: KeyboardEvent<HTMLElement>,
  current: VisualBeatDensity,
  onChange: (density: VisualBeatDensity) => void,
): void {
  const currentIndex = DENSITY_OPTIONS.findIndex(
    (option) => option.value === current,
  );
  if (currentIndex < 0) return;

  let nextIndex = currentIndex;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % DENSITY_OPTIONS.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + DENSITY_OPTIONS.length) % DENSITY_OPTIONS.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = DENSITY_OPTIONS.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextValue = DENSITY_OPTIONS[nextIndex]!.value;
  onChange(nextValue);
  const group = event.currentTarget;
  window.requestAnimationFrame(() => {
    group
      .querySelector<HTMLButtonElement>(
        `[data-visual-pacing-density="${nextValue}"]`,
      )
      ?.focus();
  });
}

export default function VisualPacingPanel({
  script,
  scene,
  onScriptChange,
  visualBeatDensityEnabled,
  mixedMediaScenesEnabled,
}: VisualPacingPanelProps) {
  const headingId = useId();
  const densityLabelId = useId();
  const statusId = useId();
  const suggestButtonRef = useRef<HTMLButtonElement>(null);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const discardButtonRef = useRef<HTMLButtonElement>(null);
  /** Surviving Suggest control after a successful user action — applied post-commit only. */
  const pendingSuggestFocusRef = useRef(false);
  const [pendingSuggestFocusEpoch, setPendingSuggestFocusEpoch] = useState(0);

  const [politeStatus, setPoliteStatus] = useState<string>("");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertCode, setAlertCode] = useState<string | null>(null);

  const capabilitiesOn =
    visualBeatDensityEnabled === true && mixedMediaScenesEnabled === true;

  const requestSuggestFocusAfterCommit = useCallback(() => {
    pendingSuggestFocusRef.current = true;
    setPendingSuggestFocusEpoch((epoch) => epoch + 1);
  }, []);

  useLayoutEffect(() => {
    if (!pendingSuggestFocusRef.current) {
      return;
    }
    if (!capabilitiesOn) {
      pendingSuggestFocusRef.current = false;
      return;
    }
    const target = suggestButtonRef.current;
    if (target) {
      target.focus();
    }
    pendingSuggestFocusRef.current = false;
  }, [pendingSuggestFocusEpoch, capabilitiesOn, scene.id, scene.visualBeatPlan]);

  // Capability-off: do not read or apply plan metadata.
  const context = useMemo(
    () => (capabilitiesOn ? projectSceneVisualBeatPlanContext(scene) : null),
    [capabilitiesOn, scene],
  );

  const provisionalStaleness = useMemo(() => {
    if (!capabilitiesOn) return null;
    return visualPacingPanelCommandRunner.projectVisualBeatPlanStalenessForScene(
      scene,
    );
  }, [capabilitiesOn, scene]);

  const planDensity = provisionalStaleness?.plan?.density;
  const { selectedDensity, setSelectedDensity } = useVisualPacingSelection(
    scene.id,
    planDensity,
  );

  const staleness = useMemo(() => {
    if (!capabilitiesOn) return null;
    return visualPacingPanelCommandRunner.projectVisualBeatPlanStalenessForScene(
      scene,
      selectedDensity,
    );
  }, [capabilitiesOn, scene, selectedDensity]);

  const usableCount = context?.usableMedia.length ?? 0;
  const canSuggest = usableCount >= 2;
  const effectiveStatus = staleness?.effectiveStatus ?? "absent";
  const plan = staleness?.plan;
  const applyAllowed = staleness?.applyAllowed === true;
  const isDraft = effectiveStatus === "draft";
  const isApplied = effectiveStatus === "applied";
  const isStale = effectiveStatus === "stale";
  const isInvalid = effectiveStatus === "invalid";
  const warningMessages = useMemo(() => {
    if (!plan) return [] as Array<{ code: string; message: string }>;
    return plan.warningCodes.map((code) => ({
      code,
      message: mapWarningCopy(code),
    }));
  }, [plan]);

  const staleSecondary = useMemo(() => {
    if (!staleness || staleness.staleReasons.length === 0) return [];
    return staleness.staleReasons.map((reason) => ({
      code: reason,
      message: STALE_REASON_COPY[reason],
    }));
  }, [staleness]);

  const clearAlert = useCallback(() => {
    setAlertMessage(null);
    setAlertCode(null);
  }, []);

  const commitScript = useCallback(
    (next: FootieScript, status: string) => {
      onScriptChange(next, { intent: "media" });
      setPoliteStatus(status);
      clearAlert();
    },
    [clearAlert, onScriptChange],
  );

  const handleSuggest = useCallback(() => {
    if (!capabilitiesOn || !canSuggest) return;
    const result = visualPacingPanelCommandRunner.suggestVisualBeatPlan(script, {
      sceneId: scene.id,
      density: selectedDensity,
      generatedAtIso: new Date().toISOString(),
      visualBeatDensityEnabled: true,
    });
    if (!result.ok) {
      setAlertCode(result.terminalCode);
      setAlertMessage(mapTerminalCopy(result.terminalCode));
      setPoliteStatus("");
      // Failure: Suggest remains mounted — keep focus on the action that failed.
      suggestButtonRef.current?.focus();
      return;
    }
    requestSuggestFocusAfterCommit();
    commitScript(result.script, "Pacing suggestion ready. Timing unchanged until you apply.");
  }, [
    canSuggest,
    capabilitiesOn,
    commitScript,
    requestSuggestFocusAfterCommit,
    scene.id,
    script,
    selectedDensity,
  ]);

  const handleApply = useCallback(() => {
    if (!capabilitiesOn || !applyAllowed) return;
    const result = visualPacingPanelCommandRunner.applyVisualBeatPlan(script, {
      sceneId: scene.id,
      selectedDensity,
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    if (!result.ok) {
      setAlertCode(result.terminalCode);
      setAlertMessage(mapTerminalCopy(result.terminalCode));
      setPoliteStatus("");
      // Failure: Apply remains mounted when still offered — keep focus there.
      applyButtonRef.current?.focus();
      return;
    }
    // Apply unmounts; focus surviving Suggest again after the committed render.
    requestSuggestFocusAfterCommit();
    commitScript(
      result.script,
      `Narration-driven pacing applied. ${formatVisualPacingChangesLabel(
        result.plan?.proposedStartOffsetsMs ?? [],
      )}`,
    );
  }, [
    applyAllowed,
    capabilitiesOn,
    commitScript,
    requestSuggestFocusAfterCommit,
    scene.id,
    script,
    selectedDensity,
  ]);

  const handleDiscard = useCallback(() => {
    if (!capabilitiesOn) return;
    const wasAppliedOrStale =
      effectiveStatus === "applied" ||
      effectiveStatus === "stale" ||
      scene.visualBeatPlan?.status === "applied";
    const result = visualPacingPanelCommandRunner.discardVisualBeatPlan(script, {
      sceneId: scene.id,
    });
    if (!result.ok) {
      setAlertCode(result.terminalCode);
      setAlertMessage(mapTerminalCopy(result.terminalCode));
      setPoliteStatus("");
      discardButtonRef.current?.focus();
      return;
    }
    const status = wasAppliedOrStale
      ? "Pacing metadata removed. Current sequence timing is unchanged."
      : "Pacing suggestion discarded.";
    // Discard unmounts; focus surviving Suggest pacing after the committed render.
    requestSuggestFocusAfterCommit();
    commitScript(result.script, status);
  }, [
    capabilitiesOn,
    commitScript,
    effectiveStatus,
    requestSuggestFocusAfterCommit,
    scene.id,
    scene.visualBeatPlan?.status,
    script,
  ]);

  if (!capabilitiesOn) {
    return null;
  }

  const discardHint =
    isApplied || isStale
      ? "Discard removes the pacing suggestion only. Current sequence timing stays as it is."
      : null;

  return (
    <section
      className="space-y-3 rounded-xl bg-background/20 px-3 py-3 ring-1 ring-border/30"
      data-visual-pacing-panel
      data-visual-pacing-status={effectiveStatus}
      aria-labelledby={headingId}
    >
      <div>
        <h3
          id={headingId}
          className="text-[11px] font-medium text-foreground/85"
        >
          Visual pacing
        </h3>
        <p className={`${studioSubtleText} mt-1`}>
          Controls how often visuals change during narration — not export
          quality or render speed.
        </p>
      </div>

      <div>
        <p id={densityLabelId} className={studioFieldLabel}>
          Density
        </p>
        <div
          className={`${studioSegmentedControl} flex-col gap-1 sm:flex-row sm:gap-0`}
          role="radiogroup"
          aria-labelledby={densityLabelId}
          data-visual-pacing-density-group
          onKeyDown={(event) =>
            handleDensityRadiogroupKeyDown(
              event,
              selectedDensity,
              setSelectedDensity,
            )
          }
        >
          {DENSITY_OPTIONS.map((option) => {
            const isActive = selectedDensity === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                data-visual-pacing-density={option.value}
                onClick={() => setSelectedDensity(option.value)}
                className={`${isActive ? studioSegmentActive : studioSegment} flex-col gap-0.5 py-2`}
              >
                <span>{option.label}</span>
                <span
                  className={`text-[10px] font-normal ${
                    isActive ? "text-foreground/70" : "text-muted"
                  }`}
                >
                  {option.supporting}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!canSuggest ? (
        <p
          className="text-xs leading-relaxed text-muted"
          data-visual-pacing-need-visuals
        >
          Add another visual to use pacing suggestions.
        </p>
      ) : null}

      {isInvalid ? (
        <div
          className={studioWarningPanel}
          data-visual-pacing-invalid
          data-visual-pacing-warning-code="BEATS_PLAN_MALFORMED_IGNORED"
        >
          <p className="text-xs leading-relaxed">
            {staleness?.recoverableWarning
              ? "Saved pacing metadata could not be read. Discard it to clear, then suggest again. Existing timing and export remain usable."
              : WARNING_COPY.BEATS_PLAN_MALFORMED_IGNORED}
          </p>
        </div>
      ) : null}

      {isStale ? (
        <div className={studioWarningPanel} data-visual-pacing-stale>
          <p className="text-xs font-medium leading-relaxed">{STALE_PRIMARY}</p>
          {staleSecondary.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {staleSecondary.map((entry) => (
                <li
                  key={entry.code}
                  className="text-[11px] leading-relaxed text-amber-100/90"
                  data-visual-pacing-stale-reason={entry.code}
                >
                  {entry.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {(isDraft || isApplied) && plan ? (
        <VisualPacingSuggestionPreview
          offsetsMs={plan.proposedStartOffsetsMs}
          sceneDurationMs={context?.sceneDurationMs ?? 0}
          label={
            isApplied
              ? "Applied narration-driven pacing"
              : "Suggested pacing"
          }
          applied={isApplied}
        />
      ) : null}

      {isApplied ? (
        <p
          className="text-xs leading-relaxed text-foreground/85"
          data-visual-pacing-applied-confirm
        >
          Narration-driven pacing is applied for this scene
          {plan ? ` (${plan.density})` : ""}. Manual Visual sequence controls
          remain available.
        </p>
      ) : null}

      {warningMessages.map((warning) => (
        <p
          key={warning.code}
          className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-100 ring-1 ring-amber-400/30"
          data-visual-pacing-warning-code={warning.code}
        >
          {warning.message}
        </p>
      ))}

      {discardHint ? (
        <p className={`${studioSubtleText}`} data-visual-pacing-discard-hint>
          {discardHint}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          ref={suggestButtonRef}
          type="button"
          className={studioSecondaryButton}
          onClick={handleSuggest}
          disabled={!canSuggest}
          aria-disabled={!canSuggest}
          title={
            !canSuggest
              ? "Add another visual to use pacing suggestions."
              : isApplied || isStale
                ? "Suggest pacing again"
                : "Suggest pacing"
          }
          data-visual-pacing-suggest
        >
          {isApplied || isStale || isDraft ? "Suggest again" : "Suggest pacing"}
        </button>

        {isDraft && applyAllowed ? (
          <button
            ref={applyButtonRef}
            type="button"
            className={studioPrimaryButton}
            onClick={handleApply}
            data-visual-pacing-apply
          >
            Apply to sequence
          </button>
        ) : null}

        {effectiveStatus !== "absent" ? (
          <button
            ref={discardButtonRef}
            type="button"
            className={studioGhostButton}
            onClick={handleDiscard}
            data-visual-pacing-discard
            title={
              discardHint ??
              "Remove the pacing suggestion without changing sequence timing."
            }
          >
            Discard
          </button>
        ) : null}
      </div>

      <div
        id={statusId}
        role="status"
        aria-live="polite"
        className="sr-only"
        data-visual-pacing-live-status
      >
        {politeStatus}
      </div>

      {alertMessage ? (
        <div
          role="alert"
          className={studioWarningPanel}
          data-visual-pacing-alert
          data-visual-pacing-alert-code={alertCode ?? undefined}
        >
          <p className="text-xs leading-relaxed">{alertMessage}</p>
        </div>
      ) : null}
    </section>
  );
}
