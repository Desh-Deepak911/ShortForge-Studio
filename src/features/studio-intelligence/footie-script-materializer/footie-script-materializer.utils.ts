import type { BlueprintMappedScene } from "../blueprint-adapter/blueprint-adapter.types";
import { splitNarrationIntoSentences } from "../studio-intelligence.utils";
import type {
  FootieScriptMaterializerInput,
  MaterializationDiagnostics,
  MaterializationWarning,
  MaterializationWarningSeverity,
} from "./footie-script-materializer.types";
import type { MotionBlueprintSuggestion } from "../scene-blueprint.types";
import type {
  FootieScene,
  SceneImageMotion,
  SceneImageMotionIntensity,
  SceneImageMotionType,
  SceneType,
} from "@/features/story/types";
import { normalizeSceneIds } from "@/features/story/utils";

/** Current FootieScript materializer contract version. */
export const FOOTIE_SCRIPT_MATERIALIZER_VERSION = "0.1.0";

export const DEFAULT_MAX_SUBTITLE_WORDS = 12;

const VALID_SCENE_TYPES = new Set<SceneType>([
  "intro",
  "context",
  "match",
  "transition",
  "ending",
]);

const SCENE_TYPES_WITHOUT_DEFERRED_MOTION = new Set<SceneType>(["transition"]);

export const EMPTY_MATERIALIZATION_DIAGNOSTICS: MaterializationDiagnostics = {
  materializationVersion: FOOTIE_SCRIPT_MATERIALIZER_VERSION,
  processedSceneCount: 0,
  skippedSceneCount: 0,
  totalDurationMs: 0,
  confidence: 1,
  fallbacksUsed: [],
  warningsByType: {},
};

export function clampMaterializerConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function createMaterializationWarning(
  code: string,
  message: string,
  severity: MaterializationWarningSeverity,
  mappedSceneId?: string,
  field?: string,
): MaterializationWarning {
  return {
    code,
    message,
    severity,
    ...(mappedSceneId ? { mappedSceneId } : {}),
    ...(field ? { field } : {}),
  };
}

export function countMaterializationWarningsByType(
  warnings: readonly MaterializationWarning[],
): Readonly<Partial<Record<string, number>>> {
  const counts: Partial<Record<string, number>> = {};

  for (const warning of warnings) {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1;
  }

  return counts;
}

export function cloneFootieScriptMaterializerInput(
  input: FootieScriptMaterializerInput,
): FootieScriptMaterializerInput {
  return {
    ...input,
    mappedScenes: input.mappedScenes.map((scene) => ({
      ...scene,
      sourceBeatIds: [...scene.sourceBeatIds],
      visualHints: { ...scene.visualHints },
      mediaHints: { ...scene.mediaHints },
      motionHints: { ...scene.motionHints },
      captionHints: {
        ...scene.captionHints,
        highlightWords: [...scene.captionHints.highlightWords],
      },
      timingMetadata: { ...scene.timingMetadata },
      narrationMetadata: {
        ...scene.narrationMetadata,
        sentenceRange: { ...scene.narrationMetadata.sentenceRange },
      },
      mappingDecisions: scene.mappingDecisions.map((decision) => ({ ...decision })),
      importance: { ...scene.importance },
    })),
    ...(input.adapterDiagnostics
      ? {
          adapterDiagnostics: {
            ...input.adapterDiagnostics,
            unmappedFields: [...input.adapterDiagnostics.unmappedFields],
            fallbacksUsed: [...input.adapterDiagnostics.fallbacksUsed],
            lowConfidenceSceneIds: [...input.adapterDiagnostics.lowConfidenceSceneIds],
            warningCountsByType: { ...input.adapterDiagnostics.warningCountsByType },
          },
        }
      : {}),
    ...(input.options ? { options: { ...input.options } } : {}),
  };
}

export function isValidFootieScriptMaterializerInput(
  input: FootieScriptMaterializerInput | null | undefined,
): input is FootieScriptMaterializerInput {
  if (input == null) {
    return false;
  }

  if (!Array.isArray(input.mappedScenes)) {
    return false;
  }

  if (typeof input.narration !== "string") {
    return false;
  }

  if (
    input.voiceoverDurationMs != null &&
    (!Number.isFinite(input.voiceoverDurationMs) || input.voiceoverDurationMs <= 0)
  ) {
    return false;
  }

  return true;
}

