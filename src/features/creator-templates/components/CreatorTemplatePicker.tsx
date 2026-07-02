"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  filterCreatorTemplates,
  findCreatorTemplateById,
  type CreatorTemplateCategoryFilter,
} from "@/features/creator-templates/creator-template-picker.utils";
import { getCreatorTemplates } from "@/features/creator-templates/creator-template.utils";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import {
  studioCard,
  studioCardActive,
  studioComposerInput,
  studioFieldLabel,
  studioScrollbarVertical,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { ScriptMode } from "@/types/footiebitz";

import CreatorTemplateCard from "./CreatorTemplateCard";
import CreatorTemplateCategoryTabs from "./CreatorTemplateCategoryTabs";
import CreatorTemplateSummary from "./CreatorTemplateSummary";

const ALL_TEMPLATES = getCreatorTemplates();

export interface CreatorTemplatePickerProps {
  selectedTemplateId: CreatorTemplateId | "";
  onTemplateChange: (templateId: CreatorTemplateId | "") => void;
  scriptMode: ScriptMode;
  sceneCount: number;
  duration: number;
  disabled?: boolean;
}

export default function CreatorTemplatePicker({
  selectedTemplateId,
  onTemplateChange,
  scriptMode,
  sceneCount,
  duration,
  disabled = false,
}: CreatorTemplatePickerProps) {
  const [activeCategory, setActiveCategory] = useState<CreatorTemplateCategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTemplates = useMemo(
    () =>
      filterCreatorTemplates(ALL_TEMPLATES, {
        category: activeCategory,
        query: searchQuery,
      }),
    [activeCategory, searchQuery],
  );

  const selectedTemplate = selectedTemplateId
    ? findCreatorTemplateById(ALL_TEMPLATES, selectedTemplateId)
    : undefined;

  return (
    <div className="space-y-2">
      <div>
        <span className={studioFieldLabel}>Creator template</span>
        <p className={`${studioSubtleText} mt-0.5 text-[11px]`}>
          Pick a reusable format — defaults apply to content type, scenes, and duration.
        </p>
      </div>

      <CreatorTemplateCategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        disabled={disabled}
      />

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search templates"
          disabled={disabled}
          aria-label="Search templates"
          className={`${studioComposerInput} min-h-[2.25rem] py-2 pl-8 pr-2.5 text-[11px]`}
        />
      </div>

      <div
        className={`max-h-56 space-y-1 overflow-y-auto overscroll-contain pr-0.5 ${studioScrollbarVertical}`}
        role="listbox"
        aria-label="Creator templates"
      >
        <button
          type="button"
          role="option"
          aria-selected={selectedTemplateId === ""}
          disabled={disabled}
          onClick={() => onTemplateChange("")}
          className={`${selectedTemplateId === "" ? studioCardActive : studioCard} px-2.5 py-2 text-left`}
        >
          <span className="text-xs font-medium text-foreground/95">No template</span>
          <p className={`${studioSubtleText} mt-0.5 text-[10px] leading-snug`}>
            Start from scratch with your own content type and scene settings.
          </p>
        </button>

        {filteredTemplates.map((template) => (
          <CreatorTemplateCard
            key={template.id}
            template={template}
            selected={selectedTemplateId === template.id}
            disabled={disabled}
            onSelect={onTemplateChange}
          />
        ))}

        {filteredTemplates.length === 0 ? (
          <p className={`${studioSubtleText} px-1 py-2 text-center text-[11px]`}>
            No templates match this filter.
          </p>
        ) : null}
      </div>

      {selectedTemplate ? (
        <CreatorTemplateSummary
          template={selectedTemplate}
          scriptMode={scriptMode}
          sceneCount={sceneCount}
          duration={duration}
        />
      ) : null}
    </div>
  );
}
