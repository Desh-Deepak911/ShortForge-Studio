"use client";

import {
  CREATOR_TEMPLATE_CATEGORY_TABS,
  type CreatorTemplateCategoryFilter,
} from "@/features/creator-templates/creator-template-picker.utils";
import { studioChip, studioChipActive } from "@/lib/utils/studioUi";

export interface CreatorTemplateCategoryTabsProps {
  activeCategory: CreatorTemplateCategoryFilter;
  onCategoryChange: (category: CreatorTemplateCategoryFilter) => void;
  disabled?: boolean;
}

export default function CreatorTemplateCategoryTabs({
  activeCategory,
  onCategoryChange,
  disabled = false,
}: CreatorTemplateCategoryTabsProps) {
  return (
    <div
      className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Template categories"
    >
      {CREATOR_TEMPLATE_CATEGORY_TABS.map((tab) => {
        const active = activeCategory === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onCategoryChange(tab.id)}
            className={`${active ? studioChipActive : studioChip} shrink-0 px-2.5 py-1 text-[10px] sm:text-[11px]`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
