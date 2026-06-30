import {
  NARRATIVE_ARC_SCENE_COUNT_RANGES,
  NARRATIVE_ARC_TYPE_LABELS,
} from "./studio-intelligence.constants";
import type { NarrativeArc, NarrativeArcType, NarrativeBeat, NarrativeBeatType } from "./studio-intelligence.types";
import type { StoryStrategy } from "./story-strategy/story-strategy.types";
import { resolvePlannerStrategy } from "./story-strategy/planner-strategy.utils";
import type { PlannerStrategyDiagnostics } from "./story-strategy/strategy-planning-diagnostics.utils";
import {
  isDefaultStoryStrategy,
  recordStrategyDecision,
  recordStrategyFallback,
  recordStrategyInfluence,
} from "./story-strategy/strategy-planning-diagnostics.utils";

const OPENING_BEAT_TYPES = new Set<NarrativeBeatType>([
  "hook",
  "setup",
  "context",
  "question",
  "stakes",
]);

const DEVELOPMENT_BEAT_TYPES = new Set<NarrativeBeatType>([
  "evidence",
  "context",
  "turning_point",
  "transition",
  "setup",
]);

const CONFLICT_BEAT_TYPES = new Set<NarrativeBeatType>([
  "conflict",
  "counterpoint",
  "reveal",
  "evidence",
]);

const CLIMAX_BEAT_TYPES = new Set<NarrativeBeatType>([
  "climax",
  "hero_moment",
  "turning_point",
  "reveal",
]);

const RESOLUTION_BEAT_TYPES = new Set<NarrativeBeatType>([
  "payoff",
  "takeaway",
  "conclusion",
]);

const ENDING_BEAT_TYPES = new Set<NarrativeBeatType>([
  "payoff",
  "conclusion",
  "cta",
  "takeaway",
]);

function sortBeats(beats: NarrativeBeat[]): NarrativeBeat[] {
  return [...beats].sort((left, right) => left.order - right.order);
}

function isOpeningBeat(beat: NarrativeBeat, index: number, total: number): boolean {
  if (OPENING_BEAT_TYPES.has(beat.type)) {
    return index === 0 || beat.type !== "context" || index < Math.ceil(total * 0.4);
  }

  return false;
}

function isDevelopmentBeat(beat: NarrativeBeat, index: number, total: number): boolean {
  if (DEVELOPMENT_BEAT_TYPES.has(beat.type)) {
    if (beat.type === "context") {
      return index > 0 && index < Math.ceil(total * 0.75);
    }

    if (beat.type === "setup") {
      return index > 0;
    }

    return !ENDING_BEAT_TYPES.has(beat.type) && !CONFLICT_BEAT_TYPES.has(beat.type);
  }

  return false;
}

function isConflictBeat(beat: NarrativeBeat): boolean {
  return beat.type === "conflict" || beat.type === "counterpoint" || beat.type === "reveal";
}

function isConflictEvidenceBeat(beat: NarrativeBeat): boolean {
  return beat.type === "evidence";
}

function isClimaxBeat(beat: NarrativeBeat, index: number, total: number): boolean {
  if (CLIMAX_BEAT_TYPES.has(beat.type)) {
    return index >= Math.floor(total * 0.55);
  }

  return beat.type === "climax" || beat.type === "hero_moment";
}

function isEndingBeat(beat: NarrativeBeat, index: number, total: number): boolean {
  if (ENDING_BEAT_TYPES.has(beat.type)) {
    return true;
  }

  return index >= total - 1 && RESOLUTION_BEAT_TYPES.has(beat.type);
}

function isResolutionBeat(beat: NarrativeBeat, index: number, total: number): boolean {
  return (
    RESOLUTION_BEAT_TYPES.has(beat.type) &&
    !ENDING_BEAT_TYPES.has(beat.type) &&
    index >= Math.floor(total * 0.65) &&
    index < total - 1
  );
}

function peekBeat(beats: NarrativeBeat[], index: number): NarrativeBeat | undefined {
  return beats[index];
}

function shouldGroupConflictEvidence(
  beat: NarrativeBeat,
  index: number,
  beats: NarrativeBeat[],
): boolean {
  if (!isConflictEvidenceBeat(beat)) {
    return false;
  }

  const previous = peekBeat(beats, index - 1);
  const next = peekBeat(beats, index + 1);

  return Boolean(
    (previous && (isConflictBeat(previous) || previous.type === "reveal")) ||
      (next && (isConflictBeat(next) || next.type === "reveal" || next.type === "conflict")),
  );
}

