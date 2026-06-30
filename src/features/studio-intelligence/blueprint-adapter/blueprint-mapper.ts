import type { SceneBlueprint, SceneBlueprintKind } from "../scene-blueprint.types";
import {
  STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
  STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS,
} from "../studio-intelligence.constants";
import { clampSceneDurationMs, normalizeNarrationText } from "../studio-intelligence.utils";
import type {
  BlueprintAdapterInput,
  BlueprintAdapterResult,
  BlueprintAdapterWarning,
  BlueprintMappedScene,
  BlueprintSceneCaptionHints,
  BlueprintSceneMediaHints,
  BlueprintSceneMotionHints,
  BlueprintSceneTimingMetadata,
  BlueprintSceneVisualHints,
  SceneMappingDecision,
} from "./blueprint-adapter.types";
import {
  aggregateAdapterStatistics,
  buildAdapterDiagnostics,
  clampAdapterConfidence,
  createBlueprintAdapterWarning,
  deriveMappedSceneId,
  isValidBlueprintAdapterInput,
  LOW_CONFIDENCE_THRESHOLD,
} from "./blueprint-adapter.utils";
import {
  createPlaceholderNarrationMetadata,
  enrichMappedScenesWithNarration,
} from "./blueprint-adapter-enrichment.utils";

const SUPPORTED_BLUEPRINT_KINDS = new Set<SceneBlueprintKind>([
  "hook_opener",
  "player_spotlight",
  "stat_moment",
  "match_highlight",
  "debate_split",
  "ranked_reveal",
  "text_card",
  "archive_broll",
  "comparison",
  "closing_moment",
  "cta_card",
  "neutral_broll",
]);

const ROLE_TO_SCENE_TYPE = {
  intro: "intro",
  context: "context",
  evidence: "context",
  conflict: "context",
  climax: "match",
  payoff: "ending",
  transition: "transition",
  ending: "ending",
  cta: "ending",
} as const satisfies Record<SceneBlueprint["role"], BlueprintMappedScene["proposedSceneType"]>;

const KIND_TO_SCENE_TYPE = {
  hook_opener: "intro",
  player_spotlight: "context",
  stat_moment: "context",
  match_highlight: "match",
  debate_split: "context",
  ranked_reveal: "context",
  text_card: "context",
  archive_broll: "context",
  comparison: "context",
  closing_moment: "ending",
  cta_card: "ending",
  neutral_broll: "context",
} as const satisfies Record<SceneBlueprintKind, BlueprintMappedScene["proposedSceneType"]>;

interface BlueprintMapperContext {
  warnings: BlueprintAdapterWarning[];
  unmappedFields: string[];
  fallbacksUsed: string[];
}

function createMappingDecision(
  blueprintId: string,
  field: string,
  sourceValue: string,
  mappedValue: string,
  method: SceneMappingDecision["method"],
  confidence: number,
  reason?: string,
): SceneMappingDecision {
  return {
    blueprintId,
    field,
    sourceValue,
    mappedValue,
    method,
    confidence: clampAdapterConfidence(confidence),
    reason,
  };
}

function recordFallback(
  context: BlueprintMapperContext,
  fallbackKey: string,
  blueprintId: string,
  field: string,
  message: string,
): void {
  if (!context.fallbacksUsed.includes(fallbackKey)) {
    context.fallbacksUsed.push(fallbackKey);
  }

  context.warnings.push(
    createBlueprintAdapterWarning("MAPPING_FALLBACK", message, "info", blueprintId, field),
  );
}

function recordUnmappedField(context: BlueprintMapperContext | undefined, field: string): void {
  if (!context) {
    return;
  }

  if (!context.unmappedFields.includes(field)) {
    context.unmappedFields.push(field);
  }
}

/** Maps a blueprint narrative role to an intermediate scene plan role. */
export function mapBlueprintRoleToSceneRole(blueprint: SceneBlueprint): BlueprintMappedScene["proposedSceneType"] {
  return ROLE_TO_SCENE_TYPE[blueprint.role];
}

/** Maps a blueprint kind to an intermediate scene plan type. */
export function mapBlueprintKindToSceneType(blueprint: SceneBlueprint): BlueprintMappedScene["proposedSceneType"] {
  return KIND_TO_SCENE_TYPE[blueprint.kind];
}

