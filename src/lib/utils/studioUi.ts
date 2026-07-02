/** Shared Tailwind class strings for the ShortForge Studio UI. */

const shadowInset = "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

const surfaceRing = "ring-1 ring-border/20";
const fieldSurface =
  "bg-surface-elevated/40 ring-1 ring-border/25 hover:bg-surface-elevated/55 hover:ring-border/35";

/* ── Form control primitives (Apple-style) ─────────────────────────────────── */

const focusRing =
  "outline-none transition-[color,background-color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const controlHeight = "min-h-[2.75rem]";
const controlHeightSm = "min-h-[2.25rem]";

/** Text inputs and single-line fields — 44px tap height. */
export const studioInput = `w-full rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/70 ${fieldSurface} ${focusRing} disabled:cursor-not-allowed disabled:opacity-45 ${controlHeight}`;

/** Multi-line fields — same surface language as inputs. */
export const studioTextarea = `w-full rounded-xl px-3.5 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted/70 ${fieldSurface} ${focusRing} disabled:cursor-not-allowed disabled:opacity-45 resize-y min-h-[5.5rem]`;

/** Select / dropdown — consistent height with inputs. */
export const studioSelect = `w-full appearance-none rounded-xl px-3.5 py-2.5 pr-10 text-sm text-foreground ${fieldSurface} ${focusRing} disabled:cursor-not-allowed disabled:opacity-45 ${controlHeight}`;

/** Compact select for dense toolbars (transitions, composer). */
export const studioSelectCompact = `w-full min-w-0 appearance-none rounded-xl px-2.5 py-2 pr-8 text-xs text-foreground sm:text-[13px] ${fieldSurface} ${focusRing} disabled:cursor-not-allowed disabled:opacity-45 ${controlHeightSm}`;

/** Small numeric / inline field (e.g. duration in scene header). */
export const studioInputCompact = `rounded-xl bg-surface-elevated/40 px-2.5 py-1.5 text-center text-xs tabular-nums text-foreground ring-1 ring-border/25 ${focusRing} hover:ring-border/35 disabled:opacity-45`;

export const studioSelectChevron =
  "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted";

export const studioSelectChevronCompact =
  "pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted";

/** Primary action — calm blue accent, no loud glow. */
export const studioPrimaryButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-accent/90 px-5 py-2.5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${focusRing} ${controlHeightSm}`;

/** Secondary action — translucent surface. */
export const studioSecondaryButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-surface-elevated/55 px-4 py-2.5 text-sm font-medium text-foreground/90 ring-1 ring-border/25 hover:bg-surface-elevated/70 hover:ring-border/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${focusRing} ${controlHeightSm}`;

/** In-panel CTA — present but restrained (narration, secondary flows). */
export const studioActionButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-surface-elevated/60 px-4 py-2.5 text-sm font-medium text-foreground/90 ring-1 ring-accent/15 hover:bg-surface-elevated/75 hover:ring-accent/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${focusRing} ${controlHeightSm}`;

/** @deprecated Prefer studioActionButton */
export const studioAccentButton = studioActionButton;

/** Quiet destructive — clear but not loud. */
export const studioDestructiveButton = `inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 min-h-[2.25rem] text-[11px] font-medium text-red-300/85 ring-1 ring-transparent hover:bg-red-950/25 hover:text-red-300 hover:ring-red-500/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-0 sm:py-1.5 ${focusRing}`;

/** Destructive confirmation CTA — confirm dialogs and irreversible actions. */
export const studioDestructiveConfirmButton = `${studioSecondaryButton} text-red-300/90 ring-red-500/20 hover:bg-red-950/25 hover:text-red-300 hover:ring-red-500/30`;

/** Ghost / tertiary chip button. */
export const studioGhostButton = `inline-flex items-center gap-1.5 rounded-xl bg-surface-elevated/45 px-2.5 py-1.5 text-xs font-medium text-muted ring-1 ring-border/20 hover:bg-surface-elevated/60 hover:text-foreground/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

