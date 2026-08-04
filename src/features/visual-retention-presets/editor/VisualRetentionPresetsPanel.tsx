"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { FootieScript } from "@/features/story/types";
import {
  studioPrimaryButton,
  studioSecondaryButton,
  studioSubtleText,
  studioWarningPanel,
} from "@/lib/utils/studioUi";

import { projectStoryVisualRetentionPresetInput } from "../adapters/project-story-visual-retention-preset-input";
import { buildVisualRetentionPresetApplicationPlan } from "../domain/build-visual-retention-preset-plan";
import {
  evaluateVisualRetentionPresetStaleness,
  type VisualRetentionPresetStaleReason,
} from "../domain/evaluate-visual-retention-preset-staleness";
import {
  getVisualRetentionPresetById,
  isPromotionalVisualRetentionPreset,
  listVisualRetentionPresets,
} from "../domain/visual-retention-preset.catalog";
import {
  isVisualRetentionPresetId,
  type VisualRetentionPresetId,
} from "../domain/visual-retention-preset.types";
import {
  applyVisualRetentionPresetPlan,
  dismissVisualRetentionPresetApplication,
  keepVisualRetentionPresetApplication,
  undoVisualRetentionPresetApplication,
  type VisualRetentionPresetApplyTerminalCode,
  type VisualRetentionPresetCommandCapabilities,
  type VisualRetentionPresetDismissTerminalCode,
  type VisualRetentionPresetUndoTerminalCode,
} from "./visual-retention-preset.commands";
import VisualRetentionPresetPlanPreview from "./VisualRetentionPresetPlanPreview";
import { useVisualRetentionPresetSelection } from "./useVisualRetentionPresetSelection";

export type VisualRetentionPresetsPanelCapabilities =
  VisualRetentionPresetCommandCapabilities;

export interface VisualRetentionPresetsPanelProps {
  readonly script: FootieScript;
  readonly onScriptChange: (script: FootieScript) => void;
  /** Stable opened-project identity from parent; parent remounts via key. */
  readonly projectKey: string;
  readonly capabilities: VisualRetentionPresetsPanelCapabilities;
}

/** Post-commit intents resolve against enabled controls after the parent commit. */
type PendingFocusIntent = "undo" | "apply-or-radio";

const APPLY_TERMINAL_COPY: Record<VisualRetentionPresetApplyTerminalCode, string> = {
  PRESET_APPLY_CAPABILITIES_NOT_READY:
    "Visual Retention Presets are still loading. Try again in a moment.",
  PRESET_APPLY_CAPABILITY_OFF:
    "Visual Retention Presets are unavailable for this workspace.",
  PRESET_APPLY_INVALID_PLAN: "This preset plan could not be applied.",
  PRESET_APPLY_STALE_PLAN:
    "The story changed since this plan was built. Review the preview and try Apply again.",
  PRESET_APPLY_GENERATED_AT_REQUIRED:
    "Pacing suggestions need a generation time. Try Apply again.",
  PRESET_APPLY_NO_CHANGES: "There are no planned changes to apply.",
  PRESET_APPLY_ACTION_FAILED:
    "A planned change could not be applied. Your story was left unchanged.",
  PRESET_APPLY_PROVENANCE_ACTIVE:
    "A preset is already applied. Choose Undo, Keep, or Dismiss before applying another.",
};

const UNDO_TERMINAL_COPY: Record<VisualRetentionPresetUndoTerminalCode, string> = {
  PRESET_UNDO_CAPABILITIES_NOT_READY:
    "Visual Retention Presets are still loading. Try again in a moment.",
  PRESET_UNDO_CAPABILITY_OFF:
    "Visual Retention Presets are unavailable for this workspace.",
  PRESET_UNDO_NOT_AVAILABLE: "Undo is not available for this preset record.",
  PRESET_UNDO_PROVENANCE_INVALID:
    "Saved preset history could not be read. Current settings are unchanged.",
  PRESET_UNDO_MANUAL_OVERRIDE:
    "Settings were changed manually after Apply. Undo is not available.",
  PRESET_UNDO_UNDERLYING_CAPABILITY_OFF:
    "A required feature is off, so Undo cannot safely restore prior settings.",
  PRESET_UNDO_ACTION_FAILED:
    "Undo could not finish. Your story was left unchanged.",
};

