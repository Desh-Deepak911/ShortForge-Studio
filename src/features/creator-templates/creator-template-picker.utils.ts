import type { CreatorTemplate, CreatorTemplateCategory } from "./creator-template.types";

import { SCRIPT_MODE_OPTIONS, type ScriptMode } from "@/types/footiebitz";

export type CreatorTemplateCategoryFilter = CreatorTemplateCategory | "all";

export const CREATOR_TEMPLATE_CATEGORY_TABS: readonly {
  id: CreatorTemplateCategoryFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "educational", label: "Educational" },
  { id: "match_day", label: "Match day" },
  { id: "analysis", label: "Analysis" },
  { id: "list", label: "Lists" },
  { id: "history", label: "History" },
  { id: "news", label: "News" },
  { id: "tactical", label: "Tactical" },
  { id: "documentary", label: "Documentary" },
  { id: "debate", label: "Debate" },
] as const;

const CATEGORY_LABELS: Record<CreatorTemplateCategory, string> = {
  educational: "Educational",
  match_day: "Match day",
  analysis: "Analysis",
  list: "Lists",
  history: "History",
  news: "News",
  tactical: "Tactical",
  documentary: "Documentary",
  debate: "Debate",
};

export function formatCreatorTemplateCategory(category: CreatorTemplateCategory): string {
  return CATEGORY_LABELS[category];
}

export function resolveScriptModeLabel(scriptMode: ScriptMode): string {
  return SCRIPT_MODE_OPTIONS.find((option) => option.value === scriptMode)?.label ?? scriptMode;
}

export function filterCreatorTemplates(
  templates: readonly CreatorTemplate[],
  options: {
    category?: CreatorTemplateCategoryFilter;
    query?: string;
  } = {},
): CreatorTemplate[] {
  const category = options.category ?? "all";
  const query = options.query?.trim().toLowerCase() ?? "";

  return templates.filter((template) => {
    if (category !== "all" && template.category !== category) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      template.title,
      template.description,
      formatCreatorTemplateCategory(template.category),
      ...template.recommendedFor,
      template.defaults.scriptMode,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function findCreatorTemplateById(
  templates: readonly CreatorTemplate[],
  templateId: string,
): CreatorTemplate | undefined {
  const normalized = templateId.trim().toLowerCase();
  return templates.find((template) => template.id === normalized);
}
