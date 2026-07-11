import { studioTimelineRailScroll } from "@/lib/utils/studioUi";

/** Timeline rail scroller — extends studio scrollbar conventions with smooth follow. */
export const timelineEditorRailScroll = `${studioTimelineRailScroll} scroll-smooth [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-border/10 [&::-webkit-scrollbar-thumb]:bg-border/55 [&::-webkit-scrollbar-thumb]:hover:bg-border/70`;

export const timelineEditorTrackSurface =
  "relative min-h-[5.25rem] min-w-full rounded-xl bg-surface/25 px-1.5 py-1.5 ring-1 ring-border/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:min-h-[5.5rem]";

export const timelineEditorSegmentRow =
  "flex min-h-[4.75rem] min-w-full items-stretch gap-0.5 sm:min-h-[5rem]";

export const timelineEditorFallbackNotice =
  "mb-1.5 flex items-center gap-1.5 rounded-lg bg-surface/30 px-2 py-1 text-[10px] leading-snug text-muted ring-1 ring-border/15";

/** Touch-device hint — scene actions via kebab menu. */
export const timelineEditorCoarsePointerHint =
  "mb-1.5 hidden text-[10px] leading-snug text-muted [@media(pointer:coarse)]:block";

/** Subtle duration-resize hint — always visible, non-modal. */
export const timelineEditorDurationHint =
  "mb-1.5 text-[10px] leading-snug text-muted/80";

export const timelineEditorPlaybackLocked =
  "pointer-events-auto opacity-95 saturate-[0.92]";

export const timelineSceneBlockBase =
  "group/scene-block relative flex min-w-[3.5rem] shrink-0 flex-col items-stretch gap-1 rounded-xl bg-surface/40 p-1 text-left ring-1 ring-border/25 transition duration-200 hover:-translate-y-0.5 hover:bg-surface-elevated/55 hover:ring-border/40 hover:shadow-md active:translate-y-0 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:min-w-[4rem]";

export const timelineSceneBlockSelected =
  "bg-accent-soft/95 ring-2 ring-accent/55 shadow-[0_0_0_1px_rgba(91,140,255,0.28),0_10px_24px_-12px_rgba(91,140,255,0.55)]";

export const timelineSceneBlockSelectedAccent =
  "pointer-events-none absolute bottom-1 left-0 top-1 z-[1] w-1 rounded-full bg-accent shadow-[0_0_12px_rgba(91,140,255,0.75)]";

export const timelineSceneBlockDragging =
  "z-20 scale-[0.96] opacity-55 shadow-xl ring-2 ring-dashed ring-accent/50";

export const timelineSceneBlockThumb =
  "relative h-11 w-full overflow-hidden rounded-lg bg-surface-elevated/50 ring-1 ring-inset ring-white/5 sm:h-12";

export const timelineSceneBlockThumbEmpty =
  "bg-[repeating-linear-gradient(-45deg,rgba(255,255,255,0.03)_0,rgba(255,255,255,0.03)_6px,transparent_6px,transparent_12px)]";

export const timelineSceneBlockThumbOverlay =
  "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/20";

export const timelineSceneBlockNumberBadge =
  "absolute left-1/2 top-1 z-[2] -translate-x-1/2 rounded-md bg-black/55 px-1 py-0.5 text-[8px] font-bold tabular-nums tracking-tight text-white/90 ring-1 ring-white/12 backdrop-blur-sm";

export const timelineSceneBlockDurationBadge =
  "absolute right-1 top-1 z-[2] max-w-[45%] truncate rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-white/95 ring-1 ring-white/12 backdrop-blur-sm";

/** Media kind pill — video / image / missing. */
export const timelineSceneBlockMediaBadge =
  "absolute left-1 top-1 z-[2] inline-flex max-w-[48%] items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[8px] font-semibold tracking-wide text-white/95 ring-1 ring-white/14 backdrop-blur-sm";

export const timelineSceneBlockMediaBadgeMissing =
  "bg-amber-950/80 text-amber-100/95 ring-amber-400/25";

