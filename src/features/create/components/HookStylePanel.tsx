"use client";

import { ChevronDown } from "lucide-react";

import type { CreatorTemplateId } from "@/features/creator-templates";
import {
  HOOK_STYLE_CATALOG,
  countHookWords,
  formatWriteMyOwnCounter,
  getHookStyleCatalogEntry,
  isHookStyleCompatibleWithScriptMode,
  predictAutoHookStrategy,
  validateWriteMyOwnOpening,
  type HookStyleSelection,
} from "@/features/hook-engine/presentation";
import type { ScriptMode } from "@/types/footiebitz";
import { StudioPanel } from "@/components/studio-shell";
import {
  studioComposerInput,
  studioComposerSelect,
  studioFieldLabel,
  studioSelectChevronCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface HookStylePanelProps {
  hookStyle: HookStyleSelection;
  onHookStyleChange: (selection: HookStyleSelection) => void;
  userAuthoredHook: string;
  onUserAuthoredHookChange: (value: string) => void;
  scriptMode: ScriptMode;
  selectedTemplateId: CreatorTemplateId | "";
  enableResearch: boolean;
  compatibilityNotice: string | null;
  loading: boolean;
}

/**
 * Create brief — Hook Style selector (Sprint 7E.6 / 7E.6A).
 * Imports only the client-safe presentation surface.
 */
export default function HookStylePanel({
  hookStyle,
  onHookStyleChange,
  userAuthoredHook,
  onUserAuthoredHookChange,
  scriptMode,
  selectedTemplateId,
  enableResearch,
  compatibilityNotice,
  loading,
}: HookStylePanelProps) {
  const selectedEntry = getHookStyleCatalogEntry(hookStyle);
  const autoPrediction = predictAutoHookStrategy(
    scriptMode,
    selectedTemplateId || undefined,
    enableResearch,
  );
  const writeMyOwn = validateWriteMyOwnOpening(userAuthoredHook);
  const wordCount = countHookWords(userAuthoredHook);
  const charCount = userAuthoredHook.length;
  const counterText = formatWriteMyOwnCounter(wordCount, charCount);
  const writeMyOwnInvalid = hookStyle === "user_written" && !writeMyOwn.ok;
  const writeMyOwnError =
    writeMyOwnInvalid && writeMyOwn.ok === false ? writeMyOwn.message : null;

  return (
    <StudioPanel>
      <p className={studioFieldLabel} id="hook-style-heading">
        Hook style
      </p>
      <p className={`${studioSubtleText} mt-1 mb-3`} id="hook-style-help">
        Choose how your story opens — Auto keeps today&apos;s recommended behaviour.
      </p>

      <div>
        <label htmlFor="hookStyle" className="sr-only">
          Hook style
        </label>
        <div className="relative mt-1.5">
          <select
            id="hookStyle"
            value={hookStyle}
            onChange={(event) =>
              onHookStyleChange(event.target.value as HookStyleSelection)
            }
            disabled={loading}
            aria-labelledby="hook-style-heading"
            aria-describedby={
              compatibilityNotice
                ? "hook-style-help hook-style-description hook-style-compat-notice"
                : "hook-style-help hook-style-description"
            }
            className={studioComposerSelect}
          >
            {HOOK_STYLE_CATALOG.map((entry) => {
              const compatible = isHookStyleCompatibleWithScriptMode(
                entry.selection,
                scriptMode,
              );
              return (
                <option
                  key={entry.selection}
                  value={entry.selection}
                  disabled={!compatible}
                >
                  {entry.label}
                  {!compatible ? " — not for this content type" : ""}
                </option>
              );
            })}
          </select>
          <ChevronDown className={studioSelectChevronCompact} />
        </div>

        <p id="hook-style-description" className={`${studioSubtleText} mt-1.5`}>
          {selectedEntry?.description}
        </p>

        {hookStyle === "auto" ? (
          <p className={`${studioSubtleText} mt-2 text-foreground/80`} role="status">
            {autoPrediction.summary}
          </p>
        ) : null}

        {compatibilityNotice ? (
          <p
            id="hook-style-compat-notice"
            className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
            role="status"
            aria-live="polite"
          >
            {compatibilityNotice}
          </p>
        ) : null}
      </div>

      {hookStyle === "user_written" ? (
        <div className="mt-4">
          <label htmlFor="userAuthoredHook" className={studioFieldLabel}>
            Your opening sentence
          </label>
          <p className={`${studioSubtleText} mt-1`}>
            Five words maximum. Safety and grounding checks still apply.
          </p>
          <textarea
            id="userAuthoredHook"
            value={userAuthoredHook}
            onChange={(event) => onUserAuthoredHookChange(event.target.value)}
            disabled={loading}
            required
            rows={3}
            aria-invalid={writeMyOwnInvalid}
            aria-describedby={
              writeMyOwnError
                ? "user-authored-hook-counter user-authored-hook-note user-authored-hook-error"
                : "user-authored-hook-counter user-authored-hook-note"
            }
            placeholder="Write the first sentence of your narration…"
            className={`${studioComposerInput} mt-1.5 min-h-[4.5rem] text-[15px]`}
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <p id="user-authored-hook-note" className={studioSubtleText}>
              Not treated as research-verified.
            </p>
            <p
              id="user-authored-hook-counter"
              className={`${studioSubtleText} tabular-nums ${
                writeMyOwnInvalid ? "text-amber-700 dark:text-amber-400" : ""
              }`}
              aria-live="polite"
            >
              {counterText}
            </p>
          </div>
          {writeMyOwnError ? (
            <p
              id="user-authored-hook-error"
              className="mt-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
              role="alert"
            >
              {writeMyOwnError}
            </p>
          ) : null}
        </div>
      ) : null}
    </StudioPanel>
  );
}
