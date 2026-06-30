import type { SceneBlueprint, SceneBlueprintCollection } from "../scene-blueprint.types";
import {
  calculateBlueprintCollectionStats,
  clampBlueprintConfidence,
  createEmptySceneBlueprintCollection,
  mapVisualIntentToAssetRequirement,
} from "../scene-blueprint.utils";
import type { StudioIntelligenceInput } from "../studio-intelligence.types";
import { resolvePlannerStrategy } from "../story-strategy/planner-strategy.utils";
import type { StoryStrategy } from "../story-strategy/story-strategy.types";
import type {
  ModeTemplateApplicationDiagnostics,
  ModeTemplateApplicationResult,
  ModeTemplateSlot,
} from "./mode-template.types";
import {
  buildTemplateTitle,
  isDefaultModeTemplate,
  isSoftBlueprintRole,
  resolveModeTemplate,
  resolveSlotForBlueprintIndex,
} from "./mode-template.utils";

function cloneBlueprint(blueprint: SceneBlueprint): SceneBlueprint {
  return {
    ...blueprint,
    beatIds: [...blueprint.beatIds],
    timing: { ...blueprint.timing },
    importance: { ...blueprint.importance },
    visual: { ...blueprint.visual },
    asset: { ...blueprint.asset },
    motion: { ...blueprint.motion },
    caption: {
      ...blueprint.caption,
      highlightWords: [...blueprint.caption.highlightWords],
    },
  };
}

function resolveCaptionStyleForSlot(
  slot: ModeTemplateSlot,
  templateCaptionProfile: ReturnType<typeof resolveModeTemplate>["captionProfile"],
): SceneBlueprint["caption"]["captionStyleHint"] {
  return slot.captionStyleHint ?? templateCaptionProfile.bodyStyle;
}

function shouldApplyRole(currentRole: SceneBlueprint["role"], slotRole: SceneBlueprint["role"], gentle: boolean): boolean {
  if (currentRole === slotRole) {
    return false;
  }

  if (gentle) {
    return isSoftBlueprintRole(currentRole);
  }

  return isSoftBlueprintRole(currentRole) || currentRole === "intro" || currentRole === "ending";
}

function shouldApplyVisual(currentVisual: SceneBlueprint["visual"]["visualIntentType"], slotVisual?: SceneBlueprint["visual"]["visualIntentType"]): boolean {
  if (!slotVisual || currentVisual === slotVisual) {
    return false;
  }

  return currentVisual === "neutral_broll";
}

function normalizeBlueprintWithSlot(
  blueprint: SceneBlueprint,
  slot: ModeTemplateSlot,
  template: ReturnType<typeof resolveModeTemplate>,
  gentle: boolean,
): { blueprint: SceneBlueprint; matched: boolean; fallback?: string } {
  const next = cloneBlueprint(blueprint);
  let matched = false;

  const nextTitle = buildTemplateTitle(next.title, slot.label);
  if (nextTitle !== next.title) {
    next.title = nextTitle;
    matched = true;
  } else if (slotLabelMatches(next.title, slot.label)) {
    matched = true;
  }

  if (shouldApplyRole(next.role, slot.preferredRole, gentle)) {
    next.role = slot.preferredRole;
    matched = true;
  }

  if (!gentle && slot.preferredKind && (next.kind === "neutral_broll" || next.kind !== slot.preferredKind)) {
    next.kind = slot.preferredKind;
    matched = true;
  }

  if (slot.preferredVisualIntent && shouldApplyVisual(next.visual.visualIntentType, slot.preferredVisualIntent)) {
    next.visual = {
      ...next.visual,
      visualIntentType: slot.preferredVisualIntent,
      reason: `Mode template ${template.templateId} slot ${slot.slotId} visual hint.`,
    };
    next.asset = {
      ...next.asset,
      assetRequirementType: mapVisualIntentToAssetRequirement(slot.preferredVisualIntent),
    };
    matched = true;
  } else if (
    slot.preferredVisualIntent &&
    gentle === false &&
    next.visual.visualIntentType !== slot.preferredVisualIntent
  ) {
    next.visual = {
      ...next.visual,
      visualIntentType: slot.preferredVisualIntent,
      reason: `Mode template ${template.templateId} slot ${slot.slotId} visual hint.`,
    };
    next.asset = {
      ...next.asset,
      assetRequirementType: mapVisualIntentToAssetRequirement(slot.preferredVisualIntent),
    };
    matched = true;
  }

  if (slot.timingPacing && next.timing.pacing !== slot.timingPacing) {
    next.timing = {
      ...next.timing,
      pacing: slot.timingPacing,
      reason: `Mode template ${template.templateId} slot ${slot.slotId} pacing hint.`,
    };
    matched = true;
  }

  const captionStyleHint = resolveCaptionStyleForSlot(slot, template.captionProfile);
  const captionEmphasis = slot.captionEmphasis ?? next.caption.emphasis;

  if (
    gentle === false &&
    (next.caption.captionStyleHint !== captionStyleHint || next.caption.emphasis !== captionEmphasis)
  ) {
    next.caption = {
      ...next.caption,
      captionStyleHint,
      emphasis: captionEmphasis,
      reason: `Mode template ${template.templateId} slot ${slot.slotId} caption hint.`,
    };
    matched = true;
  }

  if (matched) {
    next.confidence = clampBlueprintConfidence(next.confidence + 0.01);
  }

  return { blueprint: next, matched };
}

