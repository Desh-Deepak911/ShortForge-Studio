/**
 * Story script prompt verification (run: npm run test:story-script-prompt).
 */
import assert from "node:assert/strict";

import {
  buildStoryScriptHookExampleJson,
  buildStoryScriptPrompt,
} from "@/lib/ai/prompts";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";
import {
  buildCompatibilityFallbackPlan,
  buildHookCandidate,
  buildHookPlanFromRequest,
  extractHookSubjectTokens,
  HOOK_CONTRACT_VERSION,
  HOOK_TEMPLATE_STRATEGY_PREFERENCES,
  normalizeHookRequest,
  openingPreservesHookSubject,
  resolveHookExampleSubjectAnchor,
  validateHookCandidate,
  type HookStrategyId,
} from "@/features/hook-engine";
import { CREATOR_TEMPLATE_IDS } from "@/features/creator-templates";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { ScriptMode } from "@/types/footiebitz";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function openingFromExample(exampleJson: string): string {
  const parsed = JSON.parse(exampleJson) as { narration: string };
  return parsed.narration.split(/(?<=[.!?])\s+/)[0] ?? "";
}

function assertExamplePassesPlan(
  topic: string,
  opening: string,
  plan: ReturnType<typeof buildHookPlanFromRequest>["plan"],
  request: ReturnType<typeof normalizeHookRequest>,
) {
  const candidate = buildHookCandidate({
    narration: `${opening} Body continues with clear spoken beats and a payoff.`,
    request,
    plan,
    origin: "model_narration_opening",
    claimRefs: [],
  });
  const validation = validateHookCandidate({ request, plan, candidate });
  assert.equal(
    validation.hardGatesPassed.safety,
    true,
    `safety gate failed for ${topic} / ${plan.strategyId}: ${validation.reasons.join(",")}`,
  );
  assert.equal(
    validation.openingLimitsPassed.wordLimit,
    true,
    `word limit failed for ${topic} / ${plan.strategyId}`,
  );
  assert.equal(
    validation.openingLimitsPassed.spokenDurationLimit,
    true,
    `spoken duration failed for ${topic} / ${plan.strategyId}`,
  );
  assert.equal(
    validation.strategyThresholdsPassed.provocativeness,
    true,
    `provocativeness failed for ${topic} / ${plan.strategyId}`,
  );
  assert.equal(
    validation.strategyThresholdsPassed.clarity,
    true,
    `clarity failed for ${topic} / ${plan.strategyId}`,
  );
  assert.ok(
    !validation.reasons.some((r) => r.startsWith("grounding.")),
    `grounding risk for ${topic} / ${plan.strategyId}: ${validation.reasons.join(",")}`,
  );
  assert.equal(
    openingPreservesHookSubject(topic, opening),
    true,
    `subject gate helper failed for ${topic}`,
  );
}

console.log("storyScriptPrompt");

const researchedContext = [
  "RESEARCHED FOOTBALL CONTEXT",
  "",
  "Mode: match recap",
  "Final score:",
  "- Final: Arsenal 2-1 Chelsea",
  "Warnings:",
  "- Exact xG unavailable from provider.",
].join("\n");

test("researched context uses factual grounding rules", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea",
    "tactical",
    30,
    "match_recap",
    researchedContext,
    getNarrationWordBudget(30),
  );

  assert.match(prompt, /Researched football context rules/);
  assert.match(prompt, /primary factual grounding/);
  assert.match(prompt, /Do NOT invent exact numbers/);
  assert.match(prompt, /Script length budget \(hard rules/);
  assert.match(prompt, /Target duration: 30s/);
  assert.match(prompt, /Ideal word count: 70–80/);
  assert.match(prompt, /Hard maximum word count: 105/);
  assert.match(prompt, /Do not exceed the hard maximum/);
  assert.match(prompt, /Shorter is better than complete/);
  assert.match(prompt, /Use research context selectively/);
  assert.match(prompt, /Prioritize the strongest 3–5 facts only/);
  assert.match(prompt, /30-second structure/);
  assert.match(prompt, /Short, punchy opening/);
  assert.match(prompt, /Tell the story of the game/);
});

