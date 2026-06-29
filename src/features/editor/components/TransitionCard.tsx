"use client";

import { ArrowDown, ChevronDown } from "lucide-react";

import {
  getTransitionDurationLabel,
  normalizeTransitionDurationMs,
  TRANSITION_CARD_TITLE,
  TRANSITION_DURATION_OPTIONS,
  TRANSITION_EFFECT_OPTIONS,
} from "@/features/story/utils";
import {
  studioFieldLabel,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioTransitionConnector,
} from "@/lib/utils/studioUi";
import type { TransitionEffect, TransitionTimelineItem } from "@/features/story/types";

interface TransitionCardProps {
  item: TransitionTimelineItem;
  onUpdate: (patch: { effect?: TransitionEffect; durationMs?: number }) => void;
  /** Timeline connector chrome vs compact inspector row. */
  variant?: "timeline" | "inline";
}

export default function TransitionCard({ item, onUpdate, variant = "timeline" }: TransitionCardProps) {
  const isInline = variant === "inline";

  return (
    <article
      aria-label={TRANSITION_CARD_TITLE}
      className={
        isInline
          ? "w-full min-w-0"
          : "flex w-full min-w-0 flex-col items-center py-0.5 sm:py-2"
      }
    >
      {!isInline ? (
        <>
          {/* Connector lines + arrow */}
          <div className="mb-1.5 flex w-full min-w-0 items-center gap-1.5 px-1 sm:mb-2 sm:max-w-md sm:gap-2 sm:px-0">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/70 to-border/40" />
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-elevated/60 ring-1 ring-border/40">
              <ArrowDown className="h-2.5 w-2.5 text-muted" strokeWidth={2} />
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border/70 to-border/40" />
          </div>
        </>
      ) : null}

      {/* Glass pill */}
      <div className={studioTransitionConnector}>
        <p className="mb-1.5 text-center text-[10px] font-medium tracking-tight text-muted sm:mb-2 sm:text-[11px]">
          {TRANSITION_CARD_TITLE}
        </p>

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <div className="min-w-0">
            <label htmlFor={`transition-effect-${item.id}`} className={`${studioFieldLabel} mb-1`}>
              Effect
            </label>
            <div className="relative">
              <select
                id={`transition-effect-${item.id}`}
                value={item.effect}
                onChange={(e) =>
                  onUpdate({ effect: e.target.value as TransitionEffect })
                }
                className={studioSelectCompact}
              >
                {TRANSITION_EFFECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className={studioSelectChevronCompact} />
            </div>
          </div>

          <div className="min-w-0">
            <label htmlFor={`transition-duration-${item.id}`} className={`${studioFieldLabel} mb-1`}>
              Duration
            </label>
            <div className="relative">
              <select
                id={`transition-duration-${item.id}`}
                value={normalizeTransitionDurationMs(item.durationMs)}
                onChange={(e) =>
                  onUpdate({ durationMs: Number(e.target.value) })
                }
                className={studioSelectCompact}
              >
                {TRANSITION_DURATION_OPTIONS.map((duration) => (
                  <option key={duration} value={duration}>
                    {getTransitionDurationLabel(duration)}
                  </option>
                ))}
              </select>
              <ChevronDown className={studioSelectChevronCompact} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
