"use client";

import { ChevronDown } from "lucide-react";
import { useState, type SyntheticEvent } from "react";

import type { ImageMotionPreset } from "@/features/timeline-intelligence/image-motion-presets.utils";

import type { MotionCategoryDefinition } from "./motion-categories.config";
import { motionCategoryContainsPreset } from "./motion-categories.config";
import {
  studioMotionCategoryBody,
  studioMotionCategoryCard,
  studioMotionCategoryCardActive,
  studioMotionCategoryContent,
  studioMotionCategoryContentInner,
  studioMotionCategorySummary,
  studioMotionIconTile,
  studioMotionIconTileActive,
  studioMotionPanelDesc,
  studioMotionPanelHeading,
} from "./motion-panel.ui";
import MotionPresetChips from "./MotionPresetChips";

export interface MotionCategoryCardProps {
  category: MotionCategoryDefinition;
  activePreset: ImageMotionPreset;
  defaultOpen?: boolean;
  onPresetSelect: (preset: ImageMotionPreset) => void;
}

/**
 * Studio Motion Card — icon, title, description, preset chips, chevron accordion.
 */
export default function MotionCategoryCard({
  category,
  activePreset,
  defaultOpen = false,
  onPresetSelect,
}: MotionCategoryCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = category.icon;
  const containsActive = motionCategoryContainsPreset(category, activePreset);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(event.currentTarget.open);
  };

  return (
    <details
      open={open}
      onToggle={handleToggle}
      className={`${studioMotionCategoryCard} group/details ${containsActive ? studioMotionCategoryCardActive : ""}`.trim()}
    >
      <summary className={studioMotionCategorySummary}>
        <span className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className={`${studioMotionIconTile} ${containsActive ? studioMotionIconTileActive : ""}`.trim()}
          >
            <Icon className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 pt-0.5">
            <span className={studioMotionPanelHeading}>{category.title}</span>
            <span className={`${studioMotionPanelDesc} block text-[11px]`}>{category.description}</span>
          </span>
        </span>
        <ChevronDown
          className="mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open/details:rotate-180"
          strokeWidth={1.75}
          aria-hidden
        />
      </summary>

      <div className={studioMotionCategoryContent}>
        <div className={studioMotionCategoryContentInner}>
          <div className={studioMotionCategoryBody}>
            <MotionPresetChips
              presets={category.presets}
              activePreset={activePreset}
              onSelect={onPresetSelect}
            />
          </div>
        </div>
      </div>
    </details>
  );
}