test("ranked top_5 context disables selectivity and requires all players", () => {
  const rankedContext = [
    "RESEARCHED FOOTBALL CONTEXT",
    "",
    "RANKED PLAYER DATA:",
    "1. Miroslav Klose — Germany — 16",
    "2. Ronaldo Nazário — Brazil — 15",
  ].join("\n");

  const prompt = buildStoryScriptPrompt(
    "top 5 highest goal scorers fifa world cup",
    "news",
    45,
    "top_5",
    rankedContext,
    getNarrationWordBudget(45),
  );

  assert.match(prompt, /Top 5 ranked data rules \(mandatory — verified rankings present\)/);
  assert.match(prompt, /include every researched player name and goal total/);
  assert.doesNotMatch(prompt, /Prioritize the strongest 3–5 facts only/);
});

test("manual context keeps standard stats rules", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea",
    "dramatic",
    30,
    "story",
    "Manual note: high intensity derby.",
    getNarrationWordBudget(30),
  );

  assert.match(prompt, /Stats and context rules/);
  assert.doesNotMatch(prompt, /Researched football context rules/);
  assert.doesNotMatch(prompt, /Use research context selectively/);
  assert.match(prompt, /Manual note: high intensity derby/);
});

test("45s budget omits 30-second structure block", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea",
    "tactical",
    45,
    "match_preview",
    researchedContext,
    getNarrationWordBudget(45),
  );

  assert.match(prompt, /Target duration: 45s/);
  assert.match(prompt, /Hard maximum word count: 145/);
  assert.doesNotMatch(prompt, /30-second structure/);
});

test("dramatic tone includes length guard without expanding budget", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea",
    "dramatic",
    30,
    "match_recap",
    researchedContext,
    getNarrationWordBudget(30),
  );

  assert.match(prompt, /Dramatic tone must not increase length/);
});

test("mode voice is injected for tactical review", () => {
  const prompt = buildStoryScriptPrompt(
    "Arsenal vs Chelsea low block",
    "tactical",
    45,
    "tactical_review",
    researchedContext,
    getNarrationWordBudget(45),
  );

  assert.match(prompt, /Mode voice/);
  assert.match(prompt, /Analytical and pattern-led/);
  assert.match(prompt, /formations, pressing triggers/);
});

