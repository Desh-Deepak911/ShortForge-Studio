export const sceneMediaLaneRoot =
  "mt-1 flex w-full flex-col gap-1 rounded-lg bg-surface/20 px-1 py-1 ring-1 ring-border/15";

export const sceneMediaLaneNotice =
  "px-0.5 text-[9px] leading-snug text-muted/85";

export const sceneMediaLaneError =
  "px-0.5 text-[9px] leading-snug text-red-300/90";

/** Media segment track — may clip segment contents; never hosts transition chips. */
export const sceneMediaLaneTrack =
  "relative flex h-7 w-full overflow-hidden rounded-md ring-1 ring-border/20";

/**
 * Reserved row above the media track for transition chips (Sprint 9D.2).
 * Must not use overflow-hidden or negative offsets into the track.
 */
export const sceneMediaTransitionRow =
  "relative flex h-6 w-full items-stretch overflow-visible";

export const sceneMediaTransitionSlot = "relative min-w-0 overflow-visible";

export const sceneMediaSegmentBase =
  "relative flex h-full min-w-0 items-center justify-center overflow-hidden border-r border-border/25 last:border-r-0 text-left transition";

export const sceneMediaSegmentSelected =
  "ring-2 ring-inset ring-accent/70 bg-accent-soft/40";

export const sceneMediaSegmentIdle = "bg-surface-elevated/40 hover:bg-surface-elevated/60";

export const sceneMediaSegmentLabel =
  "pointer-events-none truncate px-1 text-[8px] font-medium uppercase tracking-wide text-foreground/80";

export const sceneMediaBoundaryHandle =
  "absolute top-0 z-[2] h-full w-2 -translate-x-1/2 cursor-ew-resize rounded-sm bg-accent/0 hover:bg-accent/35 focus-visible:bg-accent/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60";

/**
 * Centred on the boundary inside the reserved transition row.
 * No negative-top positioning — clips were caused by -top-3 inside overflow-hidden.
 */
export const sceneMediaTransitionAffordance =
  "absolute right-0 top-1/2 z-[1] max-w-[4.5rem] -translate-y-1/2 translate-x-1/2 truncate rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-foreground/85 ring-1 ring-border/35 bg-surface-elevated/95 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-40";

export const sceneMediaLaneActions =
  "flex flex-wrap items-center gap-1 px-0.5";

export const sceneMediaActionButton =
  "inline-flex h-5 items-center justify-center rounded px-1.5 text-[9px] font-medium text-muted ring-1 ring-border/25 transition hover:bg-surface-elevated/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

export const sceneMediaAddButton =
  "inline-flex h-5 items-center justify-center rounded px-1.5 text-[9px] font-semibold text-accent ring-1 ring-accent/30 transition hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-40";
