import type { StoryStrategy } from "../story-strategy/story-strategy.types";
import type { SceneBlueprintRole } from "../scene-blueprint.types";
import { DEFAULT_STORY_STRATEGY_ID } from "../story-strategy/story-strategy.constants";
import { getModeTemplateById, MODE_TEMPLATE_REGISTRY } from "./mode-template.registry";
import type { ModeTemplate, ModeTemplateId, ModeTemplateSlot } from "./mode-template.types";

export function resolveModeTemplate(strategy: StoryStrategy): ModeTemplate {
  return getModeTemplateById(strategy.id);
}

export function isDefaultModeTemplate(templateId: ModeTemplateId): boolean {
  return templateId === DEFAULT_STORY_STRATEGY_ID;
}

export function mapBlueprintIndexToSlotIndex(
  blueprintIndex: number,
  blueprintCount: number,
  slotCount: number,
): number {
  if (slotCount <= 1) {
    return 0;
  }

  if (blueprintCount <= 1) {
    return 0;
  }

  const ratio = blueprintIndex / Math.max(1, blueprintCount - 1);
  return Math.min(slotCount - 1, Math.round(ratio * (slotCount - 1)));
}

export function resolveSlotForBlueprintIndex(
  template: ModeTemplate,
  blueprintIndex: number,
  blueprintCount: number,
): ModeTemplateSlot {
  const slotIndex = mapBlueprintIndexToSlotIndex(blueprintIndex, blueprintCount, template.targetSceneSlots.length);
  return template.targetSceneSlots[slotIndex] ?? template.targetSceneSlots[0];
}

export function isSoftBlueprintRole(role: SceneBlueprintRole): boolean {
  return role === "context" || role === "transition";
}

export function slotLabelInTitle(title: string, slotLabel: string): boolean {
  const normalizedTitle = title.toLowerCase();
  const normalizedLabel = slotLabel.toLowerCase();

  return (
    normalizedTitle.includes(normalizedLabel) ||
    normalizedTitle.includes(normalizedLabel.replace(/\s+/g, ""))
  );
}

export function buildTemplateTitle(existingTitle: string, slotLabel: string): string {
  if (slotLabelInTitle(existingTitle, slotLabel)) {
    return existingTitle;
  }

  const suffix = existingTitle.includes(":") ? existingTitle.split(":").slice(1).join(":").trim() : existingTitle;
  return suffix ? `${slotLabel}: ${suffix}` : slotLabel;
}

export function listModeTemplateIds(): readonly ModeTemplateId[] {
  return Object.freeze(Object.keys(MODE_TEMPLATE_REGISTRY) as ModeTemplateId[]);
}
