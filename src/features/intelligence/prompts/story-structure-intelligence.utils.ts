import type { ScriptMode } from "@/types/footiebitz";

/** Canonical short-form story arcs used by Prompt Intelligence. */
export type StoryStructureArc =
  | "hook_story_payoff"
  | "question_stakes_battle_cta"
  | "result_turning_hero_impact"
  | "bold_claim_explanation_evidence_takeaway"
  | "countdown_ranked_reveal"
  | "debate_argument_counterpoint_takeaway"
  | "curiosity_explanation_example_payoff"
  | "cold_open_context_payoff";

export interface StoryStructureBeatTemplate {
  id: string;
  /** Planning label — never spoken in narration. */
  label: string;
  purpose: string;
  weight: number;
  /** When true, allocate fewer words — opening should land in ~1–2 spoken seconds. */
  openingHook?: boolean;
}

export interface StoryStructureDefinition {
  arc: StoryStructureArc;
  /** Human-readable arc name for prompts. */
  arcLabel: string;
  beats: StoryStructureBeatTemplate[];
}

export const STORY_STRUCTURE_NARRATION_RULES: readonly string[] = [
  "The opening must land in roughly 1–2 spoken seconds — short, punchy, and immediately understandable.",
  "Do not say the words “hook”, “story”, “conclusion”, “payoff”, or beat labels in the narration.",
  "Write natural spoken lines — structure is for planning only, not on-screen chapter titles.",
  "End with a payoff tied to the brief — not generic calls to like, subscribe, or follow.",
  "Respect the narration word budget; compress middle beats before cutting the opening or ending.",
];

const PLAYER_ANALYSIS_STRUCTURE: StoryStructureDefinition = {
  arc: "hook_story_payoff",
  arcLabel: "Hook → Performance Story → Legacy/Impact Conclusion",
  beats: [
    {
      id: "opening-grab",
      label: "Opening grab",
      purpose: "One sharp line that frames why this player matters right now.",
      weight: 0.9,
      openingHook: true,
    },
    {
      id: "performance-story",
      label: "Performance story",
      purpose: "Walk through role, form, and match impact with verified evidence.",
      weight: 1.4,
    },
    {
      id: "legacy-impact",
      label: "Legacy/impact close",
      purpose: "Land what this moment means for legacy, trajectory, or the team.",
      weight: 1,
    },
  ],
};

const MATCH_PREVIEW_STRUCTURE: StoryStructureDefinition = {
  arc: "question_stakes_battle_cta",
  arcLabel: "Question Hook → Stakes → Key Battle → Prediction/CTA",
  beats: [
    {
      id: "question-opening",
      label: "Question opening",
      purpose: "Open with a direct question or tension the viewer wants answered.",
      weight: 0.9,
      openingHook: true,
    },
    {
      id: "stakes",
      label: "Stakes",
      purpose: "Explain what is on the line before kick-off.",
      weight: 1.1,
    },
    {
      id: "key-battle",
      label: "Key battle",
      purpose: "Spotlight the matchup or zone that could decide the game.",
      weight: 1.2,
    },
    {
      id: "prediction-cta",
      label: "Prediction/CTA",
      purpose: "Close with a cautious edge or watch-for angle — no invented results.",
      weight: 0.9,
    },
  ],
};

const MATCH_RECAP_STRUCTURE: StoryStructureDefinition = {
  arc: "result_turning_hero_impact",
  arcLabel: "Result Hook → Turning Point → Hero/Failure → Impact",
  beats: [
    {
      id: "result-opening",
      label: "Result opening",
      purpose: "Open on the scoreline or defining moment when verified.",
      weight: 0.95,
      openingHook: true,
    },
    {
      id: "turning-point",
      label: "Turning point",
      purpose: "Explain the moment that swung the game.",
      weight: 1.2,
    },
    {
      id: "hero-or-failure",
      label: "Hero/failure",
      purpose: "Highlight who won or lost the key battle — backed by facts.",
      weight: 1.1,
    },
    {
      id: "impact",
      label: "Impact",
      purpose: "Close on what the result means next — table, momentum, or narrative.",
      weight: 0.95,
    },
  ],
};

const TACTICAL_STRUCTURE: StoryStructureDefinition = {
  arc: "bold_claim_explanation_evidence_takeaway",
  arcLabel: "Bold Claim Hook → Tactical Explanation → Evidence → Takeaway",
  beats: [
    {
      id: "bold-claim",
      label: "Bold claim opening",
      purpose: "State a clear tactical thesis in one punchy line.",
      weight: 0.9,
      openingHook: true,
    },
    {
      id: "tactical-explanation",
      label: "Tactical explanation",
      purpose: "Explain shape, press, or pattern that supports the claim.",
      weight: 1.3,
    },
    {
      id: "evidence",
      label: "Evidence",
      purpose: "Support the claim with verified events, stats, or sequences.",
      weight: 1.2,
    },
    {
      id: "takeaway",
      label: "Takeaway",
      purpose: "Close with the tactical lesson — why it mattered on the pitch.",
      weight: 0.9,
    },
  ],
};

