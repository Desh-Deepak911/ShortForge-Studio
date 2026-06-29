import { studioTimelineRailScroll } from "@/lib/utils/studioUi";

/** Timeline rail scroller — extends studio scrollbar conventions with smooth follow. */
export const timelineEditorRailScroll = `${studioTimelineRailScroll} scroll-smooth [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-border/10 [&::-webkit-scrollbar-thumb]:bg-border/55 [&::-webkit-scrollbar-thumb]:hover:bg-border/70`;

export const timelineEditorTrackSurface =
  "relative min-h-[5.25rem] min-w-full rounded-xl bg-surface/15 px-1 py-1 ring-1 ring-border/15 sm:min-h-[5.5rem]";

export const timelineEditorSegmentRow =
  "flex min-h-[4.75rem] min-w-full items-stretch gap-0.5 sm:min-h-[5rem]";

export const timelineEditorFallbackNotice =
  "mb-1.5 flex items-center gap-1.5 rounded-lg bg-surface/30 px-2 py-1 text-[10px] leading-snug text-muted ring-1 ring-border/15";

export const timelineEditorPlaybackLocked =
  "pointer-events-auto opacity-95 saturate-[0.92]";

export const timelineSceneBlockBase =
  "group/scene-block relative flex min-w-[3.5rem] shrink-0 flex-col items-stretch gap-1 rounded-xl bg-surface/40 p-1 text-left ring-1 ring-border/25 transition duration-200 hover:-translate-y-0.5 hover:bg-surface-elevated/55 hover:ring-border/40 hover:shadow-md active:translate-y-0 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:min-w-[4rem]";

export const timelineSceneBlockSelected =
  "bg-accent-soft/90 ring-accent/45 shadow-[0_0_0_1px_rgba(91,140,255,0.18),0_8px_20px_-12px_rgba(91,140,255,0.45)]";

export const timelineSceneBlockSelectedAccent =
  "pointer-events-none absolute bottom-1 left-0 top-1 z-[1] w-0.5 rounded-full bg-accent shadow-[0_0_8px_rgba(91,140,255,0.55)]";

export const timelineSceneBlockDragging =
  "z-20 scale-[0.96] opacity-55 shadow-xl ring-2 ring-dashed ring-accent/50";

export const timelineSceneBlockThumb =
  "relative h-11 w-full overflow-hidden rounded-lg bg-surface-elevated/50 ring-1 ring-inset ring-white/5 sm:h-12";

export const timelineSceneBlockThumbEmpty =
  "bg-[repeating-linear-gradient(-45deg,rgba(255,255,255,0.03)_0,rgba(255,255,255,0.03)_6px,transparent_6px,transparent_12px)]";

export const timelineSceneBlockThumbOverlay =
  "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/20";

export const timelineSceneBlockNumberBadge =
  "absolute left-1 top-1 z-[2] rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold tabular-nums tracking-tight text-white/95 ring-1 ring-white/15 backdrop-blur-sm";

export const timelineSceneBlockDurationBadge =
  "absolute bottom-1 right-1 z-[2] rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-white/95 ring-1 ring-white/12 backdrop-blur-sm";

export const timelineSceneBlockSceneLabel =
  "truncate px-0.5 text-center text-[10px] font-semibold leading-tight text-foreground/95";

export const timelineSceneBlockCaption =
  "truncate px-0.5 text-center text-[9px] font-medium leading-tight text-muted/90";

export const timelineSceneBlockKebab =
  "absolute right-0.5 top-0.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white/95 opacity-0 ring-1 ring-white/12 backdrop-blur-sm transition hover:bg-black/75 group-hover/scene-block:opacity-100 group-focus-within/scene-block:opacity-100";

export const timelineSceneBlockDragHandle =
  "absolute bottom-0.5 left-0.5 z-10 inline-flex h-5 w-5 cursor-grab items-center justify-center rounded-md bg-black/60 text-white/95 opacity-0 ring-1 ring-white/12 backdrop-blur-sm transition hover:bg-black/75 active:cursor-grabbing group-hover/scene-block:opacity-100 group-focus-within/scene-block:opacity-100 disabled:cursor-not-allowed disabled:opacity-25";

export const timelineInsertIndicator =
  "pointer-events-none absolute bottom-0.5 top-0.5 -left-1 z-30 flex w-1 -translate-x-1/2 flex-col items-center justify-between";

export const timelineInsertIndicatorLine =
  "w-0.5 flex-1 rounded-full bg-accent shadow-[0_0_10px_rgba(91,140,255,0.65)]";

export const timelineInsertIndicatorCap =
  "h-1.5 w-1.5 shrink-0 rounded-full bg-accent ring-2 ring-accent/30 shadow-sm";

export const timelineTransitionMarkerWrap =
  "group/transition flex w-3.5 shrink-0 flex-col items-center justify-center self-stretch py-1 sm:w-4";

export const timelineTransitionMarkerBody =
  "relative flex h-full min-h-[3rem] w-full flex-col items-center justify-center gap-0.5 rounded-lg bg-surface/25 ring-1 ring-border/25 transition group-hover/transition:bg-surface/40 group-hover/transition:ring-border/40 sm:min-h-[3.25rem]";

export const timelineTransitionMarkerDivider =
  "pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border/35";

export const timelinePlaybackHeadRoot =
  "pointer-events-none absolute inset-y-0 z-30 w-0 will-change-[left]";

export const timelinePlaybackHeadLine =
  "absolute bottom-0 top-3 left-0 w-[2px] -translate-x-1/2 rounded-full bg-gradient-to-b from-accent/20 via-accent to-accent/20 shadow-[0_0_12px_rgba(91,140,255,0.45)]";

export const timelinePlaybackHeadLineActive =
  "shadow-[0_0_16px_rgba(91,140,255,0.65)]";

export const timelinePlaybackHeadHandle =
  "absolute top-0 left-0 flex h-3 w-3 -translate-x-1/2 items-center justify-center";

export const timelinePlaybackHeadHandleDot =
  "h-2 w-2 rotate-45 rounded-sm bg-accent ring-2 ring-accent/30 shadow-[0_0_8px_rgba(91,140,255,0.5)]";

export const timelinePlaybackHeadHandleDotActive =
  "animate-pulse ring-accent/50 shadow-[0_0_12px_rgba(91,140,255,0.75)]";