/** Resolves proposed scene type — kind mapping takes precedence over role mapping. */
function resolveProposedSceneType(blueprint: SceneBlueprint): BlueprintMappedScene["proposedSceneType"] {
  const fromKind = mapBlueprintKindToSceneType(blueprint);
  const fromRole = mapBlueprintRoleToSceneRole(blueprint);

  if (fromKind !== fromRole && blueprint.kind !== "neutral_broll") {
    return fromKind;
  }

  return fromRole;
}

/** Maps blueprint timing to clamped scene duration and preserved metadata. */
export function mapBlueprintTimingToSceneDuration(
  blueprint: SceneBlueprint,
  context?: BlueprintMapperContext,
): { durationMs: number; timingMetadata: BlueprintSceneTimingMetadata } {
  const timing = blueprint.timing;
  const suggestedDurationMs = timing?.suggestedDurationMs;
  const minDurationMs = timing?.minDurationMs ?? STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS;
  const maxDurationMs = timing?.maxDurationMs ?? STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS;
  const pacing = timing?.pacing ?? "normal";

  if (suggestedDurationMs == null || !Number.isFinite(suggestedDurationMs) || suggestedDurationMs <= 0) {
    if (context) {
      context.warnings.push(
        createBlueprintAdapterWarning(
          "MISSING_TIMING",
          "Blueprint timing.suggestedDurationMs missing; using minimum scene duration.",
          "warning",
          blueprint.id,
          "timing.suggestedDurationMs",
        ),
      );
      context.fallbacksUsed.push("timing.default_min_duration");
      recordUnmappedField(context, "timing.suggestedDurationMs");
    }
  }

  const rawDuration = suggestedDurationMs ?? STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS;
  const durationMs = clampSceneDurationMs(rawDuration);

  if (durationMs !== rawDuration && context) {
    context.warnings.push(
      createBlueprintAdapterWarning(
        "DURATION_OUT_OF_BOUNDS",
        `Duration clamped from ${rawDuration}ms to ${durationMs}ms.`,
        "warning",
        blueprint.id,
        "timing.suggestedDurationMs",
      ),
    );
    recordFallback(
      context,
      "timing.clamp_bounds",
      blueprint.id,
      "timing.suggestedDurationMs",
      `Duration clamped from ${rawDuration}ms to ${durationMs}ms.`,
    );
  }

  return {
    durationMs,
    timingMetadata: {
      suggestedDurationMs: rawDuration,
      minDurationMs,
      maxDurationMs,
      pacing,
    },
  };
}

/** Maps blueprint visual sub-contract to scene visual hints. */
export function mapBlueprintVisualToSceneHints(
  blueprint: SceneBlueprint,
  context?: BlueprintMapperContext,
): BlueprintSceneVisualHints {
  const visual = blueprint.visual;

  if (!visual?.visualIntentType) {
    if (context) {
      context.warnings.push(
        createBlueprintAdapterWarning(
          "MISSING_VISUAL",
          "Blueprint visual intent missing; using neutral_broll fallback.",
          "warning",
          blueprint.id,
          "visual.visualIntentType",
        ),
      );
      context.fallbacksUsed.push("visual.neutral_broll");
      recordUnmappedField(context, "visual.visualIntentType");
    }
  }

  return {
    visualIntentType: visual?.visualIntentType ?? "neutral_broll",
    composition: visual?.composition,
    subject: visual?.subject,
    emotion: visual?.emotion ?? blueprint.visual?.emotion,
    textOverlaySuggestion: visual?.textOverlaySuggestion,
  };
}

/** Maps blueprint asset sub-contract to media hints. */
export function mapBlueprintAssetToMediaHints(
  blueprint: SceneBlueprint,
  context?: BlueprintMapperContext,
): BlueprintSceneMediaHints {
  const asset = blueprint.asset;
  const searchQuery = asset?.searchQuery?.trim();

  if (!searchQuery) {
    if (context) {
      context.warnings.push(
        createBlueprintAdapterWarning(
          "MISSING_ASSET_QUERY",
          "Blueprint asset search query missing; media search may require fallback.",
          "warning",
          blueprint.id,
          "asset.searchQuery",
        ),
      );
      recordUnmappedField(context, "asset.searchQuery");
    }
  }

  return {
    assetRequirementType: asset?.assetRequirementType ?? "placeholder",
    searchQuery: searchQuery || undefined,
    fallbackQuery: asset?.fallbackQuery?.trim() || undefined,
    preferredOrientation: asset?.preferredOrientation ?? "landscape",
    imageCount: asset?.imageCount ?? 1,
  };
}