export const timelineSceneBlockClipDurationBadge =
  "absolute bottom-3 left-1 z-[2] max-w-[46%] truncate rounded-md bg-black/60 px-1 py-0.5 text-[8px] font-medium tabular-nums text-white/85 ring-1 ring-white/10 backdrop-blur-sm";

export const timelineSceneBlockTrimDurationBadge =
  "absolute bottom-3 right-1 z-[2] max-w-[46%] truncate rounded-md bg-black/60 px-1 py-0.5 text-[8px] font-medium tabular-nums text-white/85 ring-1 ring-white/10 backdrop-blur-sm";

export const timelineSceneBlockHoldBadge =
  "absolute bottom-3 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-0.5 rounded-md bg-black/70 px-1 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-white/90 ring-1 ring-white/12 backdrop-blur-sm";

export const timelineSceneBlockMetaIcon =
  "inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-black/50 text-white/80 ring-1 ring-white/10";

/** Source-media mini-track — darker base for clearer hierarchy. */
export const timelineSceneBlockTrimStrip =
  "pointer-events-none absolute inset-x-1 bottom-0.5 z-[3] h-2 overflow-hidden rounded-[3px] bg-black/70 ring-1 ring-white/12 [@media(pointer:coarse)]:hidden";

export const timelineSceneBlockTrimStripDiscard =
  "absolute inset-y-0 bg-black/50";

export const timelineSceneBlockTrimStripSelection =
  "absolute inset-y-0 bg-accent/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)] transition-[filter,box-shadow] group-hover/trim-handle:brightness-110 group-hover/trim-handle:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4),0_0_10px_rgba(91,140,255,0.35)] group-focus-within/trim-handle:brightness-110";

export const timelineSceneBlockTrimStripSelectionPattern =
  "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.18) 2px, rgba(255,255,255,0.18) 3px)";

/** Extra hatch when the scene holds the last trimmed frame. */
export const timelineSceneBlockTrimStripHoldPattern =
  "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.12) 3px, rgba(255,255,255,0.12) 4px)";

/** Inner clip-trim handle — distinct from the outer duration-resize edge. */
export const timelineSceneBlockTrimHandle =
  "absolute top-1/2 z-[4] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-[3px] bg-foreground ring-2 ring-background pointer-events-auto cursor-ew-resize opacity-0 transition-[opacity,transform,box-shadow] hover:opacity-100 hover:scale-110 hover:ring-accent/70 focus-visible:opacity-100 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background group-hover/scene-block:opacity-100 group-focus-within/scene-block:opacity-100 disabled:cursor-not-allowed disabled:opacity-25 [@media(pointer:coarse)]:hidden";

export const timelineSceneBlockTrimHandleActive =
  "opacity-100 scale-110 ring-accent/80 shadow-[0_0_0_2px_rgba(91,140,255,0.35)]";

export const timelineSceneBlockTrimClipLabel =
  "pointer-events-none absolute left-1/2 top-0 z-[4] -translate-x-1/2 -translate-y-full rounded bg-black/70 px-1 py-0.5 text-[8px] font-medium tabular-nums text-white/90 opacity-0 transition-opacity group-hover/scene-block:opacity-100 group-focus-within/scene-block:opacity-100 [@media(pointer:coarse)]:hidden";

export const timelineSceneBlockTrimInspectorHint =
  "pointer-events-none absolute inset-x-1 bottom-0.5 z-[3] truncate rounded-sm bg-black/55 px-1 py-0.5 text-center text-[7px] font-medium uppercase tracking-wide text-white/70 ring-1 ring-white/10";

/** @deprecated Prefer timelineSceneBlockMediaBadge — kept for older imports. */
export const timelineSceneBlockVideoBadge = timelineSceneBlockMediaBadge;

export const timelineSceneBlockSceneLabel =
  "truncate px-0.5 text-center text-[10px] font-semibold leading-tight text-foreground/95";

export const timelineSceneBlockCaption =
  "truncate px-0.5 text-center text-[9px] font-medium leading-tight text-muted/90";

export const timelineSceneBlockKebab =
  "absolute right-0.5 top-0.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white/95 opacity-0 ring-1 ring-white/12 backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 group-hover/scene-block:opacity-100 group-focus-within/scene-block:opacity-100 [@media(pointer:coarse)]:opacity-100";

