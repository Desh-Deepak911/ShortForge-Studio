/**
 * Story Structure Intelligence QA (run: npm run test:story-structure-intelligence-qa).
 *
 * Validates mode-specific story arcs, hook timing rules, and narration discipline
 * across Prompt Intelligence and direct script generation paths.
 */
import assert from "node:assert/strict";

import { buildStoryScriptPrompt } from "@/lib/ai/prompts";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import { buildNarrativePlan } from "@/features/intelligence/prompts/build-narrative-plan";
import { buildPromptIntelligence } from "@/features/intelligence/prompts/build-prompt-intelligence";
import { promptIntelligenceToPromptText } from "@/features/intelligence/prompts/prompt-intelligence-to-prompt";
import {
  resolveStoryStructureForMode,
  STORY_STRUCTURE_NARRATION_RULES,
} from "@/features/intelligence/prompts/story-structure-intelligence.utils";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";
import type { ScriptMode } from "@/types/footiebitz";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const baseConfidence = { tier: "high" as const, percent: 90, reasoning: "qa" };
const baseProvenance = { source: "static-fallback" as const, fetchedAt: new Date().toISOString() };

function buildMinimalGraphContext(input: {
  topic: string;
  mode: ScriptMode;
  withRankings?: boolean;
}): GraphContext {
  const rankedFacts =
    input.withRankings === true
      ? [5, 4, 3, 2, 1].map((rank) => ({
          id: `rank-${rank}`,
          text: `#${rank} Player ${rank} — ${rank} goals`,
          type: "ranking" as const,
          rank,
          value: rank,
          confidence: baseConfidence,
          provenance: { source: "static-fallback" as const },
        }))
      : [];

  return {
    queryId: `qa-${input.mode}`,
    topic: input.topic,
    selectedMode: input.mode,
    primaryEntities: [{ id: "player-1", label: "Test Player", kind: "player" }],
    rankedFacts,
    verifiedFacts: [
      {
        id: "verified-1",
        text: "Verified fact for QA context.",
        type: "verified",
        confidence: baseConfidence,
        provenance: baseProvenance,
      },
    ],
    timelineFacts: [
      {
        id: "event-1",
        text: "67' — decisive moment in the match.",
        type: "event",
        confidence: baseConfidence,
        provenance: baseProvenance,
      },
    ],
    statisticFacts: [
      {
        id: "stat-1",
        text: "Possession split: 58% vs 42%.",
        type: "statistic",
        confidence: baseConfidence,
        provenance: baseProvenance,
      },
    ],
    fixtureFacts: [
      {
        id: "fixture-1",
        text: "Arsenal vs Chelsea — Premier League.",
        type: "fixture",
        confidence: baseConfidence,
        provenance: baseProvenance,
      },
    ],
    entitySummaries: [
      {
        id: "entity-summary-1",
        label: "Test Player",
        kind: "player",
        lines: ["Leading scorer this season."],
        factIds: ["verified-1"],
      },
    ],
    relationshipSummaries: [],
    groundingRules: ["Only use facts listed in this research context."],
    warnings: [],
    confidence: baseConfidence,
    provenance: baseProvenance,
    diagnostics: {
      nodeCount: 0,
      edgeCount: 0,
      factCount: 4,
      verifiedFactCount: 1,
      rankedFactCount: rankedFacts.length,
      timelineFactCount: 1,
      statisticFactCount: 1,
      fixtureFactCount: 1,
      entitySummaryCount: 1,
      relationshipSummaryCount: 0,
      providerDiagnostics: [],
    },
  };
}

interface StoryStructureQaCase {
  label: string;
  topic: string;
  mode: ScriptMode;
  durationSeconds: number;
  expectedArcLabel: string;
  expectedOpeningBeatId: string;
  withRankings?: boolean;
}

const QA_CASES: StoryStructureQaCase[] = [
  {
    label: "30s Player Analysis",
    topic: "Erling Haaland form analysis",
    mode: "player_analysis",
    durationSeconds: 30,
    expectedArcLabel: "Hook → Performance Story → Legacy/Impact Conclusion",
    expectedOpeningBeatId: "opening-grab",
  },
  {
    label: "45s Top 5",
    topic: "top 5 Premier League scorers",
    mode: "top_5",
    durationSeconds: 45,
    expectedArcLabel: "Countdown Hook → Ranked Beats → Final Reveal",
    expectedOpeningBeatId: "countdown-opening",
    withRankings: true,
  },
  {
    label: "30s Tactical",
    topic: "Arsenal low block vs Chelsea",
    mode: "tactical_review",
    durationSeconds: 30,
    expectedArcLabel: "Bold Claim Hook → Tactical Explanation → Evidence → Takeaway",
    expectedOpeningBeatId: "bold-claim",
  },
  {
    label: "40s Match Preview",
    topic: "Manchester City vs Arsenal preview",
    mode: "match_preview",
    durationSeconds: 40,
    expectedArcLabel: "Question Hook → Stakes → Key Battle → Prediction/CTA",
    expectedOpeningBeatId: "question-opening",
  },
  {
    label: "30s Opinion",
    topic: "Should Ronaldo start for Portugal?",
    mode: "opinion_debate",
    durationSeconds: 30,
    expectedArcLabel: "Debate Hook → Argument → Counterpoint → Takeaway",
    expectedOpeningBeatId: "debate-opening",
  },
];

