import type {
  NarrativeArc,
  NarrativeBeat,
  SceneImportanceScore,
  StudioIntelligenceInput,
} from "./studio-intelligence.types";
import type {
  AssetBlueprint,
  CaptionBlueprint,
  MotionBlueprint,
  SceneBlueprint,
  SceneBlueprintCollection,
  SceneBlueprintKind,
  SceneBlueprintRole,
  TimingBlueprint,
  TimingBlueprintPacing,
  VisualBlueprint,
} from "./scene-blueprint.types";
import type { StoryStrategy } from "./story-strategy/story-strategy.types";
import { resolvePlannerStrategy } from "./story-strategy/planner-strategy.utils";
import {
  calculateBlueprintCollectionStats,
  clampBlueprintConfidence,
  createEmptySceneBlueprintCollection,
  createSceneBlueprintId,
  mapImportanceToMotionIntensity,
  mapVisualIntentToAssetRequirement,
  normalizeAssetSearchQuery,
} from "./scene-blueprint.utils";
import { clampSceneDurationMs, resolveSceneImportanceTier } from "./studio-intelligence.utils";

const HIGH_IMPORTANCE_THRESHOLD = 0.65;
const LOW_IMPORTANCE_THRESHOLD = 0.5;

function sortBeats(beats: NarrativeBeat[]): NarrativeBeat[] {
  return [...beats].sort((left, right) => left.order - right.order);
}

function isHighImportanceBeat(beat: NarrativeBeat): boolean {
  return (
    beat.importance.value >= HIGH_IMPORTANCE_THRESHOLD ||
    beat.importance.tier === "high" ||
    beat.importance.tier === "critical"
  );
}

function isLowImportanceBeat(beat: NarrativeBeat): boolean {
  return beat.importance.value < LOW_IMPORTANCE_THRESHOLD || beat.importance.tier === "low";
}

function averageImportance(beats: NarrativeBeat[]): SceneImportanceScore {
  if (beats.length === 0) {
    return { value: 0, tier: "low" };
  }

  const value =
    beats.reduce((total, beat) => total + beat.importance.value, 0) / Math.max(1, beats.length);

  return {
    value: Math.min(1, Math.max(0, Math.round(value * 1000) / 1000)),
    tier: resolveSceneImportanceTier(value),
    rationale: beats.length > 1 ? "Averaged from grouped beats." : beats[0]?.importance.rationale,
  };
}

function primaryBeat(beats: NarrativeBeat[]): NarrativeBeat {
  return [...beats].sort((left, right) => right.importance.value - left.importance.value)[0] ?? beats[0];
}

function truncateText(value: string, maxLength = 72): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function extractHighlightWords(text: string): string[] {
  const words = text
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4);

  return [...new Set(words)].slice(0, 3);
}

function resolveTargetSceneCount(arc: NarrativeArc): number {
  const beatCount = arc.beats.length;
  if (beatCount === 0) {
    return 0;
  }

  return Math.max(1, Math.min(arc.suggestedSceneCount, beatCount));
}

function shouldStartNewBlueprintGroup(
  arc: NarrativeArc,
  beat: NarrativeBeat,
  currentGroup: NarrativeBeat[],
): boolean {
  if (currentGroup.length === 0) {
    return false;
  }

  if (isHighImportanceBeat(beat)) {
    return true;
  }

  if (arc.type === "opening" && beat.type === "hook") {
    return true;
  }

  if (arc.type === "ending" && beat.type === "cta" && !currentGroup.some((item) => item.type === "cta")) {
    return true;
  }

  if (
    arc.type === "conflict" &&
    (beat.type === "conflict" || beat.type === "reveal" || beat.type === "counterpoint")
  ) {
    return !currentGroup.some(
      (item) => item.type === "conflict" || item.type === "reveal" || item.type === "counterpoint",
    );
  }

  if (isHighImportanceBeat(primaryBeat(currentGroup)) && isLowImportanceBeat(beat) === false) {
    return beat.type !== primaryBeat(currentGroup).type;
  }

  return false;
}

function splitHighImportanceBeats(groups: NarrativeBeat[][]): NarrativeBeat[][] {
  const result: NarrativeBeat[][] = [];

  for (const group of groups) {
    if (group.length <= 1) {
      result.push(group);
      continue;
    }

    let buffer: NarrativeBeat[] = [];

    for (const beat of group) {
      if (isHighImportanceBeat(beat)) {
        if (buffer.length > 0) {
          result.push(buffer);
          buffer = [];
        }

        result.push([beat]);
        continue;
      }

      buffer.push(beat);
    }

    if (buffer.length > 0) {
      result.push(buffer);
    }
  }

  return result;
}

