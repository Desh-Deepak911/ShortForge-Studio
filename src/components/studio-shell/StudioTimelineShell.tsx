import { ChevronsDown, ChevronsUp, Rows3 } from "lucide-react";
import type { CSSProperties, PointerEventHandler } from "react";

import {
  studioShellMaxWidth,
  studioShellRegionPadding,
  studioShellTimelineHeightCompact,
  studioShellTimelineHeightMultiImage,
} from "@/lib/utils/studioUi";

import type { StudioShellRegionProps } from "./studio-shell.types";

export interface StudioTimelineShellProps extends StudioShellRegionProps {
  compactMode?: boolean;
  density?: "compact" | "comfortable" | "expanded";
  heightPx?: number;
  onDensityChange?: (density: "compact" | "comfortable" | "expanded") => void;
  onResizePointerDown?: PointerEventHandler<HTMLElement>;
  /** Accessible label for the timeline landmark. */
  "aria-label"?: string;
}

/**
 * Bottom temporal navigation rail — scene chips and transport metadata.
 *
 * Sprint 8E.3: multi-image shell height is the production default so Scene Media
 * Timeline lanes (below each scene block) are not clipped by fixed h + overflow-hidden.
 */
export default function StudioTimelineShell({
  children,
  className = "",
  id,
  compactMode = false,
  density,
  heightPx,
  onDensityChange,
  onResizePointerDown,
  "aria-label": ariaLabel = "Timeline",
}: StudioTimelineShellProps) {
  const heightClass = compactMode
    ? studioShellTimelineHeightCompact
    : studioShellTimelineHeightMultiImage;
  const hasEditorLayout = density != null && heightPx != null;
  const style = hasEditorLayout
    ? ({ height: `${heightPx}px`, maxHeight: `${heightPx}px` } as CSSProperties)
    : undefined;

  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={`${hasEditorLayout ? "relative flex shrink-0 flex-col overflow-hidden border-t border-border/50 bg-surface/30 shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.85)]" : heightClass} ${className}`.trim()}
      style={style}
      data-timeline-shell-multi-image="true"
      data-timeline-density={density}
    >
      {hasEditorLayout && onResizePointerDown ? (
        <button
          type="button"
          aria-label="Resize timeline"
          className="absolute inset-x-0 top-0 z-20 h-2 -translate-y-1/2 cursor-row-resize touch-none"
          onPointerDown={onResizePointerDown}
        >
          <span className="mx-auto block h-px w-full bg-border/30 transition-colors hover:bg-accent/60" />
        </button>
      ) : null}

      {hasEditorLayout && onDensityChange ? (
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/25 px-4">
          <div className="flex items-center gap-2">
            <Rows3 className="h-3.5 w-3.5 text-muted" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Timeline
            </span>
            <span className="hidden text-[10px] text-muted sm:inline">
              Ctrl/⌘ Shift T
            </span>
          </div>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Timeline size"
          >
            {(["compact", "comfortable", "expanded"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onDensityChange(option)}
                className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-[10px] font-medium capitalize transition ${
                  density === option
                    ? "bg-accent/15 text-accent ring-1 ring-accent/25"
                    : "text-muted hover:bg-surface-elevated/50 hover:text-foreground"
                }`}
                aria-pressed={density === option}
                title={`${option[0].toUpperCase()}${option.slice(1)} timeline`}
              >
                {option === "compact" ? (
                  <ChevronsDown className="h-3.5 w-3.5" aria-hidden />
                ) : option === "expanded" ? (
                  <ChevronsUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Rows3 className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={`${studioShellMaxWidth} flex min-h-0 flex-1 flex-col ${hasEditorLayout ? "px-3 py-2 sm:px-4" : studioShellRegionPadding}`}
      >
        {children}
      </div>
    </section>
  );
}