function resolveArcTypeForBeat(
  beat: NarrativeBeat,
  index: number,
  total: number,
  beats: NarrativeBeat[],
): NarrativeArcType {
  if (isEndingBeat(beat, index, total)) {
    return "ending";
  }

  if (isResolutionBeat(beat, index, total)) {
    return "resolution";
  }

  if (isClimaxBeat(beat, index, total)) {
    return "climax";
  }

  if (isConflictBeat(beat) || shouldGroupConflictEvidence(beat, index, beats)) {
    return "conflict";
  }

  if (index === 0 && beat.type === "setup") {
    return "opening";
  }

  if (isOpeningBeat(beat, index, total)) {
    return index === 0 ? "opening" : "setup";
  }

  if (isDevelopmentBeat(beat, index, total)) {
    return "development";
  }

  if (index < Math.ceil(total * 0.35)) {
    return "opening";
  }

  if (index >= Math.ceil(total * 0.7)) {
    return "ending";
  }

  return "development";
}

function canExtendArc(
  arcType: NarrativeArcType,
  beat: NarrativeBeat,
  index: number,
  total: number,
  beats: NarrativeBeat[],
): boolean {
  const beatArcType = resolveArcTypeForBeat(beat, index, total, beats);

  if (arcType === beatArcType) {
    return true;
  }

  if (arcType === "opening" && (beatArcType === "setup" || beat.type === "context")) {
    return true;
  }

  if (arcType === "setup" && isOpeningBeat(beat, index, total)) {
    return true;
  }

  if (arcType === "development" && beat.type === "context") {
    return true;
  }

  if (arcType === "conflict" && (beat.type === "evidence" || beat.type === "reveal")) {
    return true;
  }

  if (arcType === "ending" && (beat.type === "payoff" || beat.type === "conclusion" || beat.type === "cta")) {
    return true;
  }

  if (arcType === "resolution" && RESOLUTION_BEAT_TYPES.has(beat.type)) {
    return true;
  }

  return false;
}

export function calculateArcDuration(beats: NarrativeBeat[]): number {
  return beats.reduce((total, beat) => total + Math.max(0, beat.timing.durationMs), 0);
}

export function calculateArcImportance(beats: NarrativeBeat[]): number {
  if (beats.length === 0) {
    return 0;
  }

  const total = beats.reduce((sum, beat) => sum + beat.importance.value, 0);
  const average = total / beats.length;

  return Math.min(1, Math.max(0, Math.round(average * 1000) / 1000));
}