function assertNarrationDiscipline(text: string, label: string): void {
  assert.match(text, /1–2 spoken seconds|~1–2 spoken seconds/i, `${label}: missing hook timing rule`);
  assert.match(
    text,
    /Do not say the words “hook”, “story”, “conclusion”/i,
    `${label}: missing narration label ban`,
  );
  assert.match(
    text,
    /not generic.*like.*subscribe|not generic calls to like/i,
    `${label}: missing anti-CTA conclusion rule`,
  );
}

console.log("storyStructureIntelligenceQa");

test("all modes map to canonical story structure definitions", () => {
  const modes: ScriptMode[] = [
    "player_analysis",
    "match_preview",
    "match_recap",
    "tactical_review",
    "top_5",
    "opinion_debate",
    "historical_explainer",
    "story",
  ];

  for (const mode of modes) {
    const structure = resolveStoryStructureForMode(mode);
    assert.ok(structure.beats.length >= 3, `${mode} should have at least 3 beats`);
    assert.ok(
      structure.beats.some((beat) => beat.openingHook),
      `${mode} should define an opening grab beat`,
    );
  }
});

for (const qaCase of QA_CASES) {
  test(`${qaCase.label}: narrative plan uses mode arc`, () => {
    const graphContext = buildMinimalGraphContext({
      topic: qaCase.topic,
      mode: qaCase.mode,
      withRankings: qaCase.withRankings,
    });

    const plan = buildNarrativePlan({
      graphContext,
      targetDurationSeconds: qaCase.durationSeconds,
    });

    assert.equal(plan.structureLabel, qaCase.expectedArcLabel);
    assert.ok(plan.beats.length >= 3, "plan should have multiple beats");

    const openingBeat = plan.beats.find((beat) => beat.openingHook);
    assert.ok(openingBeat, "opening beat should be marked");
    assert.equal(openingBeat?.id, qaCase.expectedOpeningBeatId);
    assert.ok(
      (openingBeat?.targetWordCount ?? 99) <= 8,
      `opening beat should be capped for ~1–2s (${openingBeat?.targetWordCount} words)`,
    );

    const budget = getNarrationWordBudget(qaCase.durationSeconds);
    const beatTotal = plan.beats.reduce((sum, beat) => sum + beat.targetWordCount, 0);
    assert.ok(
      beatTotal <= budget.hardCapWords,
      `beat allocations should respect hard cap (${beatTotal} > ${budget.hardCapWords})`,
    );
  });

  test(`${qaCase.label}: prompt intelligence includes story structure`, () => {
    const graphContext = buildMinimalGraphContext({
      topic: qaCase.topic,
      mode: qaCase.mode,
      withRankings: qaCase.withRankings,
    });

    const result = buildPromptIntelligence({
      graphContext,
      targetDurationSeconds: qaCase.durationSeconds,
    });
    const promptText = promptIntelligenceToPromptText({ result, graphContext });

    assert.match(promptText, /NARRATIVE PLAN/i);
    assert.match(promptText, new RegExp(qaCase.expectedArcLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(promptText, /STORY STRUCTURE RULES/i);

    for (const rule of STORY_STRUCTURE_NARRATION_RULES) {
      assert.match(promptText, new RegExp(rule.slice(0, 24)));
    }

    assertNarrationDiscipline(promptText, qaCase.label);
  });

  test(`${qaCase.label}: direct script prompt includes story structure`, () => {
    const researchedContext =
      qaCase.withRankings === true
        ? [
            "RESEARCHED FOOTBALL CONTEXT",
            "",
            "RANKED PLAYER DATA:",
            "5. Player 5 — 5 goals",
            "1. Player 1 — 10 goals",
          ].join("\n")
        : undefined;

    const prompt = buildStoryScriptPrompt(
      qaCase.topic,
      "dramatic",
      qaCase.durationSeconds,
      qaCase.mode,
      researchedContext,
      getNarrationWordBudget(qaCase.durationSeconds),
      qaCase.withRankings === true ? { top5RankedDataAvailable: true } : false,
    );

    assert.match(prompt, new RegExp(qaCase.expectedArcLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(prompt, /Story structure narration rules/i);
    assertNarrationDiscipline(prompt, qaCase.label);
    assert.match(prompt, /Do not say planning labels aloud/i);
  });
}

console.log("\nAll story structure intelligence checks passed.");
