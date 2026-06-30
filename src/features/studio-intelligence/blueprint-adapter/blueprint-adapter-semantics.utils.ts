import type { SceneBlueprint, SceneBlueprintKind } from "../scene-blueprint.types";
import type { StoryStrategyId } from "../story-strategy/story-strategy.types";
import {
  getModeTemplateById,
  isDefaultModeTemplate,
  resolveSlotForBlueprintIndex,
} from "../mode-templates";
import type { ModeTemplateSlot } from "../mode-templates/mode-template.types";
import type { VisualIntentType } from "../studio-intelligence.types";
import type { BlueprintSceneSemanticMetadata } from "./blueprint-adapter.types";

const CONTENT_PATTERN_BY_KIND: Partial<Record<SceneBlueprintKind, string>> = {
  ranked_reveal: "ranked_scene",
  debate_split: "debate_scene",
  comparison: "comparison_scene",
  stat_moment: "analysis_scene",
  match_highlight: "analysis_scene",
  closing_moment: "payoff_scene",
  cta_card: "cta_scene",
  hook_opener: "hook_scene",
  player_spotlight: "profile_scene",
  text_card: "card_scene",
};

const COLLAPSED_PRODUCTION_TYPES = new Set(["context", "transition"]);

function parseTitleSlotLabel(title: string): string | undefined {
  const colonIndex = title.indexOf(":");
  if (colonIndex <= 0) {
    return undefined;
  }

  return title.slice(0, colonIndex).trim();
}

function findSlotByLabel(
  slots: readonly ModeTemplateSlot[],
  label: string,
): ModeTemplateSlot | undefined {
  const normalized = label.toLowerCase();
  return slots.find((slot) => slot.label.toLowerCase() === normalized);
}

/** Maps blueprint kind and visual intent to a semantic content pattern label. */
export function resolveContentPattern(blueprint: SceneBlueprint): string {
  const fromKind = CONTENT_PATTERN_BY_KIND[blueprint.kind];
  if (fromKind) {
    return fromKind;
  }

  if (blueprint.visual.visualIntentType === "comparison_split") {
    return "comparison_scene";
  }

  if (
    blueprint.visual.visualIntentType === "stat_overlay" ||
    blueprint.visual.visualIntentType === "timeline_graphic"
  ) {
    return "analysis_scene";
  }

  if (blueprint.role === "cta") {
    return "cta_scene";
  }

  if (blueprint.role === "payoff" || blueprint.role === "ending") {
    return "payoff_scene";
  }

  return "generic_scene";
}

function buildPlanningTags(
  blueprint: SceneBlueprint,
  slot: ModeTemplateSlot,
  contentPattern: string,
  templateId: StoryStrategyId,
): string[] {
  const tags = new Set<string>([
    `template:${templateId}`,
    `slot:${slot.slotId}`,
    `pattern:${contentPattern}`,
    `role:${blueprint.role}`,
    `kind:${blueprint.kind}`,
  ]);

  if (blueprint.visual.visualIntentType) {
    tags.add(`visual:${blueprint.visual.visualIntentType}`);
  }

  if (blueprint.caption.captionStyleHint !== "default") {
    tags.add(`caption:${blueprint.caption.captionStyleHint}`);
  }

  return [...tags];
}

function resolveMatchedSlot(
  blueprint: SceneBlueprint,
  blueprintIndex: number,
  blueprintCount: number,
  strategyId: StoryStrategyId,
): ModeTemplateSlot {
  const template = getModeTemplateById(strategyId);
  const titleLabel = parseTitleSlotLabel(blueprint.title);

  if (titleLabel) {
    const byLabel = findSlotByLabel(template.targetSceneSlots, titleLabel);
    if (byLabel) {
      return byLabel;
    }
  }

  return resolveSlotForBlueprintIndex(template, blueprintIndex, blueprintCount);
}

/** Derives semantic slot metadata for a blueprint using mode-template semantics. */
export function resolveBlueprintSemanticMetadata(
  blueprint: SceneBlueprint,
  blueprintIndex: number,
  blueprintCount: number,
  strategyId: StoryStrategyId = "default",
): BlueprintSceneSemanticMetadata {
  const template = getModeTemplateById(strategyId);
  const slot = resolveMatchedSlot(blueprint, blueprintIndex, blueprintCount, strategyId);
  const contentPattern = resolveContentPattern(blueprint);
  const templateApplied = !isDefaultModeTemplate(template.templateId);

  return {
    semanticSlotId: slot.slotId,
    semanticSlotLabel: slot.label,
    semanticRole: slot.label,
    templateId: template.templateId,
    templateApplied,
    contentPattern,
    planningTags: buildPlanningTags(blueprint, slot, contentPattern, template.templateId),
  };
}

export function isCollapsedSemanticKind(
  blueprintKind: SceneBlueprintKind,
  contentPattern: string,
  proposedSceneType: string,
): boolean {
  return (
    COLLAPSED_PRODUCTION_TYPES.has(proposedSceneType) &&
    contentPattern !== "generic_scene" &&
    contentPattern !== "hook_scene"
  );
}

export function sceneHasPreservedTemplateSemantics(scene: {
  templateApplied: boolean;
  semanticSlotLabel: string;
  contentPattern: string;
}): boolean {
  return scene.templateApplied && Boolean(scene.semanticSlotLabel) && scene.contentPattern !== "generic_scene";
}

export function visualIntentSupportsContentPattern(intent: VisualIntentType): boolean {
  return intent === "comparison_split" || intent === "stat_overlay" || intent === "timeline_graphic";
}
