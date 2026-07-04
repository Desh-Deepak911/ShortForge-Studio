"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import type { FootieScript } from "@/features/story/types";

import { PREVIEW_DURATION_SOURCE_MASTER_TIMELINE } from "../preview-timeline-diagnostics.dev.utils";
import type { MasterTimeline } from "../timeline.types";

export type PreviewDurationSource = typeof PREVIEW_DURATION_SOURCE_MASTER_TIMELINE;

export interface PreviewMasterTimelineContextValue {
  previewMasterTimeline: MasterTimeline | null;
  previewTimingWarnings: string[];
  previewDurationMs: number;
  previewDurationSource: PreviewDurationSource | null;
  isUsingEditorTimingAuthority: boolean;
}

const PreviewMasterTimelineContext =
  createContext<PreviewMasterTimelineContextValue | null>(null);

/** Pure resolver — one preview master timeline build per script reference. */
export function resolvePreviewMasterTimelineState(
  script: FootieScript | null | undefined,
): PreviewMasterTimelineContextValue {
  // Editor scripts are synced at DraftEditorFlow — do not resync here.
  const previewMasterTimeline = buildPreviewMasterTimeline(script, {
    assumeSynced: true,
  });

  return {
    previewMasterTimeline,
    previewTimingWarnings: previewMasterTimeline?.warnings ?? [],
    previewDurationMs: previewMasterTimeline?.renderDurationMs ?? 0,
    previewDurationSource: previewMasterTimeline
      ? PREVIEW_DURATION_SOURCE_MASTER_TIMELINE
      : null,
    isUsingEditorTimingAuthority:
      previewMasterTimeline?.authority === "editor-scene-timing",
  };
}

/**
 * Shared preview MasterTimeline for StoryWorkspace consumers.
 * Rebuilds when `timelineEpoch` changes (structural/timing/transition, or
 * debounced caption/motion). Content-only script updates keep the prior timeline.
 */
export function PreviewMasterTimelineProvider({
  script,
  timelineEpoch = 0,
  children,
}: {
  script: FootieScript;
  /** Incremented by DraftEditorFlow when master timeline must rebuild. */
  timelineEpoch?: number;
  children: ReactNode;
}) {
  const [timelineState, setTimelineState] = useState(() => ({
    epoch: timelineEpoch,
    value: resolvePreviewMasterTimelineState(script),
  }));

  // Rebuild only when the editor bumps the epoch — not on every script identity change.
  if (timelineState.epoch !== timelineEpoch) {
    setTimelineState({
      epoch: timelineEpoch,
      value: resolvePreviewMasterTimelineState(script),
    });
  }

  return (
    <PreviewMasterTimelineContext.Provider value={timelineState.value}>
      {children}
    </PreviewMasterTimelineContext.Provider>
  );
}

/** Returns shared preview timeline state, or null when provider is absent. */
export function usePreviewMasterTimelineContext(): PreviewMasterTimelineContextValue | null {
  return useContext(PreviewMasterTimelineContext);
}
