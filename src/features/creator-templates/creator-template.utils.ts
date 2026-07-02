import { createDefaultAudioMixerSettings } from "@/features/audio-mixer/audio-mixer.defaults";
import type { ProjectAudioMixerSettings } from "@/features/audio-mixer/audio-mixer.types";
import { resolveCaptionPreset } from "@/features/caption-engine/caption-engine.utils";
import { resolveSpeechStylePreset } from "@/features/speech-style/speech-style.utils";
import {
  DEFAULT_SCENE_COUNT,
  DEFAULT_SCRIPT_MODE,
  resolveSceneCount,
  resolveScriptMode,
} from "@/types/footiebitz";
import { resolveVoiceoverVoice } from "@/lib/utils/voiceoverOptions";

import {
  getCreatorTemplateFromRegistry,
  getCreatorTemplateRegistry,
} from "./creator-template.registry";
import type {
  CreatorTemplate,
  CreatorTemplateCategory,
  CreatorTemplateId,
  CreatorTemplatePromptHints,
  ResolvedCreatorTemplateDefaults,
} from "./creator-template.types";

export const DEFAULT_TARGET_DURATION_SEC = 30;

const BRIEF_DURATION_OPTIONS = [30, 45, 60] as const;

function cloneCreatorTemplate(template: CreatorTemplate): CreatorTemplate {
  return structuredClone(template);
}

function resolveTargetDurationSec(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TARGET_DURATION_SEC;
  }

  const rounded = Math.round(parsed);
  if (BRIEF_DURATION_OPTIONS.includes(rounded as (typeof BRIEF_DURATION_OPTIONS)[number])) {
    return rounded;
  }

  return Math.max(15, Math.min(120, rounded));
}

function mergeTemplateAudioMixer(
  partial: ProjectAudioMixerSettings | undefined,
): ProjectAudioMixerSettings | undefined {
  if (!partial) {
    return undefined;
  }

  const defaults = createDefaultAudioMixerSettings();
  return {
    voice: { ...defaults.voice, ...partial.voice },
    music: { ...defaults.music, ...partial.music },
    master: { ...defaults.master, ...partial.master },
  };
}

/** Returns a built-in template for a known id, otherwise null. */
export function getCreatorTemplate(id: unknown): CreatorTemplate | null {
  if (typeof id !== "string") {
    return null;
  }

  const template = getCreatorTemplateFromRegistry(id);
  return template ? cloneCreatorTemplate(template) : null;
}

/** Returns shallow copies of all built-in templates in registry order. */
export function getCreatorTemplates(): CreatorTemplate[] {
  return getCreatorTemplateRegistry().map((template) => cloneCreatorTemplate(template));
}

/** Returns templates matching a category in registry order. */
export function getCreatorTemplatesByCategory(
  category: CreatorTemplateCategory,
): CreatorTemplate[] {
  return getCreatorTemplates().filter((template) => template.category === category);
}

/** Normalizes template defaults with safe fallbacks for unknown or partial input. */
export function resolveCreatorTemplateDefaults(
  template: CreatorTemplate | null | undefined,
): ResolvedCreatorTemplateDefaults {
  const defaults = template?.defaults;

  const resolved: ResolvedCreatorTemplateDefaults = {
    scriptMode: resolveScriptMode(defaults?.scriptMode ?? DEFAULT_SCRIPT_MODE),
    sceneCount: resolveSceneCount(defaults?.sceneCount ?? DEFAULT_SCENE_COUNT),
    targetDurationSec: resolveTargetDurationSec(defaults?.targetDurationSec),
  };

  if (defaults?.voiceId) {
    resolved.voiceId = resolveVoiceoverVoice(defaults.voiceId);
  }

  if (defaults?.speechStylePreset) {
    resolved.speechStylePreset = resolveSpeechStylePreset(defaults.speechStylePreset);
  }

  if (defaults?.captionPreset) {
    resolved.captionPreset = resolveCaptionPreset(defaults.captionPreset);
  }

  const audioMixer = mergeTemplateAudioMixer(defaults?.audioMixer);
  if (audioMixer) {
    resolved.audioMixer = audioMixer;
  }

  return resolved;
}

/** Builds a compact prompt-hints block for future Prompt Intelligence wiring. */
export function buildTemplatePromptHints(
  template: CreatorTemplate | null | undefined,
): CreatorTemplatePromptHints | null {
  if (!template?.promptHints) {
    return null;
  }

  const hints = template.promptHints;
  return {
    tone: hints.tone.trim(),
    structure: hints.structure.trim(),
    openingStyle: hints.openingStyle.trim(),
    pacing: hints.pacing.trim(),
    ctaStyle: hints.ctaStyle.trim(),
    ...(hints.avoid?.trim() ? { avoid: hints.avoid.trim() } : {}),
  };
}

/** Serializes prompt hints into a single text block for downstream prompt assembly. */
export function formatTemplatePromptHints(
  template: CreatorTemplate | null | undefined,
): string {
  const hints = buildTemplatePromptHints(template);
  if (!hints) {
    return "";
  }

  const lines = [
    `Tone: ${hints.tone}`,
    `Structure: ${hints.structure}`,
    `Opening: ${hints.openingStyle}`,
    `Pacing: ${hints.pacing}`,
    `CTA: ${hints.ctaStyle}`,
  ];

  if (hints.avoid) {
    lines.push(`Avoid: ${hints.avoid}`);
  }

  return lines.join("\n");
}

/** Type guard for known built-in template ids. */
export function isCreatorTemplateId(value: unknown): value is CreatorTemplateId {
  return getCreatorTemplate(value) !== null;
}