/** Maps blueprint motion sub-contract to motion hints. */
export function mapBlueprintMotionToMotionPreset(
  blueprint: SceneBlueprint,
): BlueprintSceneMotionHints {
  return {
    suggestedMotion: blueprint.motion?.suggestedMotion ?? "static",
    intensity: blueprint.motion?.intensity ?? "low",
  };
}

/** Maps blueprint caption sub-contract to caption hints. */
export function mapBlueprintCaptionToCaptionHints(blueprint: SceneBlueprint): BlueprintSceneCaptionHints {
  const caption = blueprint.caption;
  const highlightWords = caption?.highlightWords ?? [];
  const captionText =
    highlightWords.length > 0
      ? highlightWords.join(" ")
      : blueprint.visual?.textOverlaySuggestion ?? blueprint.summary;

  return {
    emphasis: caption?.emphasis ?? "none",
    highlightWords: [...highlightWords],
    captionStyleHint: caption?.captionStyleHint ?? "default",
    captionText,
  };
}

function combineMappingConfidence(blueprint: SceneBlueprint, context: BlueprintMapperContext): number {
  const factors = [blueprint.confidence];

  if (blueprint.timing?.suggestedDurationMs > 0) {
    factors.push(0.95);
  } else {
    factors.push(0.5);
  }

  if (blueprint.visual?.visualIntentType) {
    factors.push(0.95);
  } else {
    factors.push(0.55);
  }

  if (blueprint.asset?.searchQuery?.trim()) {
    factors.push(0.9);
  } else {
    factors.push(0.6);
  }

  if (blueprint.motion?.suggestedMotion) {
    factors.push(0.92);
  }

  if (blueprint.caption?.captionStyleHint) {
    factors.push(0.9);
  }

  const average = factors.reduce((total, value) => total + value, 0) / factors.length;
  const combined = clampAdapterConfidence(average);

  if (combined < LOW_CONFIDENCE_THRESHOLD) {
    context.warnings.push(
      createBlueprintAdapterWarning(
        "LOW_CONFIDENCE",
        `Combined mapping confidence ${combined.toFixed(2)} is below threshold ${LOW_CONFIDENCE_THRESHOLD}.`,
        "warning",
        blueprint.id,
        "confidence",
      ),
    );
  }

  return combined;
}

function collectBlueprintWarnings(blueprint: SceneBlueprint, context: BlueprintMapperContext): void {
  if (!SUPPORTED_BLUEPRINT_KINDS.has(blueprint.kind)) {
    context.warnings.push(
      createBlueprintAdapterWarning(
        "UNSUPPORTED_BLUEPRINT_KIND",
        `Blueprint kind "${blueprint.kind}" is not recognized by the mapper.`,
        "warning",
        blueprint.id,
        "kind",
      ),
    );
  }
}

/** Maps a single scene blueprint to a BlueprintMappedScene. */
export function mapBlueprintToScene(
  blueprint: SceneBlueprint,
  input?: BlueprintAdapterInput,
  order = 0,
): BlueprintMappedScene {
  const context: BlueprintMapperContext = {
    warnings: [],
    unmappedFields: [],
    fallbacksUsed: [],
  };

  return buildMappedScene(blueprint, input, order, context);
}