test("top_5 without ranked data uses missing-rankings rules", () => {
  const prompt = buildStoryScriptPrompt(
    "Top 5 Premier League strikers",
    "news",
    60,
    "top_5",
    researchedContext,
    getNarrationWordBudget(60),
  );

  assert.match(prompt, /Top 5 mode without ranked data \(mandatory/);
  assert.match(prompt, /Do NOT pretend to deliver a ranked top-5 countdown/);
  assert.match(prompt, /Do NOT use a ranked countdown with invented players/);
  assert.match(prompt, /State clearly that verified ranking data is unavailable/);
  assert.doesNotMatch(prompt, /Top 5 ranked data rules \(mandatory — verified rankings present\)/);
});

test("top_5 missing rankings with research attempted adds cautious fallback", () => {
  const prompt = buildStoryScriptPrompt(
    "Top 5 Premier League strikers",
    "news",
    60,
    "top_5",
    undefined,
    getNarrationWordBudget(60),
    { researchAttemptedWithoutData: true, top5RankedDataAvailable: false },
  );

  assert.match(prompt, /Top 5 mode without ranked data \(mandatory/);
  assert.match(prompt, /Football research unavailable/);
});

test("top_5 mode voice still applies when ranked data present", () => {
  const rankedContext = [
    "RESEARCHED FOOTBALL CONTEXT",
    "",
    "RANKED PLAYER DATA:",
    "1. Miroslav Klose — Germany — 16",
  ].join("\n");

  const prompt = buildStoryScriptPrompt(
    "Top 5 World Cup scorers",
    "news",
    60,
    "top_5",
    rankedContext,
    getNarrationWordBudget(60),
    { top5RankedDataAvailable: true },
  );

  assert.match(prompt, /Ranked and punchy/);
  assert.match(prompt, /Top 5 ranked data rules \(mandatory — verified rankings present\)/);
  assert.match(prompt, /Mention EVERY ranked item/);
  assert.match(prompt, /Keep the EXACT order/);
});

test("research unavailable uses cautious fallback rules", () => {
  const prompt = buildStoryScriptPrompt(
    "Cristiano Ronaldo FIFA World Cup 2026",
    "dramatic",
    30,
    "player_analysis",
    undefined,
    getNarrationWordBudget(30),
    true,
  );

  assert.match(prompt, /Football research unavailable/);
  assert.match(prompt, /Do NOT invent host nations, scores, teams, rankings, stats, or player availability/);
  assert.match(prompt, /USA, Canada, and Mexico/);
  assert.match(prompt, /never describe this as the Qatar World Cup/);
  assert.match(prompt, /stay qualitative and do not backfill facts from general knowledge/);
  assert.doesNotMatch(prompt, /Researched football context rules/);
});

test("7E.3A Hook example subject anchors align with validator (≥3 chars)", () => {
  const cases: Array<{
    topic: string;
    mode: ScriptMode;
    expectAnchorIncludes: string;
    rejectAnchor?: string;
  }> = [
    {
      topic: "FC Barcelona title story",
      mode: "story",
      expectAnchorIncludes: "Barcelona",
      rejectAnchor: "FC",
    },
    {
      topic: "AC Milan tactical review",
      mode: "tactical_review",
      expectAnchorIncludes: "Milan",
      rejectAnchor: "AC",
    },
    {
      topic: "AS Roma match recap",
      mode: "match_recap",
      expectAnchorIncludes: "Roma",
      rejectAnchor: "AS",
    },
    {
      topic: "São Paulo historical explainer",
      mode: "historical_explainer",
      expectAnchorIncludes: "Paulo",
    },
    {
      topic: "Real Madrid story",
      mode: "story",
      expectAnchorIncludes: "Real",
    },
    {
      topic: "Haaland player analysis",
      mode: "player_analysis",
      expectAnchorIncludes: "Haaland",
    },
  ];

  const directive =
    "HOOK DIRECTIVE (follow exactly — do not speak these labels aloud):\n- Strategy: Cold Open (cold_open@1.0.0)\n- Plan fingerprint: hp:test-fp\n- Opening word maximum (hard): 5\n- Opening spoken-seconds maximum (hard): 3";

  for (const row of cases) {
    const tokens = extractHookSubjectTokens(row.topic);
    assert.ok(
      tokens.every((t) => t.length >= 3),
      `validator tokens must be ≥3 for ${row.topic}`,
    );
    if (row.rejectAnchor) {
      assert.ok(
        !tokens.includes(row.rejectAnchor.toLowerCase()),
        `must not treat ${row.rejectAnchor} as subject token`,
      );
    }

    const { anchor, usedFallback } = resolveHookExampleSubjectAnchor(row.topic);
    assert.equal(usedFallback, false);
    assert.match(anchor, new RegExp(row.expectAnchorIncludes, "i"));

    const example = buildStoryScriptHookExampleJson(row.topic);
    const parsed = JSON.parse(example) as {
      title: string;
      narration: string;
      hookClaimRefs: string[];
    };
    assert.ok(Array.isArray(parsed.hookClaimRefs));
    assert.equal(parsed.hookClaimRefs.length, 0);

    const opening = openingFromExample(example);
    const openingWords = opening
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    assert.ok(openingWords.length <= 4, `opening >4 words for ${row.topic}`);
    assert.doesNotMatch(opening, /\d|€|\$|%|goals?|best|greatest|record|"/i);
    assert.doesNotMatch(opening, /\b(hook|beat|strategy|directive)\b/i);
    assert.match(opening, /Nobody saw .+ coming\./i);

    const prompt = buildStoryScriptPrompt(
      row.topic,
      "dramatic",
      30,
      row.mode,
      undefined,
      getNarrationWordBudget(30),
      { hookDirectiveBlock: directive, requireHookClaimRefs: true },
    );
    assert.doesNotMatch(prompt, /For decades, this rivalry/);
    assert.equal(
      (prompt.match(/HOOK DIRECTIVE \(follow exactly/g) ?? []).length,
      1,
    );

    const request = normalizeHookRequest({
      contractVersion: HOOK_CONTRACT_VERSION,
      topic: row.topic,
      scriptMode: row.mode,
      tone: "dramatic",
      durationSeconds: 30,
      generationPath: "script_only",
    });
    const { plan } = buildHookPlanFromRequest(request);
    assertExamplePassesPlan(row.topic, opening, plan, request);

    const compatPlan = buildCompatibilityFallbackPlan(request);
    assertExamplePassesPlan(row.topic, opening, compatPlan, request);
  }
});

test("7E.3A vacuous / edge topics use fallback anchor; subject gate still holds", () => {
  for (const topic of ["AI FC", "!!!", "ab", "  ", "FC AC AS"]) {
    const tokens = extractHookSubjectTokens(topic);
    const { anchor, usedFallback } = resolveHookExampleSubjectAnchor(topic);
    if (tokens.length === 0) {
      assert.equal(usedFallback, true);
      assert.equal(anchor, "Story");
    }
    const opening = openingFromExample(buildStoryScriptHookExampleJson(topic));
    assert.ok(openingPreservesHookSubject(topic, opening));
    assert.match(opening, /^Nobody saw .+ coming\.$/);
    const words = opening
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    assert.ok(words.length <= 4);
  }
});

test("7E.3A example passes ordinary mode-default and template strategy thresholds", () => {
  const modeTopics: Array<{ mode: ScriptMode; topic: string }> = [
    { mode: "story", topic: "FC Barcelona title story" },
    { mode: "tactical_review", topic: "AC Milan tactical review" },
    { mode: "match_recap", topic: "AS Roma match recap" },
    { mode: "historical_explainer", topic: "São Paulo historical explainer" },
    { mode: "player_analysis", topic: "Haaland player analysis" },
    { mode: "match_preview", topic: "Real Madrid story" },
    { mode: "top_5", topic: "World Cup scorers countdown" },
    { mode: "opinion_debate", topic: "Real Madrid story" },
  ];

  for (const { mode, topic } of modeTopics) {
    const opening = openingFromExample(buildStoryScriptHookExampleJson(topic));
    const request = normalizeHookRequest({
      contractVersion: HOOK_CONTRACT_VERSION,
      topic,
      scriptMode: mode,
      tone: "dramatic",
      durationSeconds: 30,
      generationPath: "script_only",
    });
    const { plan } = buildHookPlanFromRequest(request);
    assertExamplePassesPlan(topic, opening, plan, request);
  }

  for (const templateId of CREATOR_TEMPLATE_IDS) {
    const preferred = HOOK_TEMPLATE_STRATEGY_PREFERENCES[
      templateId as CreatorTemplateId
    ] as HookStrategyId | undefined;
    if (!preferred || preferred === "evidence_surprise") continue;
    const topic = "Real Madrid story";
    const opening = openingFromExample(buildStoryScriptHookExampleJson(topic));
    const request = normalizeHookRequest({
      contractVersion: HOOK_CONTRACT_VERSION,
      topic,
      scriptMode: "story",
      tone: "dramatic",
      durationSeconds: 30,
      generationPath: "script_only",
      templateId,
    });
    const { plan } = buildHookPlanFromRequest(request);
    assertExamplePassesPlan(topic, opening, plan, request);
  }
});

test("non-Hook prompt behavior unchanged — legacy example remains", () => {
  const nonHook = buildStoryScriptPrompt(
    "City derby",
    "dramatic",
    30,
    "story",
    undefined,
    getNarrationWordBudget(30),
  );
  assert.match(nonHook, /For decades, this rivalry/);
  assert.doesNotMatch(nonHook, /hookClaimRefs/);
});

console.log("\nAll story script prompt checks passed.");