function slotLabelMatches(title: string, slotLabel: string): boolean {
  return title.toLowerCase().includes(slotLabel.toLowerCase());
}

function createDiagnostics(
  template: ReturnType<typeof resolveModeTemplate>,
  slotsMatched: number,
  fallbacks: string[],
): ModeTemplateApplicationDiagnostics {
  return {
    modeTemplateApplied: true,
    modeTemplateId: template.templateId,
    templateSlotsMatched: slotsMatched,
    templateFallbacks: fallbacks,
  };
}

/** Gently normalizes blueprint planning metadata to match a mode template. */
export function applyModeTemplateToBlueprints(
  collection: SceneBlueprintCollection,
  strategy?: StoryStrategy,
  input?: StudioIntelligenceInput,
): ModeTemplateApplicationResult {
  void input;
  const resolvedStrategy = resolvePlannerStrategy(input, strategy);
  const template = resolveModeTemplate(resolvedStrategy);
  const gentle = isDefaultModeTemplate(template.templateId);

  if (collection.blueprints.length === 0) {
    return {
      collection: createEmptySceneBlueprintCollection(),
      diagnostics: {
        modeTemplateApplied: false,
        modeTemplateId: template.templateId,
        templateSlotsMatched: 0,
        templateFallbacks: ["empty_blueprint_collection"],
      },
    };
  }

  const fallbacks: string[] = [];
  const blueprintCount = collection.blueprints.length;
  const slotCount = template.targetSceneSlots.length;

  if (gentle) {
    return {
      collection: {
        blueprints: collection.blueprints.map((blueprint) => cloneBlueprint(blueprint)),
        ...calculateBlueprintCollectionStats(collection.blueprints),
        warnings: [...collection.warnings],
      },
      diagnostics: {
        modeTemplateApplied: true,
        modeTemplateId: template.templateId,
        templateSlotsMatched: 0,
        templateFallbacks: ["default_template_minimal_pass"],
      },
    };
  }

  if (blueprintCount < slotCount) {
    fallbacks.push(`blueprint_count_${blueprintCount}_below_template_slots_${slotCount}`);
  } else if (blueprintCount > slotCount) {
    fallbacks.push(`blueprint_count_${blueprintCount}_above_template_slots_${slotCount}`);
  }

  let slotsMatched = 0;
  const blueprints = collection.blueprints.map((blueprint, index) => {
    const slot = resolveSlotForBlueprintIndex(template, index, blueprintCount);
    const result = normalizeBlueprintWithSlot(blueprint, slot, template, gentle);

    if (result.matched) {
      slotsMatched += 1;
    } else if (!gentle) {
      fallbacks.push(`slot_${slot.slotId}_partial_match_at_index_${index}`);
    }

    return result.blueprint;
  });

  const stats = calculateBlueprintCollectionStats(blueprints);

  return {
    collection: {
      blueprints,
      ...stats,
      warnings: [...collection.warnings],
    },
    diagnostics: createDiagnostics(template, slotsMatched, fallbacks),
  };
}
