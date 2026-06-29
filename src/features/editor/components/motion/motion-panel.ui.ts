import {
  studioInspectorSectionContent,
  studioInspectorSectionContentInner,
  studioInspectorSectionTitle,
  studioRibbonAction,
  studioRibbonActionActive,
  studioSegment,
  studioSegmentActive,
  studioSegmentedControl,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Motion panel column — flat sections, single visual shell from InspectorSection. */
export const studioMotionPanelRoot = "flex min-w-0 flex-col gap-4";

/** Spacing wrapper for one motion panel block. */
export const studioMotionPanelSection = "min-w-0 space-y-2";

/** Divider between motion blocks — replaces nested panel rings. */
export const studioMotionPanelDivider =
  "border-t border-border/15 pt-4 first:border-t-0 first:pt-0";

/** Section heading — matches inspector section title weight. */
export const studioMotionPanelHeading = studioInspectorSectionTitle;

/** Supporting copy under motion headings. */
export const studioMotionPanelDesc = `${studioSubtleText} mt-0.5 leading-snug`;

/** Segmented control track — aligned with ribbon / inspector segments. */
export const studioMotionSegmentedControl = studioSegmentedControl;

/** Segmented option — inactive. */
export const studioMotionSegment = `${studioSegment} ${focusRing} transition-[color,background-color,box-shadow] duration-150 hover:bg-surface-elevated/45 hover:text-foreground/90`;

/** Segmented option — active. */
export const studioMotionSegmentActive = studioSegmentActive;

/** Category accordion card — lighter ring than inspector outer sections. */
export const studioMotionCategoryCard =
  "group/details w-full min-w-0 shrink-0 rounded-xl bg-surface/20 ring-1 ring-border/12 transition-[background-color,box-shadow,ring-color] duration-150 hover:bg-surface/28 hover:ring-border/22";

/** Category card when it contains the active preset. */
export const studioMotionCategoryCardActive =
  "bg-surface/30 ring-accent/25 shadow-[inset_0_1px_0_rgba(91,140,255,0.06)]";

/** Category summary row — keyboard focus matches ribbon actions. */
export const studioMotionCategorySummary =
  `flex cursor-pointer list-none items-start justify-between gap-2 rounded-xl px-3 py-2.5 sm:px-3.5 [&::-webkit-details-marker]:hidden ${focusRing}`;

/** Category accordion body — no inner top border (reduces double rules). */
export const studioMotionCategoryBody = "px-3 pb-3 pt-0.5 sm:px-3.5 sm:pb-3.5";

export const studioMotionCategoryContent = studioInspectorSectionContent;
export const studioMotionCategoryContentInner = studioInspectorSectionContentInner;

/** Preset chip — ribbon action sizing for scanability. */
export const studioMotionPresetChip = studioRibbonAction;

/** Preset chip — selected state matches context ribbon. */
export const studioMotionPresetChipActive = studioRibbonActionActive;

/** Preview motion callout — flat surface like context ribbon, no extra ring. */
export const studioMotionPreviewCard =
  "flex min-w-0 flex-col gap-2.5 rounded-xl bg-surface/30 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-3.5 sm:py-3";

/** Compact icon tile inside motion cards. */
export const studioMotionIconTile =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-elevated/45 ring-1 ring-border/15";

/** Active category icon tile accent. */
export const studioMotionIconTileActive = "bg-accent-soft/80 ring-accent/25";