export const timelineSceneBlockDragHandle =
  "absolute bottom-0.5 left-0.5 z-10 inline-flex h-5 w-5 cursor-grab items-center justify-center rounded-md bg-black/60 text-white/95 opacity-0 ring-1 ring-white/12 backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:cursor-grabbing group-hover/scene-block:opacity-100 group-focus-within/scene-block:opacity-100 disabled:cursor-not-allowed disabled:opacity-25 [@media(pointer:coarse)]:opacity-100";

/** Right-edge duration resize — cursor distinct from clip-trim ew-resize. */
export const timelineSceneBlockResizeHandle =
  "absolute inset-y-0 -right-0.5 z-20 w-3 cursor-e-resize touch-none opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 group-hover/scene-block:opacity-100 group-focus-within/scene-block:opacity-100 disabled:cursor-not-allowed disabled:opacity-25 [@media(pointer:coarse)]:right-0 [@media(pointer:coarse)]:w-5 [@media(pointer:coarse)]:opacity-100";

export const timelineSceneBlockResizeHandleActive =
  "opacity-100";

export const timelineSceneBlockResizeHandleBar =
  "pointer-events-none absolute inset-y-2 right-1 w-0.5 rounded-full bg-accent/80 shadow-[0_0_8px_rgba(91,140,255,0.55)] [@media(pointer:coarse)]:right-1.5 [@media(pointer:coarse)]:w-1";

export const timelineSceneBlockResizeHandleBarActive =
  "bg-accent shadow-[0_0_12px_rgba(91,140,255,0.75)]";

/** Applied to the timeline rail while a pointer resize is active — blocks page scroll. */
export const timelineEditorRailResizing =
  "touch-none overscroll-x-none select-none";

/** Applied while a video trim drag is active — same scroll lock as resize. */
export const timelineEditorRailTrimming =
  "touch-none overscroll-x-none select-none";

export const timelineInsertIndicator =
  "pointer-events-none absolute bottom-0.5 top-0.5 -left-1 z-30 flex w-1 -translate-x-1/2 flex-col items-center justify-between";

export const timelineInsertIndicatorLine =
  "w-0.5 flex-1 rounded-full bg-accent shadow-[0_0_10px_rgba(91,140,255,0.65)]";

export const timelineInsertIndicatorCap =
  "h-1.5 w-1.5 shrink-0 rounded-full bg-accent ring-2 ring-accent/30 shadow-sm";

export const timelineTransitionMarkerWrap =
  "group/transition flex w-3.5 shrink-0 flex-col items-center justify-center self-stretch py-1 sm:w-4";

export const timelineTransitionMarkerBody =
  "relative flex h-full min-h-[3rem] w-full flex-col items-center justify-center gap-0.5 rounded-lg bg-surface/40 ring-1 ring-border/35 transition group-hover/transition:bg-surface/55 group-hover/transition:ring-accent/20 sm:min-h-[3.25rem]";

export const timelineTransitionMarkerDivider =
  "pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-accent/25";

export const timelinePlaybackHeadRoot =
  "pointer-events-none absolute inset-y-0 z-30 w-0 will-change-[left]";

export const timelinePlaybackHeadLine =
  "absolute bottom-0 top-3 left-0 w-[2.5px] -translate-x-1/2 rounded-full bg-gradient-to-b from-accent/35 via-accent to-accent/35 shadow-[0_0_16px_rgba(91,140,255,0.65)]";

export const timelinePlaybackHeadLineActive =
  "shadow-[0_0_22px_rgba(91,140,255,0.85)]";

export const timelinePlaybackHeadHandle =
  "absolute top-0 left-0 flex h-3 w-3 -translate-x-1/2 items-center justify-center";

export const timelinePlaybackHeadHandleDot =
  "h-2.5 w-2.5 rotate-45 rounded-sm bg-accent ring-2 ring-accent/40 shadow-[0_0_10px_rgba(91,140,255,0.65)]";

export const timelinePlaybackHeadHandleDotActive =
  "animate-pulse ring-accent/60 shadow-[0_0_16px_rgba(91,140,255,0.9)]";
