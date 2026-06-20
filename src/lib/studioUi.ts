/** Shared Tailwind class strings for the FootieBitz creative studio UI. */

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

export const studioLabel =
  "mb-2 block text-sm font-medium text-foreground/90";

export const studioFieldLabel =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted";

export const studioSubtleText =
  "text-xs leading-relaxed text-muted";

/* ── Layout & surfaces ─────────────────────────────────────────────────────── */

/** Primary page section card. */
export const studioCard =
  `min-w-0 rounded-2xl bg-surface/40 p-4 backdrop-blur-xl sm:p-6 lg:p-7 ${surfaceRing} ${shadowInset}`;

/** Nested panel inside a card. */
export const studioPanel =
  "rounded-xl bg-surface-elevated/30 p-3.5 ring-1 ring-border/20 sm:p-4";

/** Frosted inset panel for callouts. */
export const studioGlass =
  "rounded-xl bg-surface-elevated/50 p-3.5 ring-1 ring-border/20 backdrop-blur-md sm:p-4";

/** Storyboard main-column section — lighter than studioCard to reduce nesting weight. */
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