function buildMappedScene(
  blueprint: SceneBlueprint,
  input: BlueprintAdapterInput | undefined,
  order: number,
  context: BlueprintMapperContext,
): BlueprintMappedScene {
  void input;

  collectBlueprintWarnings(blueprint, context);

  const proposedSceneType = resolveProposedSceneType(blueprint);
  const { durationMs, timingMetadata } = mapBlueprintTimingToSceneDuration(blueprint, context);
  const visualHints = mapBlueprintVisualToSceneHints(blueprint, context);
  const mediaHints = mapBlueprintAssetToMediaHints(blueprint, context);
  const motionHints = mapBlueprintMotionToMotionPreset(blueprint);
  const captionHints = mapBlueprintCaptionToCaptionHints(blueprint);
  const confidence = combineMappingConfidence(blueprint, context);

  const mappingDecisions: SceneMappingDecision[] = [
    createMappingDecision(
      blueprint.id,
      "id",
      blueprint.id,
      deriveMappedSceneId(blueprint.id),
      "direct",
      1,
      "Mapped scene id derived from blueprint id.",
    ),
    createMappingDecision(
      blueprint.id,
      "role",
      blueprint.role,
      proposedSceneType,
      mapBlueprintKindToSceneType(blueprint) !== mapBlueprintRoleToSceneRole(blueprint) ? "fallback" : "direct",
      0.95,
      "Kind mapping takes precedence when it differs from role mapping.",
    ),
    createMappingDecision(
      blueprint.id,
      "timing.suggestedDurationMs",
      String(blueprint.timing?.suggestedDurationMs ?? ""),
      String(durationMs),
      blueprint.timing?.suggestedDurationMs ? "direct" : "fallback",
      blueprint.timing?.suggestedDurationMs ? 0.95 : 0.5,
    ),
    createMappingDecision(
      blueprint.id,
      "visual.visualIntentType",
      blueprint.visual?.visualIntentType ?? "",
      visualHints.visualIntentType,
      blueprint.visual?.visualIntentType ? "direct" : "fallback",
      blueprint.visual?.visualIntentType ? 0.95 : 0.55,
    ),
    createMappingDecision(
      blueprint.id,
      "motion.suggestedMotion",
      blueprint.motion?.suggestedMotion ?? "",
      motionHints.suggestedMotion,
      blueprint.motion?.suggestedMotion ? "direct" : "default",
      blueprint.motion?.suggestedMotion ? 0.92 : 0.7,
    ),
    createMappingDecision(
      blueprint.id,
      "arcId",
      blueprint.arcId ?? "",
      blueprint.arcId ?? "",
      blueprint.arcId ? "direct" : "omitted",
      blueprint.arcId ? 1 : 0.5,
    ),
    createMappingDecision(
      blueprint.id,
      "beatIds",
      blueprint.beatIds.join(","),
      blueprint.beatIds.join(","),
      blueprint.beatIds.length > 0 ? "direct" : "omitted",
      blueprint.beatIds.length > 0 ? 0.95 : 0.5,
    ),
  ];

  return {
    id: deriveMappedSceneId(blueprint.id),
    order,
    sourceBlueprintId: blueprint.id,
    sourceArcId: blueprint.arcId,
    sourceBeatIds: [...blueprint.beatIds],
    blueprintRole: blueprint.role,
    blueprintKind: blueprint.kind,
    proposedSceneType,
    title: blueprint.title,
    narrationExcerpt: blueprint.summary,
    durationMs,
    importance: { ...blueprint.importance },
    visualIntentType: visualHints.visualIntentType,
    motionSuggestion: motionHints.suggestedMotion,
    captionText: captionHints.captionText,
    assetSearchQuery: mediaHints.searchQuery,
    fallbackAssetQuery: mediaHints.fallbackQuery,
    visualHints,
    mediaHints,
    motionHints,
    captionHints,
    timingMetadata,
    narrationMetadata: createPlaceholderNarrationMetadata(blueprint),
    confidence,
    mappingDecisions,
  };
}

