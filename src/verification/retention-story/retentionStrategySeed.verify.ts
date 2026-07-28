/**
 * Sprint 10C / 10C.1 / 10C.1A — Controlling Idea + Emotional Arc strategy verification.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  RETENTION_MAX_CONTROLLING_IDEA_CHARS,
  RetentionStoryError,
  assembleDeterministicControllingIdeaStatement,
  assertRetentionStrategySeedCoherence,
  bindEmotionalArcBlueprintToBeatIds,
  buildControllingIdeaCandidateId,
  buildControllingIdeaCandidates,
  buildDeterministicRetentionStrategySeed,
  buildEmotionalArcBlueprint,
  buildRetentionSemanticIdentity,
  buildRetentionStrategySeedFingerprint,
  claimRelevantToRetentionTopic,
  detectRetentionFactualRisk,
  extractRetentionSubjectTokens,
  finalizeRetentionGroundingClaims,
  listControllingIdeaModeStrategies,
  listRetentionEmotions,
  listRetentionFormatStrategyProfiles,
  normalizeRetentionGroundingContext,
  normalizeRetentionStrategyProposal,
  normalizeStoryContract,
  selectControllingIdea,
  statementPreservesRetentionSubject,
  validateControllingIdea,
  validateEmotionalArcBlueprint,
  validateRetentionStrategyPlanningInput,
  type BuildRetentionStrategySeedInput,
  type ControllingIdeaCandidate,
  type RetentionGroundingContext,
  type StoryContractInput,
} from "@/features/retention-story";
import { SCRIPT_MODES, type Tone } from "@/types/footiebitz";

const ROOT = path.resolve(__dirname, "../..");
const STRATEGY_ROOT = path.join(ROOT, "features/retention-story/strategy");

let passed = 0;

function check(label: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function emptyGrounding(): RetentionGroundingContext {
  return normalizeRetentionGroundingContext({
    version: 1,
    claims: [],
    researchIdentity: null,
  });
}

function baseContractInput(
  overrides: Partial<StoryContractInput> = {},
): StoryContractInput {
  return {
    topic: "Haaland Premier League impact",
    durationSec: 30,
    generationPath: "script_only",
    scriptMode: "story",
    tone: "dramatic",
    desiredReaction: "curiosity",
    ...overrides,
  };
}

function planningPair(
  overrides: Partial<StoryContractInput> = {},
  grounding?: RetentionGroundingContext,
): BuildRetentionStrategySeedInput {
  const g =
    grounding ??
    ({
      version: 1 as const,
      claims: Object.freeze([]),
      researchIdentity: null,
    } satisfies RetentionGroundingContext);

  const contract = normalizeStoryContract({
    ...baseContractInput(overrides),
    grounding:
      g.claims.length > 0 || g.researchIdentity
        ? g
        : overrides.grounding,
    researchIdentity:
      g.claims.length > 0
        ? undefined
        : (overrides.researchIdentity ?? g.researchIdentity ?? undefined),
  });

  const strategyGrounding = normalizeRetentionGroundingContext(
    g.claims.length > 0
      ? g
      : {
          version: 1,
          claims: [],
          researchIdentity: contract.groundingSummary.researchIdentity,
        },
  );

  return {
    contract,
    grounding: strategyGrounding,
    manualContext: overrides.manualContext ?? null,
    userInstructions: overrides.userInstructions ?? null,
  };
}

function eligibleClaimGrounding(
  claims: Array<{
    id: string;
    text: string;
    role?: string;
  }>,
): RetentionGroundingContext {
  return finalizeRetentionGroundingClaims(
    claims.map((c) => ({
      claimId: c.id,
      text: c.text,
      provenance: "research_provider" as const,
      verification: "verified" as const,
      permittedFactualUse: true,
      forbidden: false,
      hasAuthoritativeId: true,
      ...(c.role ? { piFactRole: c.role } : {}),
    })),
  );
}

console.log("\nretention-strategy-seed (Sprint 10C)\n");

console.log("input-coherence");
check("matching normalized contract/grounding", () => {
  const input = planningPair();
  const ctx = validateRetentionStrategyPlanningInput(input);
  assert.equal(ctx.contract.contractFingerprint, input.contract.contractFingerprint);
  const result = buildDeterministicRetentionStrategySeed(input);
  assert.equal(result.status, "ready");
});

check("research identity mismatch", () => {
  const input = planningPair();
  const forged = normalizeRetentionGroundingContext({
    version: 1,
    researchIdentity: null,
    claims: [
      {
        claimId: "x1",
        text: "Haaland scored 36 league goals.",
        provenance: "research_provider",
        verification: "verified",
        permittedFactualUse: true,
        forbidden: false,
      },
    ],
  });
  assert.throws(
    () =>
      validateRetentionStrategyPlanningInput({
        contract: input.contract,
        grounding: forged,
      }),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "grounding_summary_mismatch",
  );
});

check("claim-count / eligible / forbidden mismatches", () => {
  const grounding = eligibleClaimGrounding([
    { id: "h1", text: "Haaland changes the Premier League contest." },
  ]);
  const contract = normalizeStoryContract(
    baseContractInput({ grounding, topic: "Haaland Premier League impact" }),
  );
  assert.throws(
    () =>
      validateRetentionStrategyPlanningInput({
        contract,
        grounding: emptyGrounding(),
      }),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "grounding_summary_mismatch",
  );

  const withForbidden = finalizeRetentionGroundingClaims([
    {
      claimId: "h1",
      text: "Haaland changes the Premier League contest.",
      provenance: "research_provider",
      verification: "verified",
      permittedFactualUse: true,
      forbidden: false,
      hasAuthoritativeId: true,
    },
    {
      claimId: "bad",
      text: "best player of all time",
      provenance: "unknown",
      verification: "forbidden",
      permittedFactualUse: false,
      forbidden: true,
      hasAuthoritativeId: true,
    },
  ]);
  const contractForbidden = normalizeStoryContract(
    baseContractInput({
      topic: "Haaland Premier League impact",
      grounding: withForbidden,
    }),
  );
  assert.throws(
    () =>
      validateRetentionStrategyPlanningInput({
        contract: contractForbidden,
        grounding,
      }),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "grounding_summary_mismatch",
  );
});

check("manual-context and user-instruction identity mismatch", () => {
  const input = planningPair({
    manualContext: "Focus on pressing",
    userInstructions: "Keep it tense",
  });
  assert.throws(
    () =>
      validateRetentionStrategyPlanningInput({
        ...input,
        manualContext: "Different manual text",
      }),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "creator_context_identity_mismatch",
  );
  assert.throws(
    () =>
      validateRetentionStrategyPlanningInput({
        ...input,
        userInstructions: "Different instructions",
      }),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "creator_context_identity_mismatch",
  );
});

check("opaque zero-claim research identity", () => {
  const opaque = buildRetentionSemanticIdentity(
    { kind: "opaque_fixture", seed: "strategy" },
    "rsr:",
  );
  const contract = normalizeStoryContract(
    baseContractInput({ researchIdentity: opaque, topic: "Real Madrid legacy" }),
  );
  const result = buildDeterministicRetentionStrategySeed({
    contract,
    grounding: { version: 1, claims: [], researchIdentity: opaque },
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.seed.controllingIdeaClaimRefs.length, 0);
    assert.equal(result.seed.controllingIdeaSource, "deterministic_mode_strategy");
  }
});

check("scenes-only skipped", () => {
  const contract = normalizeStoryContract(
    baseContractInput({ generationPath: "scenes_only", topic: "AC Milan rivalry" }),
  );
  const result = buildDeterministicRetentionStrategySeed({
    contract,
    grounding: emptyGrounding(),
  });
  assert.deepEqual(result, { status: "skipped", reason: "scenes_only" });
});

console.log("subject-anchoring");
check("subject tokens for football topics", () => {
  const cases: Array<[string, string[]]> = [
    ["Spain vs France", ["france", "spain"]],
    ["FC Barcelona", ["barcelona", "fc"]],
    ["AC Milan", ["ac", "milan"]],
    ["AS Roma", ["as", "roma"]],
    ["São Paulo", ["paulo", "sao"]],
    ["Real Madrid", ["madrid", "real"]],
    ["Haaland", ["haaland"]],
    ["AI FC", ["ai", "fc"]],
  ];
  for (const [topic, expected] of cases) {
    assert.deepEqual([...extractRetentionSubjectTokens(topic)], expected);
    const statement = assembleDeterministicControllingIdeaStatement("story", topic);
    assert.equal(statementPreservesRetentionSubject(topic, statement), true);
  }
  assert.deepEqual(extractRetentionSubjectTokens("!!! ??? ---"), []);
  assert.deepEqual(extractRetentionSubjectTokens("a|b|c|||"), []);
});

check("no meaningful anchor fails safely", () => {
  const contract = normalizeStoryContract(
    baseContractInput({ topic: "the and for with" }),
  );
  assert.throws(
    () =>
      validateRetentionStrategyPlanningInput({
        contract,
        grounding: emptyGrounding(),
      }),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_controlling_idea",
  );
});

console.log("controlling-ideas");
check("all ScriptModes produce deterministic seeds", () => {
  for (const scriptMode of SCRIPT_MODES) {
    const input = planningPair({
      scriptMode,
      topic: "Spain vs France tactical battle",
    });
    const result = buildDeterministicRetentionStrategySeed(input);
    assert.equal(result.status, "ready", scriptMode);
    if (result.status === "ready") {
      assert.equal(result.seed.controllingIdea.mustPreserveThroughCompression, true);
      assert.ok(
        statementPreservesRetentionSubject(
          input.contract.topic,
          result.seed.controllingIdea.statement,
        ),
      );
    }
  }
  assert.equal(listControllingIdeaModeStrategies().length, SCRIPT_MODES.length);
});

check("all production-capable format strategies", () => {
  for (const profile of listRetentionFormatStrategyProfiles()) {
    if (!profile.productionCapable) continue;
    const input = planningPair({
      formatStrategyId: profile.id,
      durationSec: profile.id === "extended_short" ? 45 : 30,
      topic: "FC Barcelona rebuild",
    });
    const result = buildDeterministicRetentionStrategySeed(input);
    assert.equal(result.status, "ready", profile.id);
  }
});

check("PI-required relevant claim wins; unrelated eligible does not hijack", () => {
  const grounding = eligibleClaimGrounding([
    {
      id: "unrelated",
      text: "Weather delayed kickoff across another continent.",
    },
    {
      id: "required-h",
      text: "Haaland pressing forces the Premier League contest open.",
      role: "required",
    },
    {
      id: "other-h",
      text: "Haaland movement stretches Premier League defensive lines.",
      role: "optional",
    },
  ]);
  const input = planningPair(
    { topic: "Haaland Premier League impact", scriptMode: "player_analysis" },
    grounding,
  );
  const result = buildDeterministicRetentionStrategySeed(input);
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.seed.controllingIdeaSource, "grounded_claim");
    assert.deepEqual([...result.seed.controllingIdeaClaimRefs], ["required-h"]);
  }

  const unrelatedOnly = eligibleClaimGrounding([
    {
      id: "unrelated2",
      text: "A distant cup final had twelve corners.",
    },
  ]);
  const input2 = planningPair(
    { topic: "Haaland Premier League impact", scriptMode: "story" },
    unrelatedOnly,
  );
  const result2 = buildDeterministicRetentionStrategySeed(input2);
  assert.equal(result2.status, "ready");
  if (result2.status === "ready") {
    assert.equal(result2.seed.controllingIdeaSource, "deterministic_mode_strategy");
  }
});

check("manual/inferred/unknown/forbidden never provide factual support", () => {
  const grounding = finalizeRetentionGroundingClaims([
    {
      claimId: "manual1",
      text: "Haaland is clearly overrated in my view.",
      provenance: "manual_user",
      verification: "unverified",
      permittedFactualUse: false,
      forbidden: false,
      hasAuthoritativeId: true,
    },
    {
      claimId: "inf1",
      text: "Haaland will win the next Ballon d'Or.",
      provenance: "inferred",
      verification: "unverified",
      permittedFactualUse: false,
      forbidden: false,
      hasAuthoritativeId: true,
    },
    {
      claimId: "unk1",
      text: "Haaland scored 50 goals somehow.",
      provenance: "unknown",
      verification: "unverified",
      permittedFactualUse: false,
      forbidden: false,
      hasAuthoritativeId: true,
    },
    {
      claimId: "forb1",
      text: "Haaland is the best player ever.",
      provenance: "unknown",
      verification: "forbidden",
      permittedFactualUse: false,
      forbidden: true,
      hasAuthoritativeId: true,
    },
  ]);
  const input = planningPair(
    { topic: "Haaland Premier League impact" },
    grounding,
  );
  const result = buildDeterministicRetentionStrategySeed(input);
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.seed.controllingIdeaSource, "deterministic_mode_strategy");
    assert.equal(result.seed.controllingIdeaClaimRefs.length, 0);
  }

  const forbiddenAsIdea = validateControllingIdea({
    statement: "Haaland is the best player ever.",
    topic: "Haaland Premier League impact",
    claimRefs: [],
    grounding,
  });
  assert.equal(forbiddenAsIdea.ok, false);
  assert.ok(forbiddenAsIdea.reasons.includes("forbidden_claim_text"));
});

check("bare match-result language is factual risk without requiring digits", () => {
  for (const statement of [
    "Spain beat France",
    "Spain defeated France",
    "Spain won against France",
    "France lost to Spain",
    "Spain schooled France",
    "Spain beat the Netherlands",
    "Spain won the final",
    "Spain secured victory",
    "Spain suffered defeat",
  ] as const) {
    const risk = detectRetentionFactualRisk(statement);
    assert.equal(risk.risky, true, statement);
    assert.ok(risk.signals.includes("match_result"), statement);
  }
  // Tactical / idiomatic / non-result objects must not be treated as match results.
  for (const statement of [
    "How Spain can beat the press",
    "How Spain beat the high press",
    "Spain raced to beat the clock",
    "Spain found a way to beat the odds",
    "Spain won the ball",
    "Spain lost the ball",
    "Spain drew the defender",
  ] as const) {
    assert.equal(
      detectRetentionFactualRisk(statement).risky,
      false,
      statement,
    );
  }
});

check("factual-risk requires eligible refs; unknown refs rejected", () => {
  const grounding = eligibleClaimGrounding([
    {
      id: "stat1",
      text: "Haaland scored 36 Premier League goals.",
    },
  ]);
  const risk = detectRetentionFactualRisk(
    "Haaland scored 36 Premier League goals.",
  );
  assert.equal(risk.risky, true);

  assert.equal(
    validateControllingIdea({
      statement: "Haaland scored 36 Premier League goals.",
      topic: "Haaland Premier League impact",
      claimRefs: ["stat1"],
      grounding,
    }).ok,
    true,
  );

  assert.ok(
    validateControllingIdea({
      statement: "Haaland scored 36 Premier League goals.",
      topic: "Haaland Premier League impact",
      claimRefs: [],
      grounding,
    }).reasons.includes("factual_risk_without_refs"),
  );

  assert.ok(
    validateControllingIdea({
      statement: "Haaland scored 36 Premier League goals.",
      topic: "Haaland Premier League impact",
      claimRefs: ["missing-id"],
      grounding,
    }).reasons.includes("unknown_claim_ref"),
  );
});

check("multi-thesis / generic intro / over-limit rejected", () => {
  const g = emptyGrounding();
  const topic = "Real Madrid legacy";
  assert.equal(
    validateControllingIdea({
      statement:
        "Real Madrid dominates Europe; Real Madrid also fails in cups.",
      topic,
      grounding: g,
    }).ok,
    false,
  );
  assert.equal(
    validateControllingIdea({
      statement: "In this video we explore Real Madrid legacy deeply today.",
      topic,
      grounding: g,
    }).ok,
    false,
  );
  assert.ok(
    validateControllingIdea({
      statement: "a".repeat(RETENTION_MAX_CONTROLLING_IDEA_CHARS + 1),
      topic,
      grounding: g,
    }).reasons.includes("too_many_chars"),
  );
});

check("candidate order does not change selection; IDs stable; immutability", () => {
  const grounding = eligibleClaimGrounding([
    {
      id: "b-claim",
      text: "Haaland pressing reshapes the Premier League contest.",
      role: "optional",
    },
    {
      id: "a-claim",
      text: "Haaland movement defines the Premier League contest.",
      role: "required",
    },
  ]);
  const input = planningPair(
    { topic: "Haaland Premier League impact", scriptMode: "player_analysis" },
    grounding,
  );
  const ctx = validateRetentionStrategyPlanningInput(input);
  const candidates = buildControllingIdeaCandidates(ctx);
  const reversed = Object.freeze([...candidates].reverse());
  const selA = selectControllingIdea(candidates, ctx);
  const selB = selectControllingIdea(reversed, ctx);
  assert.equal(selA.selectedCandidateId, selB.selectedCandidateId);
  assert.deepEqual([...selA.claimRefs], [...selB.claimRefs]);

  const frozen = candidates[0]!;
  assert.ok(Object.isFrozen(frozen));
  try {
    (frozen as { statement: string }).statement = "mutated";
  } catch {
    /* ignore */
  }
  assert.notEqual(frozen.statement, "mutated");

  const again = buildControllingIdeaCandidates(ctx);
  assert.deepEqual(
    again.map((c) => c.candidateId),
    candidates.map((c) => c.candidateId),
  );
});

