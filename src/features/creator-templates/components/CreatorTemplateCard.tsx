"use client";

import {
  formatCreatorTemplateCategory,
  resolveScriptModeLabel,
} from "@/features/creator-templates/creator-template-picker.utils";
import type { CreatorTemplate } from "@/features/creator-templates/creator-template.types";
import { getCaptionPreset } from "@/features/caption-engine/caption-preset.registry";
import { getSpeechStylePreset } from "@/features/speech-style/speech-style.registry";
import {
  studioCard,
  studioCardActive,
  studioCardTag,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface CreatorTemplateCardProps {
  template: CreatorTemplate;
  selected: boolean;
  disabled?: boolean;
  onSelect: (templateId: CreatorTemplate["id"]) => void;
}

export default function CreatorTemplateCard({
  template,
  selected,
  disabled = false,
  onSelect,
}: CreatorTemplateCardProps) {
  const speechStyleLabel = template.defaults.speechStylePreset
    ? getSpeechStylePreset(template.defaults.speechStylePreset)?.label
    : undefined;
  const captionPresetLabel = template.defaults.captionPreset
    ? getCaptionPreset(template.defaults.captionPreset)?.label
    : undefined;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      onClick={() => onSelect(template.id)}
      className={`${selected ? studioCardActive : studioCard} flex w-full flex-col gap-1 px-2.5 py-2`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="text-left text-xs font-medium leading-snug text-foreground/95 sm:text-[13px]">
          {template.title}
        </span>
        <span className={`${studioCardTag} shrink-0 normal-case tracking-normal`}>
          {formatCreatorTemplateCategory(template.category)}
        </span>
      </div>

      <p className={`${studioSubtleText} line-clamp-2 text-left text-[10px] leading-snug sm:text-[11px]`}>
        {template.description}
      </p>

      <div className="flex flex-wrap gap-0.5">
        <span className={studioCardTag}>{template.defaults.sceneCount} scenes</span>
        <span className={studioCardTag}>{template.defaults.targetDurationSec}s</span>
        <span className={`${studioCardTag} normal-case tracking-normal`}>
          {resolveScriptModeLabel(template.defaults.scriptMode)}
        </span>
        {speechStyleLabel ? (
          <span className={`${studioCardTag} normal-case tracking-normal`}>{speechStyleLabel}</span>
        ) : null}
        {captionPresetLabel ? (
          <span className={`${studioCardTag} normal-case tracking-normal`}>{captionPresetLabel}</span>
        ) : null}
      </div>

      <p className={`${studioSubtleText} line-clamp-1 text-left text-[10px]`}>
        {template.recommendedFor.slice(0, 3).join(" · ")}
      </p>
    </button>
  );
}