export function resolveProductionSceneType(
  mappedScene: BlueprintMappedScene,
  warnings: MaterializationWarning[],
  fallbacksUsed: string[],
): SceneType {
  const proposed = mappedScene.proposedSceneType;

  if (VALID_SCENE_TYPES.has(proposed as SceneType)) {
    return proposed as SceneType;
  }

  warnings.push(
    createMaterializationWarning(
      "UNSUPPORTED_SCENE_TYPE",
      `Proposed scene type "${proposed}" is unsupported; defaulting to "context".`,
      "warning",
      mappedScene.id,
      "proposedSceneType",
    ),
  );
  fallbacksUsed.push("sceneType.context");

  return "context";
}

function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function capSubtitleWords(text: string, maxWords: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  const words = normalized.split(" ");
  if (words.length <= maxWords) {
    return normalized;
  }

  return words.slice(0, maxWords).join(" ");
}

export function resolveFirstSentence(text: string): string {
  const sentences = splitNarrationIntoSentences(text);
  return sentences[0]?.trim() ?? text.trim();
}

export function resolveMaterializedSubtitle(
  mappedScene: BlueprintMappedScene,
  sceneIndex: number,
  maxSubtitleWords: number,
  warnings: MaterializationWarning[],
  fallbacksUsed: string[],
): string {
  const captionCandidate =
    mappedScene.captionText?.trim() ||
    mappedScene.captionHints.captionText?.trim() ||
    "";

  if (captionCandidate) {
    return capSubtitleWords(captionCandidate, maxSubtitleWords);
  }

  const titleCandidate = mappedScene.title?.trim();
  if (titleCandidate) {
    fallbacksUsed.push(`subtitle.title:${mappedScene.id}`);
    warnings.push(
      createMaterializationWarning(
        "MISSING_SUBTITLE",
        "Caption text missing; using mapped scene title for subtitle.",
        "warning",
        mappedScene.id,
        "subtitle",
      ),
    );
    return capSubtitleWords(titleCandidate, maxSubtitleWords);
  }

  const excerptCandidate = mappedScene.narrationExcerpt?.trim();
  if (excerptCandidate) {
    const firstSentence = resolveFirstSentence(excerptCandidate);
    fallbacksUsed.push(`subtitle.narrationExcerpt:${mappedScene.id}`);
    warnings.push(
      createMaterializationWarning(
        "MISSING_SUBTITLE",
        "Caption text missing; using first sentence of narration excerpt for subtitle.",
        "warning",
        mappedScene.id,
        "subtitle",
      ),
    );
    return capSubtitleWords(firstSentence, maxSubtitleWords);
  }

  fallbacksUsed.push(`subtitle.sceneNumber:${mappedScene.id}`);
  warnings.push(
    createMaterializationWarning(
      "MISSING_SUBTITLE_FALLBACK",
      "Caption and title missing; using generic scene label for subtitle.",
      "warning",
      mappedScene.id,
      "subtitle",
    ),
  );

  return capSubtitleWords(`Scene ${sceneIndex + 1}`, maxSubtitleWords);
}

export function resolveMaterializedNarration(
  mappedScene: BlueprintMappedScene,
  warnings: MaterializationWarning[],
): string {
  const excerpt = mappedScene.narrationExcerpt?.trim() ?? "";

  if (!excerpt) {
    warnings.push(
      createMaterializationWarning(
        "MISSING_NARRATION",
        "Mapped scene narration excerpt is empty.",
        "warning",
        mappedScene.id,
        "narrationExcerpt",
      ),
    );
  }

  return excerpt;
}