/** Maps a blueprint collection into BlueprintAdapterResult. */
export function mapBlueprintsToScenes(input: BlueprintAdapterInput): BlueprintAdapterResult {
  if (!isValidBlueprintAdapterInput(input)) {
    const invalidWarnings = [
      createBlueprintAdapterWarning(
        "INVALID_ADAPTER_INPUT",
        "Blueprint adapter input is invalid or missing a blueprint collection.",
        "error",
      ),
    ];

    return {
      mappedScenes: [],
      warnings: invalidWarnings,
      diagnostics: buildAdapterDiagnostics({
        unmappedFields: [],
        fallbacksUsed: [],
        processedBlueprintCount: 0,
        skippedBlueprintCount: 0,
        mappedScenes: [],
        warnings: invalidWarnings,
        narrationSlicingStrategy: "none",
      }),
      statistics: aggregateAdapterStatistics([]),
      success: false,
    };
  }

  const blueprints = input.collection.blueprints;

  if (blueprints.length === 0) {
    const emptyWarnings = [
      createBlueprintAdapterWarning(
        "EMPTY_BLUEPRINT_COLLECTION",
        "No scene blueprints provided; mapping skipped.",
        "warning",
      ),
    ];

    return {
      mappedScenes: [],
      warnings: emptyWarnings,
      diagnostics: buildAdapterDiagnostics({
        unmappedFields: [],
        fallbacksUsed: [],
        processedBlueprintCount: 0,
        skippedBlueprintCount: 0,
        mappedScenes: [],
        warnings: emptyWarnings,
        narrationSlicingStrategy: "none",
      }),
      statistics: aggregateAdapterStatistics([]),
      success: false,
    };
  }

  const warnings: BlueprintAdapterWarning[] = [];
  const unmappedFields: string[] = [];
  const fallbacksUsed: string[] = [];
  let mappedScenes: BlueprintMappedScene[] = [];
  let skippedBlueprintCount = 0;

  if (!normalizeNarrationText(input.normalizedNarration)) {
    warnings.push(
      createBlueprintAdapterWarning(
        "MISSING_NARRATION",
        "Normalized narration missing; narration slicing will use blueprint summaries or fallbacks.",
        "warning",
      ),
    );
  }

  for (const [index, blueprint] of blueprints.entries()) {
    if (!blueprint?.id) {
      skippedBlueprintCount += 1;
      warnings.push(
        createBlueprintAdapterWarning(
          "SKIPPED_BLUEPRINT",
          "Blueprint missing id; skipped during mapping.",
          "warning",
        ),
      );
      continue;
    }

    const context: BlueprintMapperContext = {
      warnings: [],
      unmappedFields: [],
      fallbacksUsed: [],
    };

    const mappedScene = buildMappedScene(blueprint, input, index, context);

    warnings.push(...context.warnings);
    for (const field of context.unmappedFields) {
      if (!unmappedFields.includes(field)) {
        unmappedFields.push(field);
      }
    }
    for (const fallback of context.fallbacksUsed) {
      if (!fallbacksUsed.includes(fallback)) {
        fallbacksUsed.push(fallback);
      }
    }

    mappedScenes.push(mappedScene);
  }

  const narrationContext = {
    warnings: [] as BlueprintAdapterWarning[],
    fallbacksUsed: [] as string[],
  };
  mappedScenes = enrichMappedScenesWithNarration(mappedScenes, blueprints, input, narrationContext);
  warnings.push(...narrationContext.warnings);
  for (const fallback of narrationContext.fallbacksUsed) {
    if (!fallbacksUsed.includes(fallback)) {
      fallbacksUsed.push(fallback);
    }
  }

  const statistics = aggregateAdapterStatistics(mappedScenes);
  const hasErrors = warnings.some((warning) => warning.severity === "error");

  return {
    mappedScenes,
    warnings,
    diagnostics: buildAdapterDiagnostics({
      unmappedFields,
      fallbacksUsed,
      processedBlueprintCount: blueprints.length,
      skippedBlueprintCount,
      mappedScenes,
      warnings,
    }),
    statistics,
    success: mappedScenes.length > 0 && !hasErrors && skippedBlueprintCount === 0,
  };
}

/** Collects per-blueprint warnings during batch mapping (exported for tests). */
export function collectBlueprintMapperWarnings(
  blueprint: SceneBlueprint,
): BlueprintAdapterWarning[] {
  const context: BlueprintMapperContext = {
    warnings: [],
    unmappedFields: [],
    fallbacksUsed: [],
  };

  collectBlueprintWarnings(blueprint, context);
  mapBlueprintTimingToSceneDuration(blueprint, context);
  mapBlueprintVisualToSceneHints(blueprint, context);
  mapBlueprintAssetToMediaHints(blueprint, context);
  combineMappingConfidence(blueprint, context);

  return context.warnings;
}