console.log("emotional-blueprint");
check("tones, reactions, formats → valid progressing blueprints", () => {
  const tones: Tone[] = ["dramatic", "funny", "tactical", "news", "emotional"];
  const reactions = [
    "curiosity",
    "surprise",
    "debate",
    "awe",
    "satisfaction",
    "urgency",
  ] as const;

  for (const tone of tones) {
    for (const desiredReaction of reactions) {
      for (const profile of listRetentionFormatStrategyProfiles()) {
        if (!profile.productionCapable) continue;
        const input = planningPair({
          tone,
          desiredReaction,
          formatStrategyId: profile.id,
          durationSec: profile.id === "extended_short" ? 50 : 30,
          topic: "AS Roma derby tension",
        });
        const blueprint = buildEmotionalArcBlueprint(input.contract);
        assert.equal(validateEmotionalArcBlueprint(blueprint).length, 0);
        assert.equal(blueprint.curve.length, 4);
        assert.deepEqual(
          blueprint.curve.map((p) => p.phase),
          ["opening", "build", "turn", "payoff"],
        );
        assert.ok(
          blueprint.curve.every((p) => p.intensity >= 1 && p.intensity <= 5),
        );
        assert.ok(
          (blueprint.curve.find((p) => p.phase === "payoff")?.intensity ?? 0) >=
            4,
        );
        if (blueprint.secondaryEmotion) {
          assert.notEqual(
            blueprint.secondaryEmotion,
            blueprint.primaryEmotion,
          );
        }
        const again = buildEmotionalArcBlueprint(input.contract);
        assert.equal(again.blueprintFingerprint, blueprint.blueprintFingerprint);
      }
    }
  }
  assert.ok(listRetentionEmotions().length >= 8);
  assert.ok(Object.isFrozen(listRetentionEmotions()));
});