export function determineDominantEmotion(beats: NarrativeBeat[]): string | undefined {
  const counts = new Map<string, number>();

  for (const beat of beats) {
    if (!beat.emotion) {
      continue;
    }

    counts.set(beat.emotion, (counts.get(beat.emotion) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return undefined;
  }

  let dominant: string | undefined;
  let dominantCount = -1;
  let dominantImportance = -1;

  for (const beat of beats) {
    if (!beat.emotion) {
      continue;
    }

    const count = counts.get(beat.emotion) ?? 0;
    if (count > dominantCount || (count === dominantCount && beat.importance.value > dominantImportance)) {
      dominant = beat.emotion;
      dominantCount = count;
      dominantImportance = beat.importance.value;
    }
  }

  return dominant;
}

export function determineDominantPurpose(beats: NarrativeBeat[]): string | undefined {
  const counts = new Map<string, number>();

  for (const beat of beats) {
    if (!beat.purpose) {
      continue;
    }

    counts.set(beat.purpose, (counts.get(beat.purpose) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return undefined;
  }

  let dominant: string | undefined;
  let dominantCount = -1;

  for (const [purpose, count] of counts.entries()) {
    if (count > dominantCount) {
      dominant = purpose;
      dominantCount = count;
    }
  }

  return dominant;
}

export function suggestArcSceneCount(
  type: NarrativeArcType,
  beatCount: number,
  strategy?: StoryStrategy,
): number {
  const arcRange = NARRATIVE_ARC_SCENE_COUNT_RANGES[type];
  const range =
    strategy && !isDefaultStoryStrategy(strategy.id)
      ? {
          min: Math.max(arcRange.min, strategy.sceneDensity.minScenesPerArc),
          max: Math.max(arcRange.max, strategy.sceneDensity.maxScenesPerArc),
        }
      : arcRange;
  const safeBeatCount = Math.max(0, beatCount);

  if (safeBeatCount <= 1) {
    return range.min;
  }

  if (safeBeatCount >= 4) {
    return range.max;
  }

  const scaled = Math.ceil(safeBeatCount / 2) + (type === "development" ? 1 : 0);
  return Math.min(range.max, Math.max(range.min, scaled));
}

function createArcId(order: number): string {
  return `arc-${order + 1}`;
}

function buildArc(
  type: NarrativeArcType,
  beats: NarrativeBeat[],
  startBeatIndex: number,
  endBeatIndex: number,
  arcOrder: number,
  strategy?: StoryStrategy,
): NarrativeArc {
  const arcBeats = beats.slice(startBeatIndex, endBeatIndex + 1);
  let averageImportance = calculateArcImportance(arcBeats);

  if (
    strategy &&
    !isDefaultStoryStrategy(strategy.id) &&
    (type === "ending" || type === "resolution" || type === "climax")
  ) {
    averageImportance = Math.min(
      1,
      Math.round(averageImportance * strategy.arcStrategy.endingArcWeight * 1000) / 1000,
    );
  }

  return {
    id: createArcId(arcOrder),
    type,
    title: NARRATIVE_ARC_TYPE_LABELS[type],
    beatIds: arcBeats.map((beat) => beat.id),
    beats: arcBeats,
    startBeatIndex,
    endBeatIndex,
    estimatedDurationMs: calculateArcDuration(arcBeats),
    averageImportance,
    dominantEmotion: determineDominantEmotion(arcBeats),
    dominantPurpose: determineDominantPurpose(arcBeats),
    suggestedSceneCount: suggestArcSceneCount(type, arcBeats.length, strategy),
  };
}

export function groupOpeningArc(
  beats: NarrativeBeat[],
  startIndex: number,
): { type: NarrativeArcType; endIndex: number } | null {
  const beat = peekBeat(beats, startIndex);
  if (!beat) {
    return null;
  }

  const total = beats.length;
  if (!isOpeningBeat(beat, startIndex, total) && startIndex !== 0) {
    return null;
  }

  let endIndex = startIndex;
  const arcType: NarrativeArcType = startIndex === 0 ? "opening" : "setup";

  while (endIndex + 1 < total) {
    const next = beats[endIndex + 1];
    if (!next || !canExtendArc(arcType, next, endIndex + 1, total, beats)) {
      break;
    }

    if (
      resolveArcTypeForBeat(next, endIndex + 1, total, beats) === "development" &&
      next.type === "evidence"
    ) {
      break;
    }

    endIndex += 1;
  }

  return { type: arcType, endIndex };
}

export function groupDevelopmentArc(
  beats: NarrativeBeat[],
  startIndex: number,
): { type: NarrativeArcType; endIndex: number } | null {
  const beat = peekBeat(beats, startIndex);
  if (!beat) {
    return null;
  }

  const total = beats.length;
  const arcType = resolveArcTypeForBeat(beat, startIndex, total, beats);

  if (arcType !== "development" && !isDevelopmentBeat(beat, startIndex, total)) {
    return null;
  }

  let endIndex = startIndex;

  while (endIndex + 1 < total) {
    const next = beats[endIndex + 1];
    if (!next) {
      break;
    }

    const nextArcType = resolveArcTypeForBeat(next, endIndex + 1, total, beats);
    if (nextArcType === "conflict" || nextArcType === "ending" || nextArcType === "climax") {
      break;
    }

    if (!canExtendArc("development", next, endIndex + 1, total, beats)) {
      break;
    }

    endIndex += 1;
  }

  return { type: "development", endIndex };
}

export function groupConflictArc(
  beats: NarrativeBeat[],
  startIndex: number,
): { type: NarrativeArcType; endIndex: number } | null {
  const beat = peekBeat(beats, startIndex);
  if (!beat) {
    return null;
  }

  const total = beats.length;
  const arcType = resolveArcTypeForBeat(beat, startIndex, total, beats);

  if (arcType !== "conflict" && !isConflictBeat(beat) && !shouldGroupConflictEvidence(beat, startIndex, beats)) {
    return null;
  }

  let endIndex = startIndex;

  while (endIndex + 1 < total) {
    const next = beats[endIndex + 1];
    if (!next) {
      break;
    }

    const nextArcType = resolveArcTypeForBeat(next, endIndex + 1, total, beats);
    if (nextArcType === "ending" || nextArcType === "resolution" || nextArcType === "opening") {
      break;
    }

    if (!canExtendArc("conflict", next, endIndex + 1, total, beats) && nextArcType !== "conflict") {
      break;
    }

    endIndex += 1;
  }

  return { type: "conflict", endIndex };
}

export function groupEndingArc(
  beats: NarrativeBeat[],
  startIndex: number,
): { type: NarrativeArcType; endIndex: number } | null {
  const beat = peekBeat(beats, startIndex);
  if (!beat) {
    return null;
  }

  const total = beats.length;
  const arcType = resolveArcTypeForBeat(beat, startIndex, total, beats);

  if (
    arcType !== "ending" &&
    arcType !== "resolution" &&
    arcType !== "climax" &&
    !isEndingBeat(beat, startIndex, total)
  ) {
    return null;
  }

  const resolvedType: NarrativeArcType =
    arcType === "climax" ? "climax" : arcType === "resolution" ? "resolution" : "ending";

  let endIndex = startIndex;

  while (endIndex + 1 < total) {
    const next = beats[endIndex + 1];
    if (!next) {
      break;
    }

    if (!canExtendArc(resolvedType, next, endIndex + 1, total, beats)) {
      const nextType = resolveArcTypeForBeat(next, endIndex + 1, total, beats);
      if (nextType !== "ending" && nextType !== "resolution" && nextType !== "climax") {
        break;
      }
    }

    endIndex += 1;
  }

  return { type: resolvedType, endIndex };
}

/** Groups detected narrative beats into higher-level narrative arcs. */
export function buildNarrativeArcs(
  beats: NarrativeBeat[],
  strategy?: StoryStrategy,
  diagnostics?: PlannerStrategyDiagnostics,
): NarrativeArc[] {
  const resolvedStrategy = resolvePlannerStrategy(undefined, strategy);

  if (diagnostics && !isDefaultStoryStrategy(resolvedStrategy.id)) {
    recordStrategyInfluence(diagnostics, "arcStrategy.preferredArcSequence");
    recordStrategyInfluence(diagnostics, "arcStrategy.prioritizeConflictArc");
    recordStrategyInfluence(diagnostics, "arcStrategy.endingArcWeight");
    recordStrategyInfluence(diagnostics, "sceneDensity.minScenesPerArc");
    recordStrategyInfluence(diagnostics, "sceneDensity.maxScenesPerArc");
    recordStrategyDecision(
      diagnostics,
      `Preferred arc sequence: ${resolvedStrategy.arcStrategy.preferredArcSequence.join(" → ")}.`,
    );
  }

  const orderedBeats = sortBeats(beats);

  if (orderedBeats.length === 0) {
    return [];
  }

  const arcs: NarrativeArc[] = [];
  let cursor = 0;

  while (cursor < orderedBeats.length) {
    const total = orderedBeats.length;
    const currentBeat = orderedBeats[cursor];
    const preferredType = resolveArcTypeForBeat(currentBeat, cursor, total, orderedBeats);

    let grouping =
      (resolvedStrategy.arcStrategy.prioritizeConflictArc &&
      (preferredType === "conflict" || currentBeat.type === "conflict" || currentBeat.type === "counterpoint")
        ? groupConflictArc(orderedBeats, cursor)
        : null) ??
      (preferredType === "opening" || preferredType === "setup" || cursor === 0
        ? groupOpeningArc(orderedBeats, cursor)
        : null) ??
      (preferredType === "conflict" ? groupConflictArc(orderedBeats, cursor) : null) ??
      (preferredType === "ending" || preferredType === "resolution" || preferredType === "climax"
        ? groupEndingArc(orderedBeats, cursor)
        : null) ??
      (resolvedStrategy.arcStrategy.prioritizeDevelopmentArc
        ? groupDevelopmentArc(orderedBeats, cursor)
        : null) ??
      groupDevelopmentArc(orderedBeats, cursor) ??
      groupConflictArc(orderedBeats, cursor) ??
      groupEndingArc(orderedBeats, cursor);

    if (!grouping) {
      grouping = {
        type: preferredType === "setup" ? "setup" : preferredType,
        endIndex: cursor,
      };
      if (diagnostics) {
        recordStrategyFallback(diagnostics, `Single-beat arc fallback at beat ${cursor + 1}.`);
      }
    }

    arcs.push(
      buildArc(grouping.type, orderedBeats, cursor, grouping.endIndex, arcs.length, resolvedStrategy),
    );

    cursor = grouping.endIndex + 1;
  }

  return arcs;
}