const DISMISS_TERMINAL_COPY: Record<
  VisualRetentionPresetDismissTerminalCode,
  string
> = {
  PRESET_DISMISS_CAPABILITIES_NOT_READY:
    "Visual Retention Presets are still loading. Try again in a moment.",
  PRESET_DISMISS_CAPABILITY_OFF:
    "Visual Retention Presets are unavailable for this workspace.",
};

const STALE_REASON_COPY: Record<VisualRetentionPresetStaleReason, string> = {
  PRESET_CATALOG_CHANGED:
    "The preset catalog changed since this was applied. Undo may still restore prior settings.",
  PRESET_TARGET_MISSING:
    "Some targets from the original Apply are missing. Undo may skip those parts.",
  PRESET_MANUAL_OVERRIDE_AFTER_APPLY:
    "Settings were changed manually after Apply. Undo is not offered.",
  PRESET_UNDERLYING_CAPABILITY_OFF:
    "A required feature is off, so Undo cannot safely restore prior settings.",
  PRESET_PLAN_FINGERPRINT_MISMATCH:
    "Applied settings no longer match the saved preset record.",
  PRESET_PROVENANCE_INVALID:
    "Saved preset history could not be read. Current settings are unchanged.",
};

function isEnabledButton(node: HTMLButtonElement | null): node is HTMLButtonElement {
  return (
    !!node &&
    node.disabled !== true &&
    node.getAttribute("aria-disabled") !== "true"
  );
}

function focusPresetRadio(
  group: HTMLElement | null,
  presetId: VisualRetentionPresetId,
): boolean {
  const node = group?.querySelector<HTMLButtonElement>(
    `[data-visual-retention-preset-id="${presetId}"]`,
  );
  if (!node) return false;
  node.focus();
  return true;
}

/** Walk ancestors — do not rely on Element.closest (minimal harnesses may stub it). */
function resolvePresetRadioTarget(
  target: EventTarget | null,
): HTMLElement | null {
  let node = target as (HTMLElement & { parentNode?: unknown }) | null;
  while (node) {
    if (
      typeof node.getAttribute === "function" &&
      node.getAttribute("data-visual-retention-preset-id")
    ) {
      return node;
    }
    node = (node.parentNode as typeof node) ?? null;
  }
  return null;
}

function handlePresetRadiogroupKeyDown(
  event: KeyboardEvent<HTMLElement>,
  selectAdjacent: (delta: number) => VisualRetentionPresetId,
  selectFirst: () => VisualRetentionPresetId,
  selectLast: () => VisualRetentionPresetId,
  setSelectedPresetId: (id: VisualRetentionPresetId | null) => void,
): void {
  let nextId: VisualRetentionPresetId | null = null;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextId = selectAdjacent(1);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextId = selectAdjacent(-1);
  } else if (event.key === "Home") {
    nextId = selectFirst();
  } else if (event.key === "End") {
    nextId = selectLast();
  } else if (event.key === " " || event.key === "Enter") {
    const focused = resolvePresetRadioTarget(event.target);
    const focusedId = focused?.getAttribute("data-visual-retention-preset-id");
    if (isVisualRetentionPresetId(focusedId)) {
      event.preventDefault();
      setSelectedPresetId(focusedId);
      focusPresetRadio(event.currentTarget, focusedId);
    }
    return;
  } else {
    return;
  }

  event.preventDefault();
  if (nextId) {
    focusPresetRadio(event.currentTarget, nextId);
  }
}

/**
 * Project-level Visual Retention Preset chooser, plan preview, and Apply/Undo.
 * Local selection only — never writes selection to the story.
 */