function mergeAdjacentGroups(groups: NarrativeBeat[][], targetCount: number): NarrativeBeat[][] {
  const merged = groups.map((group) => [...group]);

  while (merged.length > targetCount && merged.length > 1) {
    let mergeIndex = 0;
    let lowestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < merged.length - 1; index += 1) {
      const left = merged[index];
      const right = merged[index + 1];
      if (!left || !right) {
        continue;
      }

      const score = averageImportance([...left, ...right]).value;
      const hasProtectedBeat = [...left, ...right].some((beat) => isHighImportanceBeat(beat));

      if (hasProtectedBeat) {
        continue;
      }

      if (score < lowestScore) {
        lowestScore = score;
        mergeIndex = index;
      }
    }

    if (!Number.isFinite(lowestScore)) {
      break;
    }

    const left = merged[mergeIndex];
    const right = merged[mergeIndex + 1];
    if (!left || !right) {
      break;
    }

    merged.splice(mergeIndex, 2, [...left, ...right]);
  }

  return merged;
}

function splitGroupsToTarget(groups: NarrativeBeat[][], targetCount: number): NarrativeBeat[][] {
  const result = groups.map((group) => [...group]);

  while (result.length < targetCount) {
    const splitIndex = result.findIndex((group) => {
      if (group.length <= 1) {
        return false;
      }

      return !group.every((beat) => isHighImportanceBeat(beat));
    });

    if (splitIndex === -1) {
      break;
    }

    const group = result[splitIndex];
    if (!group || group.length <= 1) {
      break;
    }

    const midpoint = Math.ceil(group.length / 2);
    const nextGroup = group.slice(midpoint);
    result.splice(splitIndex, 1, group.slice(0, midpoint), nextGroup);
  }

  return result;
}

