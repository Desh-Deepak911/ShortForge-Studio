"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { FootieScript } from "@/features/story/types";
import { useShortForgeBrandStingEnabled } from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import {
  studioDestructiveButton,
  studioFieldLabel,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import { BRAND_STING_DURATION_OPTIONS } from "../domain/brand-sting.presets";
import { getShortForgeBrandSting } from "../domain/normalize-brand-sting";
import {
  disableBrandSting,
  enableBrandSting,
  setBrandStingDurationMs,
  type BrandStingCommandOptions,
  type BrandStingCommandResult,
} from "./brand-sting.commands";

export interface BrandStingExportControlsProps {
  readonly script: FootieScript;
  readonly disabled?: boolean;
  /**
   * Prefer an explicit parent gate (`capabilitiesReady && enabled`) so the
   * control never flashes before capability fetch settles.
   */
  readonly shortForgeBrandStingEnabled?: boolean;
  /** When explicitly false, render nothing (no flash while capabilities load). */
  readonly capabilitiesReady?: boolean;
  readonly onScriptCommit: (result: BrandStingCommandResult) => void;
}

type PendingFocusTarget = "add" | "duration" | "remove" | null;

const radioSelectedClass =
  "max-w-full shrink rounded-md border border-foreground/30 bg-foreground/10 px-2 py-1 text-[11px] font-medium text-foreground";
const radioIdleClass =
  "max-w-full shrink rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:border-foreground/20 hover:text-foreground";

export default function BrandStingExportControls({
  script,
  disabled = false,
  shortForgeBrandStingEnabled,
  capabilitiesReady,
  onScriptCommit,
}: BrandStingExportControlsProps) {
  const statusId = useId();
  const groupId = useId();
  const contextEnabled = useShortForgeBrandStingEnabled();
  const enabled =
    typeof shortForgeBrandStingEnabled === "boolean"
      ? shortForgeBrandStingEnabled
      : contextEnabled;

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const durationButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusRef = useRef<PendingFocusTarget>(null);
  const [focusEpoch, setFocusEpoch] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsAlert, setStatusIsAlert] = useState(false);

  const brandSting = getShortForgeBrandSting(script.visualRetentionExtensions);
  const isActive = brandSting?.enabled === true;
  const commandOptions: BrandStingCommandOptions = {
    shortForgeBrandStingEnabled: enabled,
  };
  const durationIndex = Math.max(
    0,
    BRAND_STING_DURATION_OPTIONS.findIndex(
      (option) => option.id === brandSting?.durationMs,
    ),
  );

  const applyResult = (result: BrandStingCommandResult) => {
    onScriptCommit(result);
    if (result.status !== "ok") {
      setStatusMessage(result.message ?? "Could not update ShortForge Studio outro.");
      setStatusIsAlert(true);
      pendingFocusRef.current = result.focusTarget ?? "add";
      setFocusEpoch((value) => value + 1);
      return;
    }
    setStatusMessage(null);
    setStatusIsAlert(false);
    pendingFocusRef.current = result.focusTarget ?? null;
    setFocusEpoch((value) => value + 1);
  };

  useLayoutEffect(() => {
    if (capabilitiesReady === false || !enabled) return;
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
    durationButtonRefs.current[durationIndex]?.focus();
  }, [focusEpoch, durationIndex, isActive, capabilitiesReady, enabled]);

  if (capabilitiesReady === false || !enabled) {
    return null;
  }

  const handleDurationKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex =
        (index + 1 + BRAND_STING_DURATION_OPTIONS.length) %
        BRAND_STING_DURATION_OPTIONS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (index - 1 + BRAND_STING_DURATION_OPTIONS.length) %
        BRAND_STING_DURATION_OPTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = BRAND_STING_DURATION_OPTIONS.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    const option = BRAND_STING_DURATION_OPTIONS[nextIndex]!;
    applyResult(setBrandStingDurationMs(script, option.id, commandOptions));
  };

  return (
    <section
      className="flex min-w-0 max-w-full flex-col gap-2"
      aria-labelledby={groupId}
      data-brand-sting-export-controls="true"
      data-narrow-width-safe="true"
    >
      <div className="min-w-0">
        <h3 id={groupId} className={studioFieldLabel}>
          ShortForge Studio outro
        </h3>
        <p className={`${studioSubtleText} mt-1 max-w-prose text-[11px]`}>
          Adds a short branded animation after the story. Narration and music
          are not extended.
        </p>
      </div>

      {!isActive ? (
        <button
          ref={addButtonRef}
          type="button"
          data-brand-sting-add="true"
          className={`${studioSecondaryButton} w-fit max-w-full`}
          disabled={disabled}
          onClick={() => applyResult(enableBrandSting(script, commandOptions))}
        >
          Add ShortForge Studio outro
        </button>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="ShortForge Studio outro duration"
            className="flex min-w-0 flex-wrap gap-1.5"
          >
            {BRAND_STING_DURATION_OPTIONS.map((option, index) => {
              const selected = brandSting?.durationMs === option.id;
              return (
                <button
                  key={option.id}
                  ref={(node) => {
                    durationButtonRefs.current[index] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? radioSelectedClass : radioIdleClass}
                  disabled={disabled}
                  onClick={() =>
                    applyResult(
                      setBrandStingDurationMs(script, option.id, commandOptions),
                    )
                  }
                  onKeyDown={(event) => handleDurationKeyDown(event, index)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            ref={removeButtonRef}
            type="button"
            data-brand-sting-remove="true"
            className={`${studioDestructiveButton} w-fit max-w-full`}
            disabled={disabled}
            onClick={() => applyResult(disableBrandSting(script, commandOptions))}
          >
            Remove ShortForge Studio outro
          </button>
        </>
      )}

      {statusMessage ? (
        <p
          id={statusId}
          role={statusIsAlert ? "alert" : "status"}
          className={`${studioSubtleText} text-[11px]`}
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