export default function VisualRetentionPresetsPanel({
  script,
  onScriptChange,
  projectKey,
  capabilities,
}: VisualRetentionPresetsPanelProps) {
  const headingId = useId();
  const radiogroupRef = useRef<HTMLDivElement>(null);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<PendingFocusIntent | null>(null);
  const [pendingFocusEpoch, setPendingFocusEpoch] = useState(0);
  const [politeStatus, setPoliteStatus] = useState("");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertCode, setAlertCode] = useState<string | null>(null);

  const gateOpen =
    capabilities.ready === true &&
    capabilities.visualRetentionPresetsEnabled === true;

  const mixedMediaScenesEnabled = capabilities.mixedMediaScenesEnabled === true;

  const appliedPresetId = isVisualRetentionPresetId(
    script.visualRetentionPresetProvenance?.presetId,
  )
    ? script.visualRetentionPresetProvenance.presetId
    : null;

  const {
    selectedPresetId,
    setSelectedPresetId,
    selectAdjacent,
    selectFirst,
    selectLast,
  } = useVisualRetentionPresetSelection({
    appliedPresetId,
  });

  const presets = listVisualRetentionPresets();
  const selectedPreset =
    selectedPresetId != null
      ? getVisualRetentionPresetById(selectedPresetId)
      : null;

  // Staleness is provenance/story/capability derived — not local card selection.
  const staleness = gateOpen
    ? evaluateVisualRetentionPresetStaleness({
        script,
        capabilities: {
          ready: capabilities.ready === true,
          visualRetentionPresetsEnabled:
            capabilities.visualRetentionPresetsEnabled === true,
          visualBeatDensityEnabled: capabilities.visualBeatDensityEnabled === true,
          keyframedVisualEffectsEnabled:
            capabilities.keyframedVisualEffectsEnabled === true,
          engagementOverlaysEnabled:
            capabilities.engagementOverlaysEnabled === true,
          shortForgeBrandStingEnabled:
            capabilities.shortForgeBrandStingEnabled === true,
          mixedMediaScenesEnabled,
        },
      })
    : null;

  const effectiveStatus = staleness?.effectiveStatus ?? "absent";
  const normalizedProvenance = staleness?.provenance ?? null;

  /** Valid applied/stale/invalid projection blocks Apply. Sync may strip malformed rows to absent. */
  const provenanceBlocksApply =
    gateOpen && staleness != null && effectiveStatus !== "absent";

  const showUndo =
    normalizedProvenance != null &&
    staleness != null &&
    staleness.undoAllowed === true;

  const showKeep =
    normalizedProvenance != null &&
    staleness != null &&
    (effectiveStatus === "applied" ||
      (effectiveStatus === "stale" && staleness.undoAllowed));

  // Only offer Dismiss when a normalized provenance record is still present.
  const showDismiss =
    normalizedProvenance != null &&
    !showKeep &&
    !showUndo &&
    (effectiveStatus === "stale" || effectiveStatus === "invalid");

  const appliedPresetTitle =
    normalizedProvenance != null
      ? (getVisualRetentionPresetById(normalizedProvenance.presetId)?.title ??
        "Saved preset")
      : appliedPresetId != null
        ? (getVisualRetentionPresetById(appliedPresetId)?.title ?? "Saved preset")
        : null;

  const planningCapabilities: VisualRetentionPresetCommandCapabilities = {
    ready: capabilities.ready === true,
    visualRetentionPresetsEnabled:
      capabilities.visualRetentionPresetsEnabled === true,
    visualBeatDensityEnabled: capabilities.visualBeatDensityEnabled === true,
    keyframedVisualEffectsEnabled:
      capabilities.keyframedVisualEffectsEnabled === true,
    engagementOverlaysEnabled: capabilities.engagementOverlaysEnabled === true,
    shortForgeBrandStingEnabled:
      capabilities.shortForgeBrandStingEnabled === true,
    mixedMediaScenesEnabled,
  };

  const plan =
    gateOpen && selectedPresetId != null
      ? buildVisualRetentionPresetApplicationPlan({
          facts: projectStoryVisualRetentionPresetInput(script, {
            mixedMediaScenesEnabled,
          }),
          presetId: selectedPresetId,
          capabilities: planningCapabilities,
        })
      : null;

  const canApply =
    gateOpen &&
    selectedPresetId != null &&
    plan != null &&
    plan.status === "preview" &&
    plan.summary.actionCount > 0 &&
    !provenanceBlocksApply;

  const requestFocusAfterCommit = useCallback((intent: PendingFocusIntent) => {
    pendingFocusRef.current = intent;
    setPendingFocusEpoch((epoch) => epoch + 1);
  }, []);

  useLayoutEffect(() => {
    const intent = pendingFocusRef.current;
    if (!intent) return;
    if (!gateOpen) {
      // Capability-off: drop pending focus; do not move focus elsewhere.
      pendingFocusRef.current = null;
      return;
    }

    const focusEnabledApply = (): boolean => {
      if (!canApply) return false;
      const node = applyButtonRef.current;
      if (!isEnabledButton(node)) return false;
      node.focus();
      return true;
    };

    const focusSelectedRadio = (): boolean => {
      if (!selectedPresetId) return false;
      return focusPresetRadio(radiogroupRef.current, selectedPresetId);
    };

    if (intent === "undo") {
      const undo = undoButtonRef.current;
      if (showUndo && isEnabledButton(undo)) {
        undo.focus();
      } else if (!focusEnabledApply()) {
        focusSelectedRadio();
      }
    } else if (intent === "apply-or-radio") {
      if (!focusEnabledApply()) {
        focusSelectedRadio();
      }
    }

    pendingFocusRef.current = null;
  }, [
    pendingFocusEpoch,
    gateOpen,
    showUndo,
    canApply,
    selectedPresetId,
  ]);

  if (!gateOpen) {
    return null;
  }

  const failTerminal = (
    message: string,
    code: string,
    focus: "apply" | "undo" | "keep" | "dismiss",
  ) => {
    setPoliteStatus("");
    setAlertMessage(message);
    setAlertCode(code);
    // Failure retains focus on the surviving control that was used (may be disabled).
    if (focus === "apply") {
      applyButtonRef.current?.focus();
    } else if (focus === "undo") {
      undoButtonRef.current?.focus();
    } else if (focus === "keep") {
      keepButtonRef.current?.focus();
    } else if (focus === "dismiss") {
      dismissButtonRef.current?.focus();
    }
  };

  const handleApply = () => {
    if (!gateOpen || selectedPresetId == null || plan == null) return;
    if (plan.status !== "preview" || plan.summary.actionCount <= 0) return;

    const needsGeneratedAt = plan.actions.some(
      (action) => action.kind === "suggest-pacing",
    );
    const generatedAtIso = needsGeneratedAt
      ? new Date().toISOString()
      : undefined;

    const result = applyVisualRetentionPresetPlan({
      script,
      plan,
      capabilities: planningCapabilities,
      ...(generatedAtIso ? { generatedAtIso } : {}),
    });
    if (!result.ok) {
      failTerminal(
        APPLY_TERMINAL_COPY[result.terminalCode],
        result.terminalCode,
        "apply",
      );
      return;
    }
    const changeCount = result.provenance.changes.length;
    setAlertMessage(null);
    setAlertCode(null);
    setPoliteStatus(
      changeCount === 1
        ? "Applied 1 preset change."
        : `Applied ${changeCount} preset changes.`,
    );
    onScriptChange(result.script);
    requestFocusAfterCommit("undo");
  };

  const handleUndo = () => {
    if (!gateOpen) return;
    const result = undoVisualRetentionPresetApplication({
      script,
      capabilities: planningCapabilities,
    });
    if (!result.ok) {
      failTerminal(
        UNDO_TERMINAL_COPY[result.terminalCode],
        result.terminalCode,
        "undo",
      );
      return;
    }
    const warningText =
      result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";
    setAlertMessage(null);
    setAlertCode(null);
    setPoliteStatus(`Preset changes undone.${warningText}`.trim());
    onScriptChange(result.script);
    requestFocusAfterCommit("apply-or-radio");
  };

  const handleKeep = () => {
    if (!showKeep) return;
    const result = keepVisualRetentionPresetApplication({
      script,
      capabilities: planningCapabilities,
    });
    if (!result.ok) {
      failTerminal(
        DISMISS_TERMINAL_COPY[result.terminalCode],
        result.terminalCode,
        "keep",
      );
      return;
    }
    setAlertMessage(null);
    setAlertCode(null);
    setPoliteStatus(
      "Kept current settings and removed preset history. Undo is no longer available.",
    );
    onScriptChange(result.script);
    requestFocusAfterCommit("apply-or-radio");
  };

  const handleDismiss = () => {
    if (!showDismiss) return;
    const result = dismissVisualRetentionPresetApplication({
      script,
      capabilities: planningCapabilities,
    });
    if (!result.ok) {
      failTerminal(
        DISMISS_TERMINAL_COPY[result.terminalCode],
        result.terminalCode,
        "dismiss",
      );
      return;
    }
    setAlertMessage(null);
    setAlertCode(null);
    setPoliteStatus(
      "Dismissed preset record. Current settings are unchanged.",
    );
    onScriptChange(result.script);
    requestFocusAfterCommit("apply-or-radio");
  };

  const staleReasonMessages =
    effectiveStatus === "stale" || effectiveStatus === "invalid"
      ? (staleness?.reasons ?? []).map(
          (reason) => STALE_REASON_COPY[reason] ?? "Preset history needs attention.",
        )
      : [];

  const applyDisabledTitle = !selectedPresetId
    ? "Select a preset to enable Apply."
    : provenanceBlocksApply
      ? "A preset record is active. Choose Undo, Keep, or Dismiss first."
      : plan?.status === "terminal"
        ? (plan.terminalMessage ??
          "This preset is unavailable for the current story.")
        : plan != null && plan.summary.actionCount === 0
          ? "No planned changes to apply — settings already match or were skipped."
          : undefined;

  const firstPresetId = presets[0]?.id ?? null;
  const activeRovingId = selectedPresetId ?? firstPresetId;

  return (
    <section
      className="min-w-0 max-w-full space-y-3 overflow-x-hidden"
      aria-labelledby={headingId}
      data-visual-retention-presets-panel
      data-visual-retention-preset-project-key={projectKey}
    >
      <div className="min-w-0">
        <h3
          id={headingId}
          className="text-[11px] font-medium text-foreground/85"
        >
          Visual Retention Presets
        </h3>
        <p className={`${studioSubtleText} mt-1 break-words`}>
          Choose a project-wide starting point. Applied settings stay editable in
          their usual controls.
        </p>
      </div>

      {provenanceBlocksApply ? (
        <div
          className="min-w-0 rounded-xl bg-surface-elevated/35 px-3 py-2.5 ring-1 ring-border/20"
          data-visual-retention-preset-provenance
          data-visual-retention-preset-effective-status={effectiveStatus}
          data-visual-retention-preset-undo-allowed={showUndo ? "true" : "false"}
        >
          <p className="text-[11px] font-medium text-foreground/90">
            {effectiveStatus === "applied"
              ? `Applied: ${appliedPresetTitle ?? "preset"}`
              : effectiveStatus === "stale"
                ? `Applied preset needs review: ${appliedPresetTitle ?? "preset"}`
                : "Preset record needs attention"}
          </p>
          {staleReasonMessages.map((message) => (
            <p
              key={message}
              className={`${studioSubtleText} mt-1 break-words`}
            >
              {message}
            </p>
          ))}
          {showKeep ? (
            <p className={`${studioSubtleText} mt-1 break-words`}>
              Keep removes preset history while retaining ordinary settings.
            </p>
          ) : null}
          {showDismiss ? (
            <p className={`${studioSubtleText} mt-1 break-words`}>
              Current manual settings remain unchanged. Dismiss only clears the
              preset record.
            </p>
          ) : null}
          {(staleness?.missingTargetWarnings.length ?? 0) > 0 ? (
            <p
              className={`${studioSubtleText} mt-1 break-words`}
              aria-live="polite"
              data-visual-retention-preset-missing-targets
            >
              {staleness!.missingTargetWarnings.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="min-w-0 max-w-full">
        <div
          ref={radiogroupRef}
          className="flex min-w-0 max-w-full flex-col gap-2"
          role="radiogroup"
          aria-label="Visual Retention Preset"
          data-visual-retention-preset-chooser
          onKeyDown={(event) =>
            handlePresetRadiogroupKeyDown(
              event,
              selectAdjacent,
              selectFirst,
              selectLast,
              setSelectedPresetId,
            )
          }
        >
          {presets.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            const promotional = isPromotionalVisualRetentionPreset(preset);
            const tabIndex = activeRovingId === preset.id ? 0 : -1;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={tabIndex}
                data-visual-retention-preset-id={preset.id}
                data-visual-retention-preset-promotional={
                  promotional ? "true" : "false"
                }
                aria-label={
                  promotional
                    ? `${preset.title}. ${preset.description} Promotional.`
                    : `${preset.title}. ${preset.description}`
                }
                onClick={() => setSelectedPresetId(preset.id)}
                className={`min-w-0 max-w-full break-words rounded-xl px-3 py-2.5 text-left ring-1 transition-colors ${
                  isSelected
                    ? "bg-accent/15 ring-accent/40"
                    : "bg-surface-elevated/30 ring-border/20 hover:bg-surface-elevated/45"
                }`}
              >
                <span className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-medium text-foreground/95">
                    {preset.title}
                  </span>
                  {promotional ? (
                    <span
                      className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-amber-200/90"
                      data-visual-retention-preset-promotional-label
                    >
                      Promotional
                    </span>
                  ) : null}
                </span>
                <span className={`${studioSubtleText} mt-1 block break-words`}>
                  {preset.description}
                </span>
                <span className={`${studioSubtleText} mt-1 block break-words`}>
                  Recommended for {preset.recommendedFor}.
                </span>
                <span
                  className={`${studioSubtleText} mt-1 block break-words text-foreground/70`}
                >
                  {preset.previewCopy}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedPreset && plan ? (
        <VisualRetentionPresetPlanPreview preset={selectedPreset} plan={plan} />
      ) : null}

      <div className="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          ref={applyButtonRef}
          type="button"
          className={`${studioPrimaryButton} w-full min-w-0 sm:w-auto`}
          disabled={!canApply}
          title={applyDisabledTitle}
          aria-disabled={!canApply}
          data-visual-retention-preset-apply
          onClick={handleApply}
        >
          Apply preset
        </button>
        {showUndo ? (
          <button
            ref={undoButtonRef}
            type="button"
            className={`${studioSecondaryButton} w-full min-w-0 sm:w-auto`}
            data-visual-retention-preset-undo
            onClick={handleUndo}
          >
            Undo preset changes
          </button>
        ) : null}
        {showKeep ? (
          <button
            ref={keepButtonRef}
            type="button"
            className={`${studioSecondaryButton} w-full min-w-0 sm:w-auto`}
            title="Removes preset history while keeping ordinary settings."
            data-visual-retention-preset-keep
            onClick={handleKeep}
          >
            Keep changes
          </button>
        ) : null}
        {showDismiss ? (
          <button
            ref={dismissButtonRef}
            type="button"
            className={`${studioSecondaryButton} w-full min-w-0 sm:w-auto`}
            title="Clears the preset record. Current settings stay as they are."
            data-visual-retention-preset-dismiss
            onClick={handleDismiss}
          >
            Dismiss preset record
          </button>
        ) : null}
      </div>

      <div className="min-w-0 space-y-1">
        {politeStatus ? (
          <p
            className={`${studioSubtleText} break-words`}
            aria-live="polite"
            data-visual-retention-preset-status
          >
            {politeStatus}
          </p>
        ) : null}
        {alertMessage ? (
          <div
            className={studioWarningPanel}
            role="alert"
            data-visual-retention-preset-alert
            data-visual-retention-preset-alert-code={alertCode ?? ""}
          >
            <p className="text-xs leading-relaxed break-words">{alertMessage}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