console.log("planner-proposal");
check("proposal normalization seam", () => {
  const input = planningPair({ topic: "São Paulo identity shift" });
  const ctx = validateRetentionStrategyPlanningInput(input);
  const statement = assembleDeterministicControllingIdeaStatement(
    "story",
    input.contract.topic,
  );

  const valid = normalizeRetentionStrategyProposal(
    {
      controllingIdea: statement,
      reasoning: "SECRET_CHAIN",
      chainOfThought: "do not persist",
      critique: "ignore",
    },
    ctx,
  );
  assert.equal(valid.controllingIdeaSource, "planner_model_proposal");
  assert.equal(valid.controllingIdea.statement, statement);
  assert.ok(!JSON.stringify(valid).includes("SECRET_CHAIN"));
  assert.ok(!JSON.stringify(valid).includes("do not persist"));
  assert.equal(
    valid.emotionalArcBlueprint.primaryEmotion,
    buildEmotionalArcBlueprint(input.contract).primaryEmotion,
  );

  assert.throws(
    () =>
      normalizeRetentionStrategyProposal(
        { controllingIdea: statement, primaryEmotion: "rage" },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_strategy_proposal",
  );

  assert.throws(
    () =>
      normalizeRetentionStrategyProposal(
        {
          controllingIdea: statement,
          curve: [
            { phase: "opening", emotion: "curiosity", intensity: 3 },
            { phase: "opening", emotion: "curiosity", intensity: 4 },
            { phase: "turn", emotion: "tension", intensity: 4 },
            { phase: "payoff", emotion: "satisfaction", intensity: 5 },
          ],
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_strategy_proposal",
  );

  assert.throws(
    () =>
      normalizeRetentionStrategyProposal(
        {
          controllingIdea: statement,
          curve: [
            { phase: "opening", emotion: "curiosity", intensity: 3 },
            { phase: "build", emotion: "curiosity", intensity: 9 },
            { phase: "turn", emotion: "tension", intensity: 4 },
            { phase: "payoff", emotion: "satisfaction", intensity: 5 },
          ],
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_strategy_proposal",
  );

  assert.throws(
    () =>
      normalizeRetentionStrategyProposal(
        {
          controllingIdea: "Haaland scored 36 goals without any support.",
          controllingIdeaClaimRefs: [],
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_strategy_proposal",
  );

  assert.throws(
    () =>
      normalizeRetentionStrategyProposal(
        {
          controllingIdea: statement,
          controllingIdeaClaimRefs: ["nope"],
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_strategy_proposal",
  );

  assert.throws(
    () => normalizeRetentionStrategyProposal(null, ctx),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_strategy_proposal",
  );

  assert.throws(
    () =>
      normalizeRetentionStrategyProposal(
        {
          controllingIdea: `${statement} ${"word ".repeat(40)}`,
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_strategy_proposal",
  );
});

check("strategy seed fingerprint stable and sensitive", () => {
  const a = planningPair({
    topic: "Real Madrid European nights",
    tone: "dramatic",
    desiredReaction: "awe",
  });
  const b = planningPair({
    topic: "Real Madrid European nights",
    tone: "dramatic",
    desiredReaction: "awe",
  });
  const ra = buildDeterministicRetentionStrategySeed(a);
  const rb = buildDeterministicRetentionStrategySeed(b);
  assert.equal(ra.status, "ready");
  assert.equal(rb.status, "ready");
  if (ra.status === "ready" && rb.status === "ready") {
    assert.equal(
      ra.seed.strategySeedFingerprint,
      rb.seed.strategySeedFingerprint,
    );
  }

  const c = planningPair({
    topic: "Real Madrid European nights",
    tone: "funny",
    desiredReaction: "awe",
  });
  const rc = buildDeterministicRetentionStrategySeed(c);
  assert.equal(rc.status, "ready");
  if (ra.status === "ready" && rc.status === "ready") {
    assert.notEqual(
      ra.seed.strategySeedFingerprint,
      rc.seed.strategySeedFingerprint,
    );
  }
});

console.log("boundaries");
check("no Hook/SI/NarrativeBeat/generation imports; no env; no fake beat IDs", () => {
  const files = collectTsFiles(STRATEGY_ROOT);
  const forbidden = [
    /from ["']@\/features\/hook-engine["']/,
    /from ["']@\/features\/hook-engine\/domain/,
    /from ["']@\/features\/hook-engine\/validation/,
    /from ["']@\/features\/hook-engine\/repair/,
    /from ["']@\/features\/hook-engine\/strategies/,
    /from ["']@\/features\/hook-engine\/integration/,
    /hook-subject-tokens/,
    /NarrativeBeat/,
    /studio-intelligence/i,
    /generateRawStoryScript|generateHookedNarration|assembledContextToPrompt/,
    /process\.env/,
    /openai/i,
    /placeholder-beat/,
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(src), false, `${file} matched ${pattern}`);
    }
  }
  const seedSrc = readFileSync(
    path.join(STRATEGY_ROOT, "build-retention-strategy-seed.ts"),
    "utf8",
  );
  assert.equal(/atBeatId/.test(seedSrc), false);
  assert.equal(/RetentionStoryPlan/.test(seedSrc), false);
});

check("no model call surface in strategy module", () => {
  const files = collectTsFiles(STRATEGY_ROOT);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.equal(
      /fetch\(|OpenAI|chat\.completions|generateText/i.test(src),
      false,
    );
  }
});

// --- 10C.1 Authority hardening ---
console.log("10c1-exact-subject-tokens");
check("exact subject-token authority (no substring false positives)", () => {
  assert.equal(
    statementPreservesRetentionSubject(
      "AC Milan",
      "A tactical system changes control.",
    ),
    false,
  );
  assert.equal(
    statementPreservesRetentionSubject(
      "AS Roma",
      "This has nothing to do with tactics.",
    ),
    false,
  );
  assert.equal(
    statementPreservesRetentionSubject(
      "AI FC",
      "Fair play changes everything.",
    ),
    false,
  );
  assert.equal(
    statementPreservesRetentionSubject(
      "AC Milan",
      "AC Milan changes the wider contest.",
    ),
    true,
  );
  assert.equal(
    statementPreservesRetentionSubject(
      "AS Roma",
      "Roma changes the wider contest.",
    ),
    true,
  );
  assert.equal(
    statementPreservesRetentionSubject(
      "São Paulo",
      "Sao Paulo changes direction.",
    ),
    true,
  );
  assert.equal(
    claimRelevantToRetentionTopic(
      "AC Milan",
      "A tactical system changes control.",
    ),
    false,
  );
  assert.equal(
    claimRelevantToRetentionTopic("AS Roma", "This has nothing to do with tactics."),
    false,
  );
  assert.equal(
    claimRelevantToRetentionTopic("AI FC", "Fair play changes everything."),
    false,
  );
});

console.log("10c1-claim-support");
check("factual claim-support requires exact normalized statement equality", () => {
  const pressing = eligibleClaimGrounding([
    {
      id: "press1",
      text: "Haaland pressing forces the Premier League contest open.",
    },
  ]);
  const goals36 = eligibleClaimGrounding([
    {
      id: "goals36",
      text: "Haaland scored 36 Premier League goals.",
    },
  ]);

  assert.ok(
    validateControllingIdea({
      statement: "Haaland scored 99 goals.",
      topic: "Haaland Premier League impact",
      claimRefs: ["press1"],
      grounding: pressing,
    }).reasons.includes("claim_ref_does_not_support_statement"),
  );

  assert.ok(
    validateControllingIdea({
      statement: "Haaland scored 99 goals.",
      topic: "Haaland Premier League impact",
      claimRefs: ["goals36"],
      grounding: goals36,
    }).reasons.includes("claim_ref_does_not_support_statement"),
  );

  assert.equal(
    validateControllingIdea({
      statement: "Haaland scored 36 Premier League goals.",
      topic: "Haaland Premier League impact",
      claimRefs: ["goals36"],
      grounding: goals36,
    }).ok,
    true,
  );

  assert.equal(
    validateControllingIdea({
      statement: "Haaland scored 36 Premier League goals.",
      topic: "Haaland Premier League impact",
      claimRefs: ["goals36", "goals36"],
      grounding: goals36,
    }).ok,
    true,
  );

  const manual = finalizeRetentionGroundingClaims([
    {
      claimId: "manual1",
      text: "Haaland scored 36 Premier League goals.",
      provenance: "manual_user",
      verification: "unverified",
      permittedFactualUse: false,
      forbidden: false,
      hasAuthoritativeId: true,
    },
  ]);
  assert.ok(
    !validateControllingIdea({
      statement: "Haaland scored 36 Premier League goals.",
      topic: "Haaland Premier League impact",
      claimRefs: ["manual1"],
      grounding: manual,
    }).ok,
  );
});

console.log("10c1-candidate-coherence");
check("stale/forged candidates fail closed; order-independent selection", () => {
  const grounding = eligibleClaimGrounding([
    {
      id: "a-claim",
      text: "Haaland movement defines the Premier League contest.",
      role: "required",
    },
    {
      id: "b-claim",
      text: "Haaland pressing reshapes the Premier League contest.",
      role: "optional",
    },
  ]);
  const input = planningPair(
    { topic: "Haaland Premier League impact", scriptMode: "player_analysis" },
    grounding,
  );
  const ctx = validateRetentionStrategyPlanningInput(input);
  const candidates = buildControllingIdeaCandidates(ctx);

  assert.throws(
    () =>
      selectControllingIdea(
        [
          {
            ...candidates[0]!,
            contractFingerprint: "rsc:stale",
          },
        ],
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "controlling_idea_candidate_mismatch",
  );

  assert.throws(
    () =>
      selectControllingIdea(
        [
          {
            ...candidates[0]!,
            candidateId: "rici:forged",
          },
        ],
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "controlling_idea_candidate_mismatch",
  );

  const grounded = candidates.find((c) => c.source === "grounded_claim")!;
  assert.throws(
    () =>
      selectControllingIdea(
        [{ ...grounded, claimRefs: Object.freeze([]) }],
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "controlling_idea_candidate_mismatch",
  );

  assert.throws(
    () =>
      selectControllingIdea(
        [{ ...grounded, factualRisk: !grounded.factualRisk }],
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "controlling_idea_candidate_mismatch",
  );

  assert.throws(
    () =>
      selectControllingIdea(
        [{ ...grounded, subjectAnchored: false }],
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "controlling_idea_candidate_mismatch",
  );

  const fallback = candidates.find(
    (c) => c.source === "deterministic_mode_strategy",
  )!;
  assert.throws(
    () =>
      selectControllingIdea(
        [
          {
            ...fallback,
            statement: "Haaland is a totally different invented thesis here.",
            candidateId: buildControllingIdeaCandidateId({
              contractFingerprint: ctx.contract.contractFingerprint,
              source: "deterministic_mode_strategy",
              statement: "Haaland is a totally different invented thesis here.",
              claimRefs: [],
              factualRisk: false,
            }),
            factualRisk: false,
            subjectAnchored: true,
          },
        ],
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "controlling_idea_candidate_mismatch",
  );

  const selA = selectControllingIdea(candidates, ctx);
  const selB = selectControllingIdea(
    Object.freeze([...candidates].reverse()) as readonly ControllingIdeaCandidate[],
    ctx,
  );
  assert.equal(selA.selectedCandidateId, selB.selectedCandidateId);
});

console.log("10c1-proposal-refs");
check("proposal claim refs are canonical sorted unique order-independent", () => {
  const grounding = eligibleClaimGrounding([
    {
      id: "goals36",
      text: "Haaland scored 36 Premier League goals.",
    },
  ]);
  const input = planningPair(
    { topic: "Haaland Premier League impact" },
    grounding,
  );
  const ctx = validateRetentionStrategyPlanningInput(input);
  const statement = "Haaland scored 36 Premier League goals.";

  const a = normalizeRetentionStrategyProposal(
    {
      controllingIdea: statement,
      controllingIdeaClaimRefs: ["goals36"],
    },
    ctx,
  );
  const b = normalizeRetentionStrategyProposal(
    {
      controllingIdea: statement,
      controllingIdeaClaimRefs: ["goals36", "goals36"],
    },
    ctx,
  );
  assert.deepEqual([...a.controllingIdeaClaimRefs], ["goals36"]);
  assert.deepEqual([...b.controllingIdeaClaimRefs], ["goals36"]);
  assert.equal(a.strategySeedFingerprint, b.strategySeedFingerprint);
  assertRetentionStrategySeedCoherence(a, ctx);
});

console.log("10c1-blueprint-total");
check("emotional blueprint validator is total over unknown", () => {
  assert.ok(validateEmotionalArcBlueprint(null).includes("invalid_shape"));
  assert.ok(
    validateEmotionalArcBlueprint({
      version: 1,
      primaryEmotion: "rage",
      curve: [],
      blueprintFingerprint: "reb:x",
    }).includes("invalid_primary_emotion"),
  );
  assert.ok(
    validateEmotionalArcBlueprint({
      version: 1,
      primaryEmotion: "curiosity",
      secondaryEmotion: "curiosity",
      curve: [
        { phase: "opening", emotion: "curiosity", intensity: 2 },
        { phase: "build", emotion: "curiosity", intensity: 3 },
        { phase: "turn", emotion: "curiosity", intensity: 4 },
        { phase: "payoff", emotion: "curiosity", intensity: 5 },
      ],
      blueprintFingerprint: "reb:abc",
    }).includes("duplicate_primary_secondary"),
  );
  assert.ok(
    validateEmotionalArcBlueprint({
      version: 1,
      primaryEmotion: "curiosity",
      curve: [null, null, null, null],
      blueprintFingerprint: "reb:abc",
    }).includes("invalid_curve_entry"),
  );
  assert.doesNotThrow(() => validateEmotionalArcBlueprint(undefined));
});

console.log("10c1-seed-binding-coherence");
check("seed coherence and beat-binding reject tampering", () => {
  const input = planningPair({ topic: "Real Madrid European nights" });
  const ctx = validateRetentionStrategyPlanningInput(input);
  const ready = buildDeterministicRetentionStrategySeed(input);
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;

  assertRetentionStrategySeedCoherence(ready.seed, ctx);

  assert.throws(
    () =>
      assertRetentionStrategySeedCoherence(
        {
          ...ready.seed,
          emotionalArcBlueprint: {
            ...ready.seed.emotionalArcBlueprint,
            primaryEmotion: "rage" as "curiosity",
          },
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "strategy_seed_mismatch",
  );

  assert.throws(
    () =>
      assertRetentionStrategySeedCoherence(
        {
          ...ready.seed,
          emotionalArcBlueprint: {
            ...ready.seed.emotionalArcBlueprint,
            blueprintFingerprint: "reb:tampered",
          },
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "strategy_seed_mismatch",
  );

  assert.throws(
    () =>
      assertRetentionStrategySeedCoherence(
        {
          ...ready.seed,
          strategySeedFingerprint: "rss:tampered",
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "strategy_seed_mismatch",
  );

  assert.throws(
    () =>
      assertRetentionStrategySeedCoherence(
        {
          ...ready.seed,
          contractFingerprint: "rsc:stale",
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "strategy_seed_mismatch",
  );

  assert.throws(
    () =>
      bindEmotionalArcBlueprintToBeatIds(
        {
          version: 1,
          primaryEmotion: "rage",
          curve: ready.seed.emotionalArcBlueprint.curve,
          blueprintFingerprint: "reb:x",
        },
        ["b1", "b2", "b3", "b4"],
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "invalid_emotional_arc_blueprint",
  );

  const proposal = normalizeRetentionStrategyProposal(
    {
      controllingIdea: ready.seed.controllingIdea.statement,
    },
    ctx,
  );
  assertRetentionStrategySeedCoherence(proposal, ctx);
});

console.log("10c1a-source-invariants");
check("grounded and planner source invariants in seed coherence", () => {
  const claimText = "Haaland movement defines the Premier League contest.";
  const grounding = eligibleClaimGrounding([
    { id: "a-claim", text: claimText, role: "required" },
    {
      id: "other-claim",
      text: "Weather delayed kickoff across another continent.",
    },
  ]);
  const input = planningPair(
    { topic: "Haaland Premier League impact", scriptMode: "player_analysis" },
    grounding,
  );
  const ctx = validateRetentionStrategyPlanningInput(input);
  const ready = buildDeterministicRetentionStrategySeed(input);
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;

  assert.equal(ready.seed.controllingIdeaSource, "grounded_claim");
  assertRetentionStrategySeedCoherence(ready.seed, ctx);

  const alteredStatement =
    "Haaland reshapes the Premier League contest without citing the claim.";
  const alteredGrounded = {
    ...ready.seed,
    controllingIdea: Object.freeze({
      statement: alteredStatement,
      mustPreserveThroughCompression: true as const,
    }),
    controllingIdeaSource: "grounded_claim" as const,
    controllingIdeaClaimRefs: Object.freeze(["a-claim"]),
    strategySeedFingerprint: buildRetentionStrategySeedFingerprint({
      contractFingerprint: ctx.contract.contractFingerprint,
      statement: alteredStatement,
      source: "grounded_claim",
      claimRefs: ["a-claim"],
      blueprintFingerprint: ready.seed.emotionalArcBlueprint.blueprintFingerprint,
    }),
  };
  assert.throws(
    () => assertRetentionStrategySeedCoherence(alteredGrounded, ctx),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "strategy_seed_mismatch",
  );

  assert.throws(
    () =>
      assertRetentionStrategySeedCoherence(
        {
          ...ready.seed,
          controllingIdeaClaimRefs: Object.freeze([]),
          strategySeedFingerprint: buildRetentionStrategySeedFingerprint({
            contractFingerprint: ctx.contract.contractFingerprint,
            statement: ready.seed.controllingIdea.statement,
            source: "grounded_claim",
            claimRefs: [],
            blueprintFingerprint:
              ready.seed.emotionalArcBlueprint.blueprintFingerprint,
          }),
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "strategy_seed_mismatch",
  );

  assert.throws(
    () =>
      assertRetentionStrategySeedCoherence(
        {
          ...ready.seed,
          controllingIdeaClaimRefs: Object.freeze(["a-claim", "other-claim"]),
          strategySeedFingerprint: buildRetentionStrategySeedFingerprint({
            contractFingerprint: ctx.contract.contractFingerprint,
            statement: ready.seed.controllingIdea.statement,
            source: "grounded_claim",
            claimRefs: ["a-claim", "other-claim"],
            blueprintFingerprint:
              ready.seed.emotionalArcBlueprint.blueprintFingerprint,
          }),
        },
        ctx,
      ),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "strategy_seed_mismatch",
  );

  const exactGrounded = assertRetentionStrategySeedCoherence(
    {
      ...ready.seed,
      controllingIdea: Object.freeze({
        statement: claimText,
        mustPreserveThroughCompression: true as const,
      }),
      controllingIdeaSource: "grounded_claim" as const,
      controllingIdeaClaimRefs: Object.freeze(["a-claim"]),
      strategySeedFingerprint: buildRetentionStrategySeedFingerprint({
        contractFingerprint: ctx.contract.contractFingerprint,
        statement: claimText,
        source: "grounded_claim",
        claimRefs: ["a-claim"],
        blueprintFingerprint:
          ready.seed.emotionalArcBlueprint.blueprintFingerprint,
      }),
    },
    ctx,
  );
  assert.equal(exactGrounded.controllingIdea.statement, claimText);

  const safeQual = assembleDeterministicControllingIdeaStatement(
    "player_analysis",
    input.contract.topic,
  );
  const unrelatedPlanner = {
    version: 1 as const,
    contractFingerprint: ctx.contract.contractFingerprint,
    controllingIdea: Object.freeze({
      statement: safeQual,
      mustPreserveThroughCompression: true as const,
    }),
    controllingIdeaSource: "planner_model_proposal" as const,
    controllingIdeaClaimRefs: Object.freeze(["other-claim"]),
    emotionalArcBlueprint: ready.seed.emotionalArcBlueprint,
    strategySeedFingerprint: buildRetentionStrategySeedFingerprint({
      contractFingerprint: ctx.contract.contractFingerprint,
      statement: safeQual,
      source: "planner_model_proposal",
      claimRefs: ["other-claim"],
      blueprintFingerprint: ready.seed.emotionalArcBlueprint.blueprintFingerprint,
    }),
  };
  assert.throws(
    () => assertRetentionStrategySeedCoherence(unrelatedPlanner, ctx),
    (err: unknown) =>
      err instanceof RetentionStoryError &&
      err.reason === "strategy_seed_mismatch",
  );

  const safeProposal = normalizeRetentionStrategyProposal(
    { controllingIdea: safeQual },
    ctx,
  );
  assert.equal(safeProposal.controllingIdeaSource, "planner_model_proposal");
  assert.equal(safeProposal.controllingIdeaClaimRefs.length, 0);
  assertRetentionStrategySeedCoherence(safeProposal, ctx);

  const claimProposal = normalizeRetentionStrategyProposal(
    {
      controllingIdea: claimText,
      controllingIdeaClaimRefs: ["a-claim"],
    },
    ctx,
  );
  assert.deepEqual([...claimProposal.controllingIdeaClaimRefs], ["a-claim"]);
  assertRetentionStrategySeedCoherence(claimProposal, ctx);

  const emptyInput = planningPair({
    topic: "Haaland Premier League impact",
    scriptMode: "story",
  });
  const det = buildDeterministicRetentionStrategySeed(emptyInput);
  assert.equal(det.status, "ready");
  if (det.status === "ready") {
    assert.equal(det.seed.controllingIdeaSource, "deterministic_mode_strategy");
    assertRetentionStrategySeedCoherence(
      det.seed,
      validateRetentionStrategyPlanningInput(emptyInput),
    );
  }
});

console.log("10c1a-deep-freeze");
check("asserted seed is deeply frozen and detached from caller objects", () => {
  const input = planningPair({ topic: "Real Madrid European nights" });
  const ctx = validateRetentionStrategyPlanningInput(input);
  const ready = buildDeterministicRetentionStrategySeed(input);
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;

  const mutableCurve = ready.seed.emotionalArcBlueprint.curve.map((p) => ({
    ...p,
  }));
  const callerBlueprint = {
    version: 1 as const,
    primaryEmotion: ready.seed.emotionalArcBlueprint.primaryEmotion,
    ...(ready.seed.emotionalArcBlueprint.secondaryEmotion
      ? {
          secondaryEmotion: ready.seed.emotionalArcBlueprint.secondaryEmotion,
        }
      : {}),
    curve: mutableCurve,
    blueprintFingerprint: ready.seed.emotionalArcBlueprint.blueprintFingerprint,
  };
  const callerSeed = {
    version: 1 as const,
    contractFingerprint: ready.seed.contractFingerprint,
    controllingIdea: {
      statement: ready.seed.controllingIdea.statement,
      mustPreserveThroughCompression: true as const,
    },
    controllingIdeaSource: ready.seed.controllingIdeaSource,
    controllingIdeaClaimRefs: [...ready.seed.controllingIdeaClaimRefs],
    emotionalArcBlueprint: callerBlueprint,
    strategySeedFingerprint: ready.seed.strategySeedFingerprint,
  };

  const canonical = assertRetentionStrategySeedCoherence(callerSeed, ctx);

  assert.equal(Object.isFrozen(canonical), true);
  assert.equal(Object.isFrozen(canonical.controllingIdea), true);
  assert.equal(Object.isFrozen(canonical.controllingIdeaClaimRefs), true);
  assert.equal(Object.isFrozen(canonical.emotionalArcBlueprint), true);
  assert.equal(Object.isFrozen(canonical.emotionalArcBlueprint.curve), true);
  for (const point of canonical.emotionalArcBlueprint.curve) {
    assert.equal(Object.isFrozen(point), true);
  }

  const originalEmotion = canonical.emotionalArcBlueprint.curve[0]!.emotion;
  mutableCurve[0]!.emotion = "delight";
  assert.equal(
    canonical.emotionalArcBlueprint.curve[0]!.emotion,
    originalEmotion,
  );

  try {
    (canonical.controllingIdea as { statement: string }).statement = "mutated";
    (canonical.controllingIdeaClaimRefs as unknown as string[]).push("x");
    (canonical.emotionalArcBlueprint as { primaryEmotion: string }).primaryEmotion =
      "rage";
    (
      canonical.emotionalArcBlueprint.curve as unknown as {
        emotion: string;
      }[]
    )[0]!.emotion = "rage";
  } catch {
    /* frozen writes may throw */
  }
  assert.notEqual(canonical.controllingIdea.statement, "mutated");
  assert.equal(canonical.controllingIdeaClaimRefs.includes("x"), false);
  assert.notEqual(canonical.emotionalArcBlueprint.primaryEmotion, "rage");
  assert.equal(
    canonical.emotionalArcBlueprint.curve[0]!.emotion,
    originalEmotion,
  );

  assertRetentionStrategySeedCoherence(canonical, ctx);

  const rebuilt = buildDeterministicRetentionStrategySeed(input);
  assert.equal(rebuilt.status, "ready");
  if (rebuilt.status === "ready") {
    assert.equal(Object.isFrozen(rebuilt.seed), true);
    assert.equal(Object.isFrozen(rebuilt.seed.emotionalArcBlueprint.curve), true);
    assert.equal(
      rebuilt.seed.strategySeedFingerprint,
      ready.seed.strategySeedFingerprint,
    );
  }

  const proposal = normalizeRetentionStrategyProposal(
    { controllingIdea: ready.seed.controllingIdea.statement },
    ctx,
  );
  assert.equal(Object.isFrozen(proposal), true);
  assert.equal(Object.isFrozen(proposal.emotionalArcBlueprint.curve[0]!), true);
});

console.log(`\nAll retention strategy seed checks passed (${passed}).\n`);
