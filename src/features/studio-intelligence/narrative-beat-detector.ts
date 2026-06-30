import {
  DEFAULT_TIMING_WEIGHTS,
  NARRATIVE_BEAT_TYPE_LABELS,
} from "./studio-intelligence.constants";
import type {
  NarrativeBeat,
  NarrativeBeatType,
  SceneImportanceScore,
  StudioIntelligenceInput,
  TimingSuggestion,
} from "./studio-intelligence.types";
import type { StoryStrategy } from "./story-strategy/story-strategy.types";
import { resolvePlannerStrategy } from "./story-strategy/planner-strategy.utils";
import {
  clampSceneDurationMs,
  estimateReadingTimeMs,
  normalizeNarrationText,
  resolveSceneImportanceTier,
  splitNarrationIntoSentences,
} from "./studio-intelligence.utils";

const RANKING_PATTERN =
  /\b(top\s+\d+|#\d+|\d+(?:st|nd|rd|th)\b|number\s+(one|two|three|four|five|\d+)|countdown|ranked|ranking|at number)\b/i;

const DEBATE_PATTERN =
  /\b(however|but|yet|although|though|on the other hand|critics|argue|debate|disagree|versus|vs\.?|some say|others believe|unpopular opinion|contrary to)\b/i;

const EVIDENCE_PATTERN =
  /\b(\d+%|\d+\s*(goals|assists|games|matches|minutes|season|points)|scored|stats|statistics|record|data|proof|average|per 90)\b/i;

const TURNING_POINT_PATTERN =
  /\b(then|suddenly|until|turning point|shifted|changed|pivotal moment|after that|from that moment|when he|when they)\b/i;

const REVEAL_PATTERN =
  /\b(reveal|turns out|truth is|surprisingly|secret|hidden|actually|really|plot twist|unexpected)\b/i;

const PAYOFF_PATTERN =
  /\b(means|proves|shows|that's why|which is why|legacy|impact|takeaway|matters|defines|cements)\b/i;

const CONCLUSION_PATTERN =
  /\b(in conclusion|ultimately|finally|to sum up|overall|the bottom line|in the end|all told)\b/i;

const CTA_PATTERN =
  /\b(subscribe|follow|like and subscribe|comment|watch|tune in|let me know|drop your|smash that)\b/i;

const CONTEXT_PATTERN =
  /\b(since|after|before|during|season|years ago|history|background|context|when he joined|when they signed|leading up to)\b/i;

const CONFLICT_PATTERN =
  /\b(problem|challenge|struggle|against|clash|tension|controversy|under fire|backlash|overrated|underrated debate)\b/i;

const HOOK_PATTERN =
  /\b(what if|imagine|meet|here'?s why|you won'?t believe|never before|biggest|greatest|most|this is)\b/i;

const SETUP_PATTERN =
  /\b(let'?s|first|start with|to understand|before we|setup|set the scene|picture this)\b/i;

const PUNCHY_MAX_WORDS = 14;
const PUNCHY_MAX_CHARS = 96;
const HOOK_WINDOW = 2;

function countWords(sentence: string): number {
  return sentence.split(/\s+/).filter(Boolean).length;
}

function isPunchySentence(sentence: string): boolean {
  const words = countWords(sentence);
  return words <= PUNCHY_MAX_WORDS || sentence.length <= PUNCHY_MAX_CHARS;
}

function isNearEnd(index: number, total: number): boolean {
  return index >= Math.max(0, total - 1);
}

function isPenultimateOrLast(index: number, total: number): boolean {
  return total > 1 && index >= total - 2;
}

function isEarlyBeat(index: number, total: number): boolean {
  if (total <= 1) {
    return index === 0;
  }

  return index / Math.max(1, total - 1) <= 0.35;
}

function resolveTimingWeight(type: NarrativeBeatType): number {
  switch (type) {
    case "hook":
      return DEFAULT_TIMING_WEIGHTS.hook;
    case "setup":
      return DEFAULT_TIMING_WEIGHTS.setup;
    case "context":
      return DEFAULT_TIMING_WEIGHTS.context;
    case "conflict":
    case "counterpoint":
      return DEFAULT_TIMING_WEIGHTS.conflict;
    case "evidence":
      return DEFAULT_TIMING_WEIGHTS.evidence;
    case "turning_point":
      return DEFAULT_TIMING_WEIGHTS.turning_point;
    case "reveal":
      return DEFAULT_TIMING_WEIGHTS.reveal;
    case "payoff":
    case "takeaway":
      return DEFAULT_TIMING_WEIGHTS.payoff;
    case "conclusion":
      return DEFAULT_TIMING_WEIGHTS.conclusion;
    case "cta":
      return DEFAULT_TIMING_WEIGHTS.cta;
    case "climax":
    case "hero_moment":
      return DEFAULT_TIMING_WEIGHTS.climax;
    case "transition":
      return DEFAULT_TIMING_WEIGHTS.transition;
    default:
      return DEFAULT_TIMING_WEIGHTS.context;
  }
}

function buildTimingSuggestion(sentence: string, type: NarrativeBeatType): TimingSuggestion {
  const durationMs = clampSceneDurationMs(estimateReadingTimeMs(sentence));
  const weight = resolveTimingWeight(type);

  return {
    durationMs,
    weight,
    rationale: `Estimated from sentence length with ${type} weight.`,
  };
}

/** Infers a coarse emotional tone label for a sentence. */
export function inferBeatEmotion(sentence: string): string | undefined {
  const normalized = sentence.toLowerCase();

  if (/\b(incredible|amazing|unbelievable|insane|dominant|best|greatest)\b/.test(normalized)) {
    return "excitement";
  }

  if (/\b(tragic|heartbreak|disappoint|failed|nightmare|disaster)\b/.test(normalized)) {
    return "disappointment";
  }

  if (DEBATE_PATTERN.test(normalized) || CONFLICT_PATTERN.test(normalized)) {
    return "tension";
  }

  if (/\b(surprise|shocked|unexpected|turns out|secret)\b/.test(normalized)) {
    return "surprise";
  }

  if (PAYOFF_PATTERN.test(normalized) || CONCLUSION_PATTERN.test(normalized)) {
    return "resolution";
  }

  if (/\?/.test(sentence)) {
    return "curiosity";
  }

  return undefined;
}

/** Infers a short narrative purpose label for a sentence. */
export function inferBeatPurpose(sentence: string): string {
  const normalized = sentence.toLowerCase();

  if (HOOK_PATTERN.test(normalized) || (isPunchySentence(sentence) && normalized.length < 80)) {
    return "Grab attention immediately";
  }

  if (RANKING_PATTERN.test(normalized)) {
    return "Present ranked evidence";
  }

  if (DEBATE_PATTERN.test(normalized)) {
    return "Introduce opposing view or tension";
  }

  if (EVIDENCE_PATTERN.test(normalized)) {
    return "Support the claim with facts";
  }

  if (TURNING_POINT_PATTERN.test(normalized)) {
    return "Mark a shift in the story";
  }

  if (REVEAL_PATTERN.test(normalized)) {
    return "Surface a hidden or surprising detail";
  }

  if (PAYOFF_PATTERN.test(normalized)) {
    return "Land the narrative payoff";
  }

  if (CONCLUSION_PATTERN.test(normalized)) {
    return "Close the story with a final takeaway";
  }

  if (CTA_PATTERN.test(normalized)) {
    return "Prompt viewer action";
  }

  if (CONTEXT_PATTERN.test(normalized)) {
    return "Provide background context";
  }

  if (SETUP_PATTERN.test(normalized)) {
    return "Frame the story before the main arc";
  }

  return "Advance the narrative";
}

/** Classifies one narration sentence into a narrative beat type. */
export function classifySentenceBeat(
  sentence: string,
  index: number,
  total: number,
): NarrativeBeatType {
  const normalized = sentence.trim();
  if (!normalized) {
    return "context";
  }

  const lower = normalized.toLowerCase();

  if (CTA_PATTERN.test(lower)) {
    return "cta";
  }

  if (isNearEnd(index, total)) {
    if (TURNING_POINT_PATTERN.test(lower)) {
      return "turning_point";
    }

    if (REVEAL_PATTERN.test(lower)) {
      return "reveal";
    }

    if (CONCLUSION_PATTERN.test(lower)) {
      return "conclusion";
    }

    if (PAYOFF_PATTERN.test(lower)) {
      return "payoff";
    }

    return total === 1 ? "payoff" : "conclusion";
  }

  if (isPenultimateOrLast(index, total) && total > 2 && PAYOFF_PATTERN.test(lower)) {
    return "payoff";
  }

  const hasSpecializedBeatSignal =
    RANKING_PATTERN.test(lower) ||
    REVEAL_PATTERN.test(lower) ||
    TURNING_POINT_PATTERN.test(lower) ||
    DEBATE_PATTERN.test(lower) ||
    CONFLICT_PATTERN.test(lower) ||
    EVIDENCE_PATTERN.test(lower) ||
    CTA_PATTERN.test(lower);

  if (
    index < HOOK_WINDOW &&
    !hasSpecializedBeatSignal &&
    (index === 0 || isPunchySentence(normalized) || HOOK_PATTERN.test(lower) || /\?$/.test(normalized))
  ) {
    return "hook";
  }

  if (RANKING_PATTERN.test(lower) || (EVIDENCE_PATTERN.test(lower) && /\b(number|#|\d+(?:st|nd|rd|th))\b/i.test(lower))) {
    return "evidence";
  }

  if (REVEAL_PATTERN.test(lower)) {
    return "reveal";
  }

  if (TURNING_POINT_PATTERN.test(lower)) {
    return "turning_point";
  }

  if (DEBATE_PATTERN.test(lower) || CONFLICT_PATTERN.test(lower)) {
    return "conflict";
  }

  if (EVIDENCE_PATTERN.test(lower)) {
    return "evidence";
  }

  if (SETUP_PATTERN.test(lower) || (index === 1 && total > 3)) {
    return "setup";
  }

  if (CONTEXT_PATTERN.test(lower)) {
    return "context";
  }

  if (isEarlyBeat(index, total)) {
    return index === 0 ? "hook" : "setup";
  }

  if (isPenultimateOrLast(index, total)) {
    return "payoff";
  }

  return "context";
}

/** Scores beat importance from type, order, and sentence characteristics. */
export function scoreBeatImportance(beat: NarrativeBeat): SceneImportanceScore {
  let value = 0.45;
  const rationales: string[] = [];

  switch (beat.type) {
    case "hook":
      value = beat.order <= 1 ? 0.92 : 0.78;
      rationales.push("Opening hook anchors viewer attention.");
      break;
    case "payoff":
    case "conclusion":
      value = 0.86;
      rationales.push("Closing beat carries the narrative landing.");
      break;
    case "evidence":
      value = 0.72;
      rationales.push("Evidence supports credibility and pacing.");
      break;
    case "turning_point":
    case "reveal":
      value = 0.8;
      rationales.push("Pivot or reveal shifts story momentum.");
      break;
    case "conflict":
    case "counterpoint":
      value = 0.74;
      rationales.push("Conflict creates narrative tension.");
      break;
    case "cta":
      value = 0.55;
      rationales.push("Call to action is secondary to story delivery.");
      break;
    case "setup":
    case "context":
      value = 0.48;
      rationales.push("Exposition supports the main arc.");
      break;
    default:
      value = 0.5;
      break;
  }

  if (isPunchySentence(beat.text)) {
    value += 0.04;
    rationales.push("Short punchy delivery increases salience.");
  }

  if (inferBeatEmotion(beat.text) === "excitement") {
    value += 0.03;
  }

  const clamped = Math.min(1, Math.max(0, value));
  const tier = resolveSceneImportanceTier(clamped);

  return {
    value: clamped,
    tier,
    rationale: rationales.join(" "),
  };
}

function createBeatId(order: number): string {
  return `beat-${order + 1}`;
}

/** Detects narrative beats from narration text using heuristic classification. */
export function detectNarrativeBeats(
  input: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): NarrativeBeat[] {
  void resolvePlannerStrategy(input, strategy);
  const narration = normalizeNarrationText(input.narration);
  const sentences = splitNarrationIntoSentences(narration);

  if (sentences.length === 0) {
    return [];
  }

  return sentences.map((sentence, index) => {
    const type = classifySentenceBeat(sentence, index, sentences.length);
    const draftBeat: NarrativeBeat = {
      id: createBeatId(index),
      type,
      label: NARRATIVE_BEAT_TYPE_LABELS[type],
      text: sentence,
      order: index,
      timing: buildTimingSuggestion(sentence, type),
      importance: { value: 0.5, tier: "medium" },
      emotion: inferBeatEmotion(sentence),
      purpose: inferBeatPurpose(sentence),
    };

    return {
      ...draftBeat,
      importance: scoreBeatImportance(draftBeat),
    };
  });
}