export function resolveDurationWeightMs(
  mappedScene: BlueprintMappedScene,
  warnings: MaterializationWarning[],
  fallbacksUsed: string[],
): number {
  const durationMs = mappedScene.durationMs;

  if (durationMs == null || !Number.isFinite(durationMs)) {
    warnings.push(
      createMaterializationWarning(
        "MISSING_DURATION",
        "Mapped scene durationMs is missing; using 1000ms weight.",
        "warning",
        mappedScene.id,
        "durationMs",
      ),
    );
    fallbacksUsed.push(`duration.default:${mappedScene.id}`);
    return 1000;
  }

  if (durationMs <= 0) {
    warnings.push(
      createMaterializationWarning(
        "INVALID_DURATION",
        `Mapped scene durationMs ${durationMs} is invalid; using 1000ms weight.`,
        "warning",
        mappedScene.id,
        "durationMs",
      ),
    );
    fallbacksUsed.push(`duration.invalid:${mappedScene.id}`);
    return 1000;
  }

  return Math.round(durationMs);
}

function mapMotionIntensity(intensity: string): SceneImageMotionIntensity {
  if (intensity === "high") {
    return "strong";
  }

  if (intensity === "medium") {
    return "medium";
  }

  return "subtle";
}

export function mapBlueprintMotionToDeferredImageMotion(
  suggestedMotion: MotionBlueprintSuggestion,
  intensity: string,
): SceneImageMotion {
  const motionIntensity = mapMotionIntensity(intensity);

  const typeBySuggestion: Record<MotionBlueprintSuggestion, SceneImageMotionType> = {
    static: "none",
    ken_burns: "slow-zoom-in",
    zoom_in: "slow-zoom-in",
    push_in: "slow-zoom-in",
    zoom_out: "slow-zoom-out",
    pan_left: "pan-left",
    pan_right: "pan-right",
  };

  return {
    type: typeBySuggestion[suggestedMotion] ?? "none",
    intensity: motionIntensity,
  };
}

export function resolveDeferredImageMotion(
  mappedScene: BlueprintMappedScene,
  sceneType: SceneType,
): SceneImageMotion | undefined {
  if (SCENE_TYPES_WITHOUT_DEFERRED_MOTION.has(sceneType)) {
    return undefined;
  }

  const { suggestedMotion, intensity } = mappedScene.motionHints;
  if (suggestedMotion === "static" && intensity === "low") {
    return undefined;
  }

  return mapBlueprintMotionToDeferredImageMotion(suggestedMotion, intensity);
}

export function validateMappedSceneLineage(
  mappedScene: BlueprintMappedScene,
  warnings: MaterializationWarning[],
): void {
  if (!mappedScene.sourceBlueprintId?.trim()) {
    warnings.push(
      createMaterializationWarning(
        "MISSING_LINEAGE",
        "Mapped scene is missing sourceBlueprintId.",
        "warning",
        mappedScene.id,
        "sourceBlueprintId",
      ),
    );
  }

  if (!mappedScene.sourceBeatIds.length) {
    warnings.push(
      createMaterializationWarning(
        "MISSING_LINEAGE",
        "Mapped scene has empty sourceBeatIds.",
        "warning",
        mappedScene.id,
        "sourceBeatIds",
      ),
    );
  }
}

export function buildMaterializationDiagnostics(
  scenes: readonly { scene: { durationMs?: number }; lineage: { materializerConfidence: number } }[],
  skippedSceneCount: number,
  warnings: readonly MaterializationWarning[],
  fallbacksUsed: readonly string[],
): MaterializationDiagnostics {
  const totalDurationMs = scenes.reduce(
    (total, draft) => total + (draft.scene.durationMs ?? 0),
    0,
  );

  const confidence =
    scenes.length === 0
      ? 1
      : clampMaterializerConfidence(
          scenes.reduce((sum, draft) => sum + draft.lineage.materializerConfidence, 0) / scenes.length,
        );

  return {
    materializationVersion: FOOTIE_SCRIPT_MATERIALIZER_VERSION,
    processedSceneCount: scenes.length,
    skippedSceneCount,
    totalDurationMs,
    confidence,
    fallbacksUsed: [...fallbacksUsed],
    warningsByType: countMaterializationWarningsByType(warnings),
  };
}

export function materializerInputsEqual(
  left: FootieScriptMaterializerInput,
  right: FootieScriptMaterializerInput,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function subtitlesWithinWordCap(subtitle: string, maxWords: number): boolean {
  return countWords(subtitle) <= maxWords;
}

/** Regenerates production-safe scene ids while preserving scene field content. */
export function regenerateProductionSceneIds(scenes: FootieScene[]): FootieScene[] {
  return normalizeSceneIds(scenes);
}