function groupBeatsForArc(arc: NarrativeArc): NarrativeBeat[][] {
  const beats = sortBeats(arc.beats);
  if (beats.length === 0) {
    return [];
  }

  const targetCount = resolveTargetSceneCount(arc);
  const groups: NarrativeBeat[][] = [];
  let current: NarrativeBeat[] = [];

  for (const beat of beats) {
    if (shouldStartNewBlueprintGroup(arc, beat, current)) {
      groups.push(current);
      current = [];
    }

    current.push(beat);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  let normalized = splitHighImportanceBeats(groups);
  normalized = mergeAdjacentGroups(normalized, targetCount);
  normalized = splitGroupsToTarget(normalized, targetCount);

  return normalized;
}

/** Chooses a scene blueprint role from arc context and beat characteristics. */
export function chooseSceneBlueprintRole(
  arc: NarrativeArc,
  beat: NarrativeBeat,
  index: number,
): SceneBlueprintRole {
  switch (beat.type) {
    case "hook":
    case "setup":
    case "question":
      return "intro";
    case "context":
      return arc.type === "opening" || arc.type === "setup" ? "context" : "context";
    case "evidence":
      return "evidence";
    case "conflict":
    case "counterpoint":
      return "conflict";
    case "reveal":
      return arc.type === "conflict" ? "conflict" : "climax";
    case "turning_point":
    case "climax":
    case "hero_moment":
      return "climax";
    case "payoff":
    case "takeaway":
      return "payoff";
    case "conclusion":
      return "ending";
    case "cta":
      return "cta";
    case "transition":
      return "transition";
    case "stakes":
      return index === 0 ? "intro" : "context";
    default:
      break;
  }

  if (arc.type === "opening" || arc.type === "setup") {
    return index === 0 ? "intro" : "context";
  }

  if (arc.type === "conflict") {
    return "conflict";
  }

  if (arc.type === "ending" || arc.type === "resolution") {
    return beat.type === "cta" ? "cta" : "payoff";
  }

  return "context";
}

/** Chooses a scene blueprint kind from arc context and beat characteristics. */
export function chooseSceneBlueprintKind(arc: NarrativeArc, beat: NarrativeBeat): SceneBlueprintKind {
  switch (beat.type) {
    case "hook":
      return "hook_opener";
    case "setup":
    case "context":
      return arc.type === "opening" ? "player_spotlight" : "neutral_broll";
    case "evidence":
      return /\b(top|#\d+|number)\b/i.test(beat.text) ? "ranked_reveal" : "stat_moment";
    case "conflict":
    case "counterpoint":
      return "debate_split";
    case "reveal":
      return arc.type === "conflict" ? "debate_split" : "text_card";
    case "turning_point":
    case "climax":
    case "hero_moment":
      return "match_highlight";
    case "payoff":
    case "conclusion":
    case "takeaway":
      return "closing_moment";
    case "cta":
      return "cta_card";
    case "question":
      return "text_card";
    default:
      break;
  }

  if (arc.type === "opening") {
    return "hook_opener";
  }

  if (arc.type === "conflict") {
    return "debate_split";
  }

  if (arc.type === "ending") {
    return "closing_moment";
  }

  return "neutral_broll";
}

function resolvePacing(beat: NarrativeBeat, arc: NarrativeArc): TimingBlueprintPacing {
  if (beat.type === "hook" || beat.type === "cta") {
    return "punchy";
  }

  if (beat.type === "evidence" || beat.type === "conflict") {
    return "fast";
  }

  if (arc.type === "ending" || beat.type === "conclusion" || beat.type === "payoff") {
    return "normal";
  }

  if (arc.type === "development") {
    return "normal";
  }

  return "normal";
}

/** Creates a timing blueprint for a beat within an arc context. */
export function createTimingBlueprintForBeat(beat: NarrativeBeat, arc: NarrativeArc): TimingBlueprint {
  const suggestedDurationMs = clampSceneDurationMs(beat.timing.durationMs);
  const arcWeight = arc.type === "opening" || arc.type === "ending" ? 1 : 0.95;
  const adjusted = clampSceneDurationMs(Math.round(suggestedDurationMs * arcWeight));
  const minDurationMs = clampSceneDurationMs(Math.round(adjusted * 0.75));
  const maxDurationMs = clampSceneDurationMs(Math.round(adjusted * 1.35));

  return {
    suggestedDurationMs: adjusted,
    minDurationMs: Math.min(minDurationMs, adjusted),
    maxDurationMs: Math.max(maxDurationMs, adjusted),
    pacing: resolvePacing(beat, arc),
    reason: `Derived from beat timing within ${arc.type} arc.`,
  };
}

function createGroupedTimingBlueprint(beats: NarrativeBeat[], arc: NarrativeArc): TimingBlueprint {
  const suggestedDurationMs = clampSceneDurationMs(
    beats.reduce((total, beat) => total + beat.timing.durationMs, 0),
  );
  const primary = primaryBeat(beats);
  const pacing = resolvePacing(primary, arc);
  const minDurationMs = clampSceneDurationMs(Math.round(suggestedDurationMs * 0.7));
  const maxDurationMs = clampSceneDurationMs(Math.round(suggestedDurationMs * 1.4));

  return {
    suggestedDurationMs,
    minDurationMs: Math.min(minDurationMs, suggestedDurationMs),
    maxDurationMs: Math.max(maxDurationMs, suggestedDurationMs),
    pacing,
    reason: `Grouped ${beats.length} beats within ${arc.type} arc.`,
  };
}

/** Creates a caption blueprint for a beat. */
export function createCaptionBlueprintForBeat(beat: NarrativeBeat): CaptionBlueprint {
  const highlightWords = extractHighlightWords(beat.text);

  if (beat.type === "hook") {
    return {
      emphasis: "phrase",
      highlightWords,
      captionStyleHint: "bold_hook",
      reason: "Hook beat favors bold phrase emphasis.",
    };
  }

  if (beat.type === "evidence") {
    return {
      emphasis: "stat",
      highlightWords,
      captionStyleHint: "stat_highlight",
      reason: "Evidence beat favors stat emphasis.",
    };
  }

  if (beat.type === "conflict" || beat.type === "counterpoint" || beat.type === "reveal") {
    return {
      emphasis: "phrase",
      highlightWords,
      captionStyleHint: "debate",
      reason: "Conflict beat favors debate styling.",
    };
  }

  if (beat.type === "cta") {
    return {
      emphasis: "phrase",
      highlightWords,
      captionStyleHint: "cta",
      reason: "CTA beat favors action styling.",
    };
  }

  return {
    emphasis: highlightWords.length > 0 ? "word" : "none",
    highlightWords,
    captionStyleHint: "default",
    reason: "Default caption planning for beat.",
  };
}

function createGroupedCaptionBlueprint(beats: NarrativeBeat[]): CaptionBlueprint {
  const primary = primaryBeat(beats);
  const caption = createCaptionBlueprintForBeat(primary);

  return {
    ...caption,
    highlightWords: [...new Set(beats.flatMap((beat) => extractHighlightWords(beat.text)))].slice(0, 4),
    reason: beats.length > 1 ? "Grouped caption derived from primary beat." : caption.reason,
  };
}

function defaultVisualIntentForBeat(beat: NarrativeBeat, kind: SceneBlueprintKind): VisualBlueprint["visualIntentType"] {
  switch (kind) {
    case "hook_opener":
    case "player_spotlight":
      return "player_portrait";
    case "stat_moment":
      return "stat_overlay";
    case "ranked_reveal":
      return "text_card";
    case "match_highlight":
      return "match_action";
    case "debate_split":
      return "comparison_split";
    case "closing_moment":
      return "neutral_broll";
    case "cta_card":
      return "text_card";
    default:
      return beat.type === "context" ? "archive_footage" : "neutral_broll";
  }
}

function createDefaultVisualBlueprint(beat: NarrativeBeat, arc: NarrativeArc, kind: SceneBlueprintKind): VisualBlueprint {
  const visualIntentType = defaultVisualIntentForBeat(beat, kind);

  return {
    visualIntentType,
    subject: truncateText(beat.text, 48),
    emotion: beat.emotion,
    reason: `Default visual intent for ${arc.type} arc until visual planner runs.`,
  };
}

function createDefaultAssetBlueprint(
  beat: NarrativeBeat,
  visual: VisualBlueprint,
  input?: StudioIntelligenceInput,
): AssetBlueprint {
  return {
    assetRequirementType: mapVisualIntentToAssetRequirement(visual.visualIntentType),
    searchQuery: normalizeAssetSearchQuery(beat.text || input?.topic || ""),
    fallbackQuery: normalizeAssetSearchQuery(beat.purpose ?? beat.label ?? input?.topic),
    preferredOrientation: visual.visualIntentType === "player_portrait" ? "portrait" : "landscape",
    imageCount: 1,
    reason: "Default asset plan until asset intelligence runs.",
  };
}

function createDefaultMotionBlueprint(importance: SceneImportanceScore): MotionBlueprint {
  const intensity = mapImportanceToMotionIntensity(importance);

  return {
    suggestedMotion: intensity === "high" ? "push_in" : intensity === "medium" ? "ken_burns" : "static",
    intensity,
    reason: "Default motion derived from importance.",
  };
}

function deriveBlueprintConfidence(beats: NarrativeBeat[], arc: NarrativeArc): number {
  const importance = averageImportance(beats).value;
  const arcBoost = arc.type === "opening" || arc.type === "ending" ? 0.05 : 0;
  const beatBoost = beats.length === 1 ? 0.05 : 0;

  return clampBlueprintConfidence(0.62 + importance * 0.25 + arcBoost + beatBoost);
}

function createBlueprintTitle(arc: NarrativeArc, beats: NarrativeBeat[], role: SceneBlueprintRole): string {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  if (beats.length === 1) {
    return `${arc.title}: ${roleLabel}`;
  }

  return `${arc.title}: ${roleLabel} (${beats.length} beats)`;
}

function createBlueprintSummary(beats: NarrativeBeat[]): string {
  if (beats.length === 1) {
    return truncateText(beats[0]?.text ?? "", 140);
  }

  return truncateText(beats.map((beat) => beat.text).join(" "), 180);
}

function buildBlueprintFromBeatGroup(
  arc: NarrativeArc,
  beats: NarrativeBeat[],
  order: number,
  input?: StudioIntelligenceInput,
): SceneBlueprint {
  const primary = primaryBeat(beats);
  const role = chooseSceneBlueprintRole(arc, primary, primary.order);
  const kind = chooseSceneBlueprintKind(arc, primary);
  const importance = averageImportance(beats);
  const timing =
    beats.length === 1
      ? createTimingBlueprintForBeat(primary, arc)
      : createGroupedTimingBlueprint(beats, arc);
  const caption =
    beats.length === 1
      ? createCaptionBlueprintForBeat(primary)
      : createGroupedCaptionBlueprint(beats);
  const visual = createDefaultVisualBlueprint(primary, arc, kind);
  const asset = createDefaultAssetBlueprint(primary, visual, input);
  const motion = createDefaultMotionBlueprint(importance);

  return {
    id: createSceneBlueprintId(order),
    arcId: arc.id,
    beatIds: beats.map((beat) => beat.id),
    role,
    kind,
    title: createBlueprintTitle(arc, beats, role),
    summary: createBlueprintSummary(beats),
    importance,
    timing,
    visual,
    asset,
    motion,
    caption,
    source: "scene_planner",
    confidence: deriveBlueprintConfidence(beats, arc),
  };
}

/** Plans scene blueprints for a single narrative arc. */
export function planScenesForArc(
  arc: NarrativeArc,
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): SceneBlueprint[] {
  void resolvePlannerStrategy(input, strategy);
  const beatGroups = groupBeatsForArc(arc);

  return beatGroups.map((beats, index) => buildBlueprintFromBeatGroup(arc, beats, index, input));
}

/** Plans scene blueprints from narrative arcs. */
export function planSceneBlueprintsFromArcs(
  arcs: NarrativeArc[],
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): SceneBlueprintCollection {
  void resolvePlannerStrategy(input, strategy);
  if (arcs.length === 0) {
    return createEmptySceneBlueprintCollection();
  }

  const orderedArcs = [...arcs].sort((left, right) => left.startBeatIndex - right.startBeatIndex);
  const blueprints = orderedArcs.flatMap((arc) => planScenesForArc(arc, input, strategy));
  const stats = calculateBlueprintCollectionStats(blueprints);

  return {
    blueprints,
    ...stats,
    warnings: [],
  };
}