/** Compact toolbar / timeline utility button. */
export const studioCompactButton = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface-elevated/45 px-3 py-2 min-h-[2.25rem] text-xs font-medium text-muted ring-1 ring-border/20 hover:bg-surface-elevated/60 hover:text-foreground/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0 sm:py-1.5 ${focusRing}`;

/** Primary attach / upload CTA inside cards. */
export const studioUploadButton = `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-accent/10 px-3 py-2.5 min-h-[2.25rem] text-xs font-medium text-accent ring-1 ring-accent/15 hover:bg-accent/15 hover:ring-accent/25 active:scale-[0.98] sm:py-2 ${focusRing}`;

/** Dashed upload drop zone. */
export const studioUploadZone = `flex cursor-pointer flex-col items-center justify-center rounded-2xl bg-surface-elevated/25 px-4 py-8 text-center ring-1 ring-border/25 transition hover:bg-surface-elevated/35 hover:ring-border/35 sm:px-6 sm:py-10 ${focusRing}`;

/** Choice chips (samples, steps). */
export const studioChip = `max-w-full rounded-full bg-surface-elevated/45 px-3 py-2 min-h-[2.25rem] text-left text-xs font-medium leading-snug text-muted ring-1 ring-border/20 transition hover:bg-surface-elevated/60 hover:text-foreground/90 hover:ring-border/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:py-1.5 sm:text-center ${focusRing}`;

export const studioChipActive =
  "rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-accent/25";

/** Rectangular selectable card — voice library, dense pickers. */
export const studioCard = `w-full rounded-lg bg-surface-elevated/35 px-2 py-1.5 text-left ring-1 ring-border/20 transition hover:bg-surface-elevated/50 hover:ring-border/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`;

export const studioCardActive =
  `w-full rounded-lg bg-accent-soft/60 px-2 py-1.5 text-left ring-1 ring-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition duration-200 active:scale-[0.99] ${focusRing}`;

/** Compact inline tag for card metadata. */
export const studioCardTag =
  "inline-flex items-center rounded-md bg-surface-elevated/55 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted ring-1 ring-border/15";

/** Apple-style segmented control track. */
export const studioSegmentedControl =
  "flex w-full rounded-xl bg-surface-elevated/35 p-1 ring-1 ring-border/20";

/** Segmented control segment — inactive. */
export const studioSegment =
  "flex min-h-[2.25rem] flex-1 items-center justify-center rounded-lg px-2 py-2 text-center text-[11px] font-medium leading-tight text-muted transition hover:text-foreground/85 sm:min-h-0 sm:px-2.5 sm:text-xs";

/** Segmented control segment — active. */
export const studioSegmentActive =
  "flex min-h-[2.25rem] flex-1 items-center justify-center rounded-lg bg-surface-elevated/85 px-2 py-2 text-center text-[11px] font-medium leading-tight text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-border/25 sm:min-h-0 sm:px-2.5 sm:text-xs";

export const studioLabel =
  "mb-2 block text-sm font-medium text-foreground/90";

export const studioFieldLabel =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted";

/** Compact range slider for inspector controls (zoom, etc.). */
export const studioRange =
  `studio-range-input h-1.5 w-full min-w-0 cursor-pointer appearance-none rounded-full bg-surface-elevated/80 accent-accent ${focusRing}`;

/** Touch-friendly host wrapper for range inputs — keeps a 44px tap target on coarse pointers. */
export const studioRangeTouchHost =
  "flex min-h-11 w-full min-w-0 items-center sm:min-h-0";

/** Image transform controls docked beneath a media preview. */
export const studioImageControlDock =
  "border-t border-border/15 bg-surface-elevated/20 px-2.5 py-2.5 sm:px-3 sm:py-3";

/** Compact segmented control for image fit (Fit / Fill). */
export const studioImageFitSegmentedControl =
  "flex min-w-0 flex-1 rounded-[0.65rem] bg-surface-elevated/35 p-0.5 ring-1 ring-border/20";

export const studioImageFitSegment =
  "flex min-h-[2rem] flex-1 items-center justify-center rounded-md px-2 py-1.5 text-center text-[11px] font-medium leading-tight text-muted transition hover:text-foreground/85 sm:min-h-[1.85rem] sm:text-xs";

export const studioImageFitSegmentActive =
  "flex min-h-[2rem] flex-1 items-center justify-center rounded-md bg-surface-elevated/85 px-2 py-1.5 text-center text-[11px] font-medium leading-tight text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-border/25 sm:min-h-[1.85rem] sm:text-xs";

export const studioStickyMobileFooter =
  "sticky bottom-0 z-20 -mx-3.5 border-t border-border/40 bg-background/95 px-3.5 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none";

/** Sticky footer that sits above the editor mobile action bar. */
export const studioStickyMobileFooterAboveBar =
  "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 border-t border-border/40 bg-background/95 px-1 py-3 backdrop-blur-xl lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none";

/** Segmented control that stacks on narrow viewports (image inspector, export format). */
export const studioSegmentedControlStacked =
  "flex min-w-0 flex-col gap-1 rounded-xl bg-surface-elevated/35 p-1 ring-1 ring-border/20 sm:flex-row sm:gap-0";

export const studioImageFitSegmentedControlStacked =
  "flex min-w-0 flex-col gap-1 rounded-[0.65rem] bg-surface-elevated/35 p-1 ring-1 ring-border/20 sm:flex-row sm:flex-1 sm:gap-0 sm:p-0.5";

export const studioSubtleText =
  "text-xs leading-relaxed text-muted";

/* ── Layout & surfaces ─────────────────────────────────────────────────────── */

/** Primary page section card. */
export const studioSectionCard =
  `min-w-0 rounded-2xl bg-surface/40 p-4 backdrop-blur-xl sm:p-6 lg:p-7 ${surfaceRing} ${shadowInset}`;

/** @deprecated Use studioSectionCard */
export const studioPageCard = studioSectionCard;

/** Nested panel inside a card. */
export const studioPanel =
  "rounded-xl bg-surface-elevated/30 p-3.5 ring-1 ring-border/20 sm:p-4";

/** Frosted inset panel for callouts. */
export const studioGlass =
  "rounded-xl bg-surface-elevated/50 p-3.5 ring-1 ring-border/20 backdrop-blur-md sm:p-4";

/** Storyboard main-column section — lighter than studioSectionCard to reduce nesting weight. */
export const studioWorkspaceSection =
  `min-w-0 rounded-2xl bg-surface/30 p-4 ring-1 ring-border/15 sm:p-5 lg:p-6 ${shadowInset}`;

export const studioStepLabel =
  "text-[11px] font-medium uppercase tracking-[0.18em] text-muted";

export const studioSectionTitle =
  "mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl lg:text-[1.35rem]";

export const studioSectionDesc =
  "mt-1 text-sm leading-relaxed text-muted sm:mt-1.5";

export const studioBadge =
  `inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/50 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-border/20`;

export const studioIconBox =
  `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-elevated/80 ring-1 ring-border/20 ${shadowInset}`;

export const studioIconBoxAccent =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/20";

export const studioHeader =
  `sticky top-0 z-30 overflow-hidden border-b border-border/60 bg-background/60 backdrop-blur-2xl backdrop-saturate-150 ${shadowInset}`;

export const studioShellContainer =
  "mx-auto w-full min-w-0 max-w-4xl px-3.5 sm:px-6 lg:px-8";

export const studioShellContainerWide =
  "mx-auto w-full min-w-0 max-w-6xl px-3.5 sm:px-6 lg:px-8";

export const studioWorkspaceGrid =
  "grid min-w-0 grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-9";

export const studioWorkspaceMain = "flex min-w-0 flex-col gap-5 sm:gap-6";

export const studioWorkspaceAside =
  "flex min-w-0 flex-col gap-4 sm:gap-5 lg:sticky lg:top-[4.25rem] lg:max-h-[calc(100vh-5.5rem)] lg:gap-5 lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5";

export const studioWorkspacePanel =
  `min-w-0 rounded-2xl bg-surface/35 p-4 backdrop-blur-xl sm:p-5 lg:p-6 ${surfaceRing} ${shadowInset}`;

export const studioMobileActionBar =
  "fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/80 backdrop-blur-2xl backdrop-saturate-150 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 lg:hidden";

export const studioMobileActionButton =
  `flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-elevated/65 px-2.5 py-3 text-xs font-medium text-foreground/90 ring-1 ring-border/25 hover:bg-surface-elevated active:scale-[0.98] ${focusRing}`;

export const studioMobileActionButtonPrimary =
  `flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent/85 px-2.5 py-3 text-xs font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-accent active:scale-[0.98] ${focusRing}`;

export const studioNavPrimaryButton =
  `inline-flex min-h-[2.25rem] min-w-[2.25rem] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent/90 px-3 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0 sm:min-w-0 sm:px-3.5 sm:py-1.5 ${focusRing}`;

export const studioNavExportButton =
  `inline-flex min-h-[2.25rem] min-w-[2.25rem] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-surface-elevated/65 px-3 py-2 text-xs font-semibold text-foreground/90 ring-1 ring-border/25 backdrop-blur-md hover:bg-surface-elevated/80 hover:ring-border/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0 sm:min-w-0 sm:px-3.5 sm:py-1.5 ${focusRing}`;

export const studioFooter =
  "mt-auto border-t border-border/60 bg-background/50 py-5 backdrop-blur-sm sm:py-6";

export const studioInfoCallout =
  "flex items-start gap-2.5 rounded-xl bg-surface/35 px-3.5 py-3 ring-1 ring-border/20 sm:px-4 sm:py-3.5";

export const studioError =
  "rounded-xl bg-red-950/25 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/15";

export const studioSuccessPanel =
  "rounded-xl bg-accent-soft/80 p-4 ring-1 ring-accent/15";

export const studioWarningPanel =
  "rounded-xl bg-amber-950/20 px-4 py-3.5 ring-1 ring-amber-500/15";

/** Checkbox / option row in forms. */
export const studioOptionRow = (active: boolean) =>
  `flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 ring-1 transition ${focusRing} ${
    active
      ? "bg-accent-soft/80 ring-accent/20"
      : "bg-surface-elevated/30 ring-border/20 hover:bg-surface-elevated/45 hover:ring-border/30"
  }`;

/** Read-only checklist row (export preflight). */
export const studioChecklistItem = (done: boolean) =>
  `flex items-start gap-3 rounded-xl px-4 py-3.5 ring-1 transition-colors ${
    done ? "bg-accent-soft/60 ring-accent/20" : "bg-surface-elevated/30 ring-border/20"
  }`;

/** Inline stat / progress summary bar. */
export const studioStatBar =
  "rounded-xl bg-surface-elevated/30 px-4 py-3 ring-1 ring-border/20";

/* ── Composer ──────────────────────────────────────────────────────────────── */

export const studioComposerCard =
  `min-w-0 rounded-2xl bg-surface-elevated/25 p-3.5 ring-1 ring-border/20 backdrop-blur-2xl transition-[box-shadow,ring-color] duration-200 focus-within:ring-accent/20 sm:p-5 ${shadowInset}`;

export const studioComposerInput =
  `w-full min-h-[6.5rem] resize-y rounded-xl bg-transparent px-1.5 py-2 text-[15px] leading-[1.55] text-foreground placeholder:text-muted/70 outline-none transition-[background-color] duration-200 focus:bg-surface-elevated/10 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[8rem] sm:px-3 sm:py-2.5 sm:text-base sm:leading-[1.6] lg:min-h-[9rem] lg:text-[17px]`;

export const studioComposerHelper =
  "px-1.5 text-xs leading-relaxed text-muted sm:px-3 sm:text-[13px]";

export const studioComposerButton = studioPrimaryButton + " w-full min-h-[2.75rem] sm:w-auto sm:min-w-[10.5rem]";

/** @deprecated Use studioSelectCompact */
export const studioComposerSelect = studioSelectCompact;

/* ── Storyboard scene cards ────────────────────────────────────────────────── */

export const studioStoryboardCard =
  `min-w-0 overflow-hidden rounded-2xl bg-surface/30 ring-1 ring-border/20 backdrop-blur-xl sm:rounded-2xl ${shadowInset}`;

export const studioStoryboardScenePill =
  "inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-full bg-surface-elevated/70 px-2 text-[11px] font-medium tabular-nums text-muted ring-1 ring-border/20";

export const studioStoryboardSceneTitle =
  "text-[15px] font-medium tracking-tight text-foreground sm:text-base";

/** @deprecated Use studioFieldLabel */
export const studioStoryboardSectionLabel = studioFieldLabel;

/** @deprecated Use studioTextarea / studioSelectCompact */
export const studioStoryboardField = studioTextarea;

export const studioStoryboardMediaFrame =
  "relative overflow-hidden rounded-2xl bg-background/20 ring-1 ring-border/20";

/** @deprecated Use studioUploadZone */
export const studioStoryboardMediaEmpty = studioUploadZone;

/** @deprecated Use studioCompactButton */
export const studioStoryboardControl = studioCompactButton;

/** @deprecated Use studioUploadButton */
export const studioStoryboardControlPrimary = studioUploadButton;

export const studioStoryboardMeta =
  "text-xs leading-relaxed text-muted";

/* ── Transition connectors ─────────────────────────────────────────────────── */

export const studioTransitionConnector =
  `mx-auto w-full min-w-0 max-w-full rounded-xl bg-surface-elevated/25 px-2.5 py-2 ring-1 ring-border/20 backdrop-blur-xl transition duration-200 hover:bg-surface-elevated/35 hover:ring-border/30 sm:max-w-md sm:rounded-2xl sm:px-4 sm:py-2.5 ${shadowInset}`;

/** @deprecated Use studioSelectCompact */
export const studioTransitionConnectorInput = studioSelectCompact;

/** @deprecated Use studioTransitionConnector */
export const studioTransitionCard = studioTransitionConnector;

/** @deprecated Use studioSelectCompact */
export const studioTransitionInput = studioSelectCompact;

/* ── Preview device ────────────────────────────────────────────────────────── */

export const studioPreviewDevice =
  "mx-auto w-full max-w-[min(100%,17.5rem)] rounded-[1.75rem] bg-surface p-1.5 ring-1 ring-white/[0.06] sm:max-w-[260px] sm:rounded-[2rem] sm:p-2";

export const studioPreviewScreen =
  "relative aspect-[9/16] w-full overflow-hidden rounded-[1.45rem] bg-background sm:rounded-[1.65rem]";

/** Width constraint for preview controls below the device frame. */
export const studioPreviewControls =
  "w-full max-w-[min(100%,17.5rem)] sm:max-w-[260px]";

export const studioPreviewCaption =
  "rounded-xl bg-black/50 px-3 py-2.5 text-center text-[13px] font-semibold leading-snug text-white backdrop-blur-md sm:text-[14px]";

/** Caption overlay on storyboard scene card media preview. */
export const studioStoryboardCaptionOverlay =
  "rounded-lg bg-black/55 px-2.5 py-2 text-center text-[11px] font-semibold leading-snug text-white/95 backdrop-blur-sm sm:text-xs";

export const studioPreviewPill = studioSecondaryButton + " min-h-[2.25rem] rounded-full px-3 py-2 text-[11px] sm:min-h-0";

export const studioPreviewPillPrimary =
  studioPrimaryButton + " min-h-[2.25rem] rounded-full px-3.5 py-2 text-[11px] shadow-none sm:min-h-0";

export const studioPreviewPillMuted =
  `inline-flex min-h-[2.25rem] items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-medium text-muted ring-1 ring-border/20 hover:bg-surface-elevated/45 hover:text-foreground/85 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-0 ${focusRing}`;

/* ── Empty & loading states ────────────────────────────────────────────────── */

export const studioEmptyStateCard =
  `mx-auto flex w-full min-w-0 max-w-lg flex-col items-center rounded-2xl bg-surface/40 px-5 py-9 text-center ring-1 ring-border/20 backdrop-blur-xl sm:px-10 sm:py-12 ${shadowInset}`;

export const studioEmptyStateIcon =
  "relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/15 sm:mb-6 sm:h-[4.5rem] sm:w-[4.5rem]";

export const studioEmptyStateTitle =
  "text-lg font-semibold tracking-tight text-foreground sm:text-xl lg:text-[1.35rem]";

export const studioEmptyStateDesc =
  "mt-3 max-w-sm text-sm leading-relaxed text-muted sm:text-[15px]";

export const studioSkeleton =
  "studio-shimmer rounded-xl bg-surface-elevated/30 ring-1 ring-border/15";

export const studioLoadingMessage =
  "text-center text-sm font-medium tracking-tight text-foreground/90 sm:text-[15px]";

export const studioLoadingSubtext =
  "mt-1.5 text-center text-xs text-muted";

/** Shared spinner host for Studio status loading states. */
export const studioStatusSpinnerHost =
  "flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated/60 ring-1 ring-border/25";

/** Compact icon host for inline/inspector empty states. */
export const studioStatusIconBox =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-elevated/40 ring-1 ring-border/20";

/** Inline/rail empty icon host — timeline and dense regions. */
export const studioStatusIconBoxInline =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface/50 ring-1 ring-border/25";

/** Shared status title — panel and compact layouts. */
export const studioStatusTitle = "text-sm font-medium tracking-tight text-foreground/90";

/** Shared status description — panel layouts. */
export const studioStatusDescription = "mt-1 text-xs leading-relaxed text-muted";

/* ── Studio UX 2.0 shell layout (presentation only) ───────────────────────── */

/** Full studio viewport shell — fixed-height editor chrome. */
export const studioShellRoot =
  "studio-shell flex min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-hidden bg-background";

/** Centered shell content max width (editor workspace). */
export const studioShellMaxWidth = "mx-auto w-full min-w-0 max-w-[100rem]";

/** Gap between shell regions (sidebar, canvas, inspector). */
export const studioShellPanelGap = "gap-3 lg:gap-4";

/** Horizontal padding inside shell regions. */
export const studioShellRegionPadding = "px-3 py-3 sm:px-4 sm:py-4 lg:px-4";

/** Thin vertical scrollbar — inspector, sidebar, drawers. */
export const studioScrollbarVertical =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/40 [&::-webkit-scrollbar-track]:rounded-full";

/** Left scene-list rail — default (≥1280px intent). Scroll lives on inner panel surface. */
export const studioShellSidebarWidth =
  "hidden min-h-0 shrink-0 flex-col lg:flex lg:w-[15rem] xl:w-[15rem]";

/** Left scene-list rail — compact (laptop). */
export const studioShellSidebarWidthCompact =
  "hidden min-h-0 shrink-0 flex-col lg:flex lg:w-[12.5rem]";

/** Right inspector — default width. Scroll lives on inner content wrapper. */
export const studioShellInspectorWidth =
  "flex min-h-0 w-full shrink-0 flex-col lg:w-[20rem] xl:w-[20rem]";

/** Right inspector — compact width. */
export const studioShellInspectorWidthCompact =
  "flex min-h-0 w-full shrink-0 flex-col lg:w-[16.25rem]";

/** Primary scroll host inside shell rails — single owner per column. */
export const studioShellRailScrollHost =
  `min-h-0 flex-1 overflow-y-auto overscroll-contain ${studioScrollbarVertical}`;

/** Primary canvas column — centers preview content. */
export const studioShellCanvasRegion =
  "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto overscroll-contain";

/** Brief/script canvas — top-aligned forms; avoids preview centering on inputs. */
export const studioShellCanvasRegionForm =
  "flex min-h-0 min-w-0 flex-1 flex-col items-stretch justify-start overflow-y-auto overscroll-contain";

/** Editor preview canvas — fixed height, no empty scroll below centered preview. */
export const studioShellCanvasRegionEditor =
  "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden overscroll-contain";

/** Preview frame sizing inside canvas (9:16 device). */
export const studioShellCanvasMaxWidth =
  "w-full max-w-[min(100%,26.25rem)] sm:max-w-[min(100%,28rem)]";

/** Editor canvas — larger preview focus area without changing VideoPreview internals. */
export const studioShellEditorCanvasMaxWidth =
  "w-full max-w-[min(100%,22rem)] sm:max-w-[min(100%,26rem)] lg:max-w-[min(100%,32rem)] xl:max-w-[min(100%,36rem)]";

/** Scales relocated preview within the editor canvas — kept modest to avoid overflow scroll. */
export const studioShellEditorPreviewWrap =
  "flex w-full max-h-full min-h-0 flex-col items-center justify-center origin-center scale-[1.02] sm:scale-[1.05] lg:scale-[1.08] xl:scale-[1.1]";

/** Bottom timeline rail — default height. */
export const studioShellTimelineHeight =
  "flex h-[7.5rem] shrink-0 flex-col overflow-hidden border-t border-border/40 bg-surface/20 lg:h-[7.5rem]";

/** Bottom timeline rail — compact height. */
export const studioShellTimelineHeightCompact =
  "flex h-[6.25rem] shrink-0 flex-col overflow-hidden border-t border-border/40 bg-surface/20";

/** Row containing canvas + inspector. */
export const studioShellBodyRow =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row";

/** Column containing body row + timeline. */
export const studioShellMainColumn = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";

/** Header slot container inside shell. */
export const studioShellHeaderRegion =
  `shrink-0 border-b border-border/60 bg-background/60 backdrop-blur-2xl backdrop-saturate-150 ${shadowInset}`;

/** Footer slot — hidden in focus mode via shell modifier. */
export const studioShellFooterRegion =
  "shrink-0 border-t border-border/60 bg-background/50 py-3 backdrop-blur-sm sm:py-4";

/** Inner panel surface for shell slots. */
export const studioShellPanelSurface =
  `min-h-0 min-w-0 rounded-xl bg-surface/30 p-3 ring-1 ring-border/15 sm:p-4 ${shadowInset}`;

/** Section title inside shell panels. */
export const studioShellSectionTitle =
  "text-sm font-semibold tracking-tight text-foreground/95 sm:text-[15px]";

/** Section description inside shell panels. */
export const studioShellSectionDesc =
  "mt-0.5 text-xs leading-relaxed text-muted";

/* ── Export drawer (Studio UX 2.0) ─────────────────────────────────────────── */

/** Backdrop behind export drawer — above canvas, below drawer panel. */
export const studioExportDrawerBackdrop =
  "fixed inset-0 z-50 bg-black/55 backdrop-blur-sm transition-opacity duration-200 ease-out";

/** Right-side / bottom-sheet export panel container. */
export const studioExportDrawerPanel =
  "fixed z-[60] flex max-h-[min(92dvh,100%)] flex-col bg-background shadow-2xl ring-1 ring-border/40 transition-transform duration-300 ease-out inset-x-0 bottom-0 rounded-t-2xl border-t border-border/40 lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[min(100%,20rem)] lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0 xl:w-[20rem]";

/** Export drawer header row. */
export const studioExportDrawerHeader =
  "flex shrink-0 items-start justify-between gap-3 border-b border-border/30 px-4 py-3.5 sm:px-5 sm:py-4";

/** Scrollable export drawer body. */
export const studioExportDrawerBody =
  `min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5 ${studioScrollbarVertical}`;

/** Shared overlay header — drawers and modals. */
export const studioOverlayHeader = studioExportDrawerHeader;

/** Shared overlay scroll body. */
export const studioOverlayBody = studioExportDrawerBody;

/** Shared overlay footer actions row. */
export const studioOverlayFooter =
  "flex shrink-0 flex-col gap-2 border-t border-border/20 px-4 py-4 sm:flex-row sm:px-5";

/** Unified overlay close control. */
export const studioOverlayCloseButton =
  `${studioSubtleText} inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-border/25 hover:bg-surface-elevated/50 hover:text-foreground/90`;

/** Centered modal shell — flex host above backdrop. */
export const studioOverlayModalShell =
  "fixed inset-0 z-[80] flex items-end justify-center p-0 transition-opacity duration-200 ease-out sm:items-center sm:p-4";

/** Centered modal panel — publishing, confirmations, asset details. */
export const studioOverlayModalPanel =
  "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl ring-1 ring-border/30 transition-all duration-200 ease-out sm:rounded-2xl";

/* ── Timeline rail (Studio UX 2.0) ─────────────────────────────────────────── */

/** Horizontal scene chip scroller inside StudioTimelineShell. */
export const studioTimelineRailScroll =
  "flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/40";

/** Compact scene navigation chip — inactive. */
export const studioTimelineRailChip =
  `group flex w-[4.75rem] shrink-0 flex-col items-stretch gap-1.5 rounded-xl bg-surface/35 p-1.5 text-left ring-1 ring-border/20 transition duration-150 hover:bg-surface-elevated/45 hover:ring-border/35 hover:shadow-sm active:scale-[0.98] sm:w-[5.25rem] ${focusRing}`;

/** Compact scene navigation chip — selected. */
export const studioTimelineRailChipActive =
  "rounded-xl bg-accent-soft p-1.5 ring-1 ring-accent/35 shadow-[0_0_0_1px_rgba(91,140,255,0.12)]";

/** Thumbnail frame inside a timeline rail chip. */
export const studioTimelineRailThumb =
  "relative h-11 w-full overflow-hidden rounded-lg bg-surface-elevated/40 ring-1 ring-border/15 sm:h-12";

/** Scene meta label under thumbnail. */
export const studioTimelineRailLabel =
  "truncate text-center text-[10px] font-semibold leading-tight text-foreground/90";

/** Duration caption under scene label. */
export const studioTimelineRailDuration =
  "truncate text-center text-[9px] font-medium tabular-nums text-muted";

/* ── Inspector sections (Studio UX 2.0) ────────────────────────────────────── */

/** Collapsible inspector section container. */
export const studioInspectorSection =
  "group/details w-full min-w-0 shrink-0 rounded-xl bg-surface/25 ring-1 ring-border/15";

/** Animated accordion body wrapper — overflow hidden only on inner content. */
export const studioInspectorSectionContent =
  "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none group-open/details:grid-rows-[1fr]";

/** Inner clip for accordion height animation. */
export const studioInspectorSectionContentInner = "overflow-hidden min-h-0";

/** Inspector section summary row. */
export const studioInspectorSectionSummary =
  "flex min-h-[2.5rem] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 sm:px-3.5 [&::-webkit-details-marker]:hidden";

/** Inspector section title. */
export const studioInspectorSectionTitle =
  "text-xs font-semibold tracking-tight text-foreground/90 sm:text-[13px]";

/** Inspector section body padding. */
export const studioInspectorSectionBody =
  "space-y-2.5 border-t border-border/15 px-3 py-2.5 sm:px-3.5 sm:py-3";

/** Vertical stack spacing between inspector sections. */
export const studioInspectorStack = "flex min-w-0 flex-col gap-2";

/** Nested accordion inside an inspector section — lighter surface. */
export const studioInspectorNestedSection =
  "group/details w-full min-w-0 rounded-lg bg-surface/20 ring-1 ring-border/15";

/** Nested accordion summary — matches main section header height. */
export const studioInspectorNestedSummary =
  "flex min-h-[2.25rem] cursor-pointer list-none items-center justify-between gap-2 px-3 py-1.5 [&::-webkit-details-marker]:hidden";

/** Nested accordion title. */
export const studioInspectorNestedTitle =
  "text-[11px] font-semibold tracking-tight text-foreground/85 sm:text-xs";

/* ── Shared picker layout (voice, speech style, captions) ─────────────────── */

/** Picker section vertical rhythm. */
export const studioPickerStack = "space-y-2";
export const studioPickerStackCompact = "space-y-1.5";

/** Picker option grid — two columns in inspector. */
export const studioPickerGrid = "grid grid-cols-2 gap-1";
export const studioPickerGridCompact = "grid grid-cols-2 gap-0.5";

/** Picker card shell — extends studioCard with consistent flex layout. */
export const studioPickerCard =
  `${studioCard} flex min-h-[2.75rem] w-full flex-col items-start justify-center gap-1 text-left`;

/** Picker card — selected state. */
export const studioPickerCardActive =
  `${studioCardActive} flex min-h-[2.75rem] w-full flex-col items-start justify-center gap-1 text-left`;

/** Picker card title — compact inspector. */
export const studioPickerCardLabel = "font-medium text-foreground/95 text-xs";

/** Picker card title — default density. */
export const studioPickerCardLabelLg = "font-medium text-foreground/95 text-sm";

/** Picker card helper line. */
export const studioPickerCardDescription = `${studioSubtleText} line-clamp-1 text-[11px]`;
export const studioPickerCardDescriptionCompact = `${studioSubtleText} line-clamp-1 text-[10px]`;

/** Scene summary strip at top of inspector. */
export const studioInspectorSummaryStrip =
  "rounded-xl bg-surface/30 px-3 py-3 ring-1 ring-border/15 sm:px-3.5";

/* ── Editor project sidebar (navigation only) ──────────────────────────────── */

/** Vertical scene navigation list in editor sidebar. */
export const studioSidebarSceneList = "flex min-w-0 flex-col gap-1";

/** Sidebar scene row — inactive. */
export const studioSidebarSceneItem =
  `flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-left ring-1 ring-transparent transition duration-150 hover:bg-surface-elevated/40 hover:ring-border/20 active:scale-[0.99] ${focusRing}`;

/** Sidebar scene row — selected. */
export const studioSidebarSceneItemActive =
  "bg-accent-soft ring-1 ring-accent/30 hover:bg-accent-soft hover:ring-accent/35";

/** Sidebar scene thumbnail. */
export const studioSidebarSceneThumb =
  "flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-elevated/45 ring-1 ring-border/15";

/** Sidebar scene title. */
export const studioSidebarSceneTitle =
  "block truncate text-xs font-semibold text-foreground/90";

/** Sidebar scene meta line. */
export const studioSidebarSceneMeta =
  "block truncate text-[10px] tabular-nums text-muted";

/* ── Context ribbon (Studio UX 2.1) ────────────────────────────────────────── */

/** Context ribbon container above the editor canvas. */
export const studioContextRibbon =
  "mb-3 flex w-full min-w-0 flex-wrap items-center gap-3 rounded-xl bg-surface/35 px-3 py-2 ring-1 ring-border/20 sm:px-3.5";

/** Ribbon section grouping. */
export const studioRibbonSection = "flex min-w-0 flex-wrap items-center gap-2 sm:gap-3";

/** Ribbon section title chip. */
export const studioRibbonSectionTitle =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-elevated/40 px-2 py-1 text-[11px] font-semibold text-foreground/85 ring-1 ring-border/15";

/** Ribbon action control — inactive. */
export const studioRibbonAction = studioCompactButton;

/** Ribbon action control — active / selected. */
export const studioRibbonActionActive =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2 min-h-[2.25rem] text-xs font-medium text-foreground ring-1 ring-accent/30 hover:bg-accent-soft/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0 sm:py-1.5 outline-none transition-[color,background-color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
