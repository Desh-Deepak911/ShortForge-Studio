import type { StoryCreationBrief } from "@/features/drafts/types";

import {
  buildTemplatePromptHints,
  resolveCreatorTemplateDefaults,
} from "./creator-template.utils";
import type { CreatorTemplate } from "./creator-template.types";

const TEMPLATE_BRIEF_FIELDS = [
  "templateId",
  "templatePromptHints",
  "voiceId",
  "speechStylePreset",
  "captionPreset",
  "audioMixer",
] as const;

function omitTemplateBriefFields(brief: StoryCreationBrief): StoryCreationBrief {
  const next = { ...brief };
  for (const field of TEMPLATE_BRIEF_FIELDS) {
    delete next[field];
  }
  return next;
}

/** Applies template defaults onto a create brief — call only when the user selects a template. */
export function applyCreatorTemplateToBrief(
  brief: StoryCreationBrief,
  template: CreatorTemplate | null | undefined,
): StoryCreationBrief {
  if (!template) {
    return brief;
  }

  const defaults = resolveCreatorTemplateDefaults(template);
  const templatePromptHints = buildTemplatePromptHints(template) ?? undefined;

  const next: StoryCreationBrief = {
    ...omitTemplateBriefFields(brief),
    scriptMode: defaults.scriptMode,
    sceneCount: defaults.sceneCount,
    duration: defaults.targetDurationSec,
    templateId: template.id,
    ...(templatePromptHints ? { templatePromptHints } : {}),
  };

  if (defaults.voiceId) {
    next.voiceId = defaults.voiceId;
  }

  if (defaults.speechStylePreset) {
    next.speechStylePreset = defaults.speechStylePreset;
  }

  if (defaults.captionPreset) {
    next.captionPreset = defaults.captionPreset;
  }

  if (defaults.audioMixer) {
    next.audioMixer = defaults.audioMixer;
  }

  return next;
}

/** Removes template metadata from a brief without changing other user-edited fields. */
export function clearCreatorTemplateFromBrief(brief: StoryCreationBrief): StoryCreationBrief {
  return omitTemplateBriefFields(brief);
}

/** Merges current form values with persisted template metadata for draft/API payloads. */
export function mergeCreationBriefWithTemplateSelection(
  brief: StoryCreationBrief,
  template: CreatorTemplate | null | undefined,
): StoryCreationBrief {
  if (!template) {
    return clearCreatorTemplateFromBrief(brief);
  }

  const templatePromptHints = buildTemplatePromptHints(template) ?? undefined;
  const defaults = resolveCreatorTemplateDefaults(template);

  return {
    ...brief,
    templateId: template.id,
    ...(templatePromptHints ? { templatePromptHints } : {}),
    ...(defaults.voiceId ? { voiceId: defaults.voiceId } : {}),
    ...(defaults.speechStylePreset ? { speechStylePreset: defaults.speechStylePreset } : {}),
    ...(defaults.captionPreset ? { captionPreset: defaults.captionPreset } : {}),
    ...(defaults.audioMixer ? { audioMixer: defaults.audioMixer } : {}),
  };
}