const TOP_5_STRUCTURE: StoryStructureDefinition = {
  arc: "countdown_ranked_reveal",
  arcLabel: "Countdown Hook → Ranked Beats → Final Reveal",
  beats: [
    {
      id: "countdown-opening",
      label: "Countdown opening",
      purpose: "Tease the list and why the ranking matters.",
      weight: 0.85,
      openingHook: true,
    },
    { id: "rank-5", label: "Rank 5", purpose: "Introduce #5 with exact ranked data.", weight: 1 },
    { id: "rank-4", label: "Rank 4", purpose: "Cover #4 without changing order.", weight: 1 },
    { id: "rank-3", label: "Rank 3", purpose: "Cover #3 and build momentum.", weight: 1 },
    { id: "rank-2", label: "Rank 2", purpose: "Raise tension toward #1.", weight: 1 },
    {
      id: "rank-1",
      label: "Final reveal",
      purpose: "Reveal #1 with exact values — make the top pick feel earned.",
      weight: 1.15,
    },
  ],
};

const OPINION_STRUCTURE: StoryStructureDefinition = {
  arc: "debate_argument_counterpoint_takeaway",
  arcLabel: "Debate Hook → Argument → Counterpoint → Takeaway",
  beats: [
    {
      id: "debate-opening",
      label: "Debate opening",
      purpose: "Frame the controversy or question in one sharp line.",
      weight: 0.9,
      openingHook: true,
    },
    {
      id: "argument",
      label: "Argument",
      purpose: "Present the strongest case for one side — fair, not straw-manned.",
      weight: 1.2,
    },
    {
      id: "counterpoint",
      label: "Counterpoint",
      purpose: "Present the strongest reply with equal weight.",
      weight: 1.1,
    },
    {
      id: "takeaway",
      label: "Takeaway",
      purpose: "Land a clear final view with conviction.",
      weight: 0.95,
    },
  ],
};

const EXPLAINER_STRUCTURE: StoryStructureDefinition = {
  arc: "curiosity_explanation_example_payoff",
  arcLabel: "Curiosity Hook → Explanation → Example → Conclusion",
  beats: [
    {
      id: "curiosity-opening",
      label: "Curiosity opening",
      purpose: "Open with why this history or fact still matters today.",
      weight: 0.9,
      openingHook: true,
    },
    {
      id: "explanation",
      label: "Explanation",
      purpose: "Explain the core context in clear, spoken language.",
      weight: 1.3,
    },
    {
      id: "example",
      label: "Example",
      purpose: "Anchor the explanation with one concrete verified example.",
      weight: 1.1,
    },
    {
      id: "payoff",
      label: "Payoff",
      purpose: "Close on legacy or relevance — not a generic sign-off.",
      weight: 0.95,
    },
  ],
};

const STORY_MODE_STRUCTURE: StoryStructureDefinition = {
  arc: "cold_open_context_payoff",
  arcLabel: "Cold Open → Context → Emotional Payoff",
  beats: [
    {
      id: "cold-open",
      label: "Cold open",
      purpose: "Drop the viewer into the most charged moment or image.",
      weight: 0.9,
      openingHook: true,
    },
    {
      id: "context",
      label: "Context",
      purpose: "Build stakes, history, and emotional weight.",
      weight: 1.3,
    },
    {
      id: "emotional-payoff",
      label: "Emotional payoff",
      purpose: "Close with a memorable line that lands the feeling.",
      weight: 1.1,
    },
  ],
};

const MODE_STORY_STRUCTURE: Record<ScriptMode, StoryStructureDefinition> = {
  player_analysis: PLAYER_ANALYSIS_STRUCTURE,
  match_preview: MATCH_PREVIEW_STRUCTURE,
  match_recap: MATCH_RECAP_STRUCTURE,
  tactical_review: TACTICAL_STRUCTURE,
  top_5: TOP_5_STRUCTURE,
  opinion_debate: OPINION_STRUCTURE,
  historical_explainer: EXPLAINER_STRUCTURE,
  story: STORY_MODE_STRUCTURE,
};

/**
 * Per-mode Prompt Intelligence story structures.
 * Cross-layer ScriptMode ↔ StoryStrategy ↔ ModeTemplate alignment lives in
 * `@/features/studio-intelligence/prompt-studio-alignment`.
 */
export function resolveStoryStructureForMode(mode: ScriptMode): StoryStructureDefinition {
  return MODE_STORY_STRUCTURE[mode];
}

export function buildStoryStructurePromptLines(mode: ScriptMode): string[] {
  const structure = resolveStoryStructureForMode(mode);

  return [
    `Story structure (${structure.arcLabel}):`,
    ...structure.beats.map(
      (beat, index) =>
        `${index + 1}. ${beat.label} — ${beat.purpose}${beat.openingHook ? " (~1–2 spoken seconds)" : ""}`,
    ),
    "",
    "Story structure narration rules:",
    ...STORY_STRUCTURE_NARRATION_RULES.map((rule) => `- ${rule}`),
  ];
}

export function buildStoryStructureStyleRules(mode: ScriptMode): string[] {
  const structure = resolveStoryStructureForMode(mode);

  return [
    `Follow the ${structure.arcLabel} arc in spoken order.`,
    "Opening line must be short, punchy, and land in roughly 1–2 spoken seconds.",
    "Never speak planning labels aloud (hook, story, conclusion, payoff, rank labels as chapter titles).",
    "End with a factual or emotional payoff — not generic social CTAs.",
  ];
}
