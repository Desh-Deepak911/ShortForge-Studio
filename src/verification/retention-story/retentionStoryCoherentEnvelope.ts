/**
 * Shared coherent-envelope helpers for Sprint 10E.1 verification scripts.
 */

import assert from "node:assert/strict";

import {
  buildDeterministicRetentionStoryPlan,
  buildDeterministicRetentionStrategySeed,
  buildRetentionStoryPlan,
  finalizeRetentionGroundingClaims,
  normalizeRetentionGroundingContext,
  normalizeStoryContract,
  resolveRetentionBeatCountRange,
  resolveRetentionBeatPurposeSequence,
  validateRetentionStrategyPlanningInput,
  createRetentionModelCallLedger,
  type BuildRetentionStoryPlanInput,
  type NormalizedStoryContract,
  type RetentionGroundingContext,
  type RetentionModelCallLedger,
  type RetentionPlannerProposal,
  type RetentionStoryPlan,
  type RetentionStrategySeed,
  type StoryContractInput,
} from "@/features/retention-story";

const SAFE_BEAT_FIELDS = {
  emotionalIntent: "A crafted qualitative emotional intent for this stretch.",
  viewerQuestion: "What tension should the audience feel next?",
  informationContribution:
    "Frame the qualitative pressure without asserting scores.",
  narrationGoal: "Advance the core thesis with concise spoken focus.",
  visualOpportunity: "Show the contest pressure through decisive body language.",
  groundingClaimRefs: [] as readonly string[],
} as const;

export const SECTION_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
] as const;

export interface CoherentEnvelope {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly plan: RetentionStoryPlan;
  readonly strategySeed: RetentionStrategySeed;
  readonly ledger: RetentionModelCallLedger;
  readonly controllingIdeaClaimRefs: readonly string[];
}

export function baseContractInput(
  overrides: Partial<StoryContractInput> = {},
): StoryContractInput {
  return {
    topic: "Spain versus France tactical preview",
    durationSec: 30,
    generationPath: "script_only",
    scriptMode: "story",
    tone: "dramatic",
    desiredReaction: "curiosity",
    qualityMode: "cheap",
    ...overrides,
  };
}

export function emptyGrounding(): RetentionGroundingContext {
  return finalizeRetentionGroundingClaims([]);
}

export function eligibleClaimGrounding(
  claims: Array<{ id: string; text: string; role?: string }>,
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

function makePlanInput(
  overrides: Partial<StoryContractInput> = {},
  grounding?: RetentionGroundingContext,
): BuildRetentionStoryPlanInput {
  const g = grounding ?? emptyGrounding();
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
    planner: null,
  };
}

function seedAndContext(input: BuildRetentionStoryPlanInput) {
  const context = validateRetentionStrategyPlanningInput({
    contract: input.contract,
    grounding: input.grounding,
    manualContext: input.manualContext ?? null,
    userInstructions: input.userInstructions ?? null,
  });
  const seedResult = buildDeterministicRetentionStrategySeed({
    contract: input.contract,
    grounding: input.grounding,
    manualContext: input.manualContext ?? null,
    userInstructions: input.userInstructions ?? null,
  });
  assert.equal(seedResult.status, "ready");
  if (seedResult.status !== "ready") throw new Error("seed not ready");
  return { context, seed: seedResult.seed };
}

export function completePlannerProposal(
  input: BuildRetentionStoryPlanInput,
  options: {
    readonly purposes?: readonly string[];
    readonly beatMutator?: (
      beat: Record<string, unknown>,
      index: number,
    ) => Record<string, unknown>;
    readonly strategy?: Record<string, unknown>;
  } = {},
): RetentionPlannerProposal {
  const { seed } = seedAndContext(input);
  const range = resolveRetentionBeatCountRange(input.contract);
  const purposes =
    options.purposes ??
    resolveRetentionBeatPurposeSequence(
      input.contract.scriptMode,
      input.contract.endingStrategy,
      range.target,
    );
  const beats = purposes.map((purpose, index) => {
    const base: Record<string, unknown> = {
      purpose,
      ...SAFE_BEAT_FIELDS,
      groundingClaimRefs: [...SAFE_BEAT_FIELDS.groundingClaimRefs],
      id: "ignored",
      estimatedStartMs: 999_999,
    };
    return options.beatMutator ? options.beatMutator(base, index) : base;
  });
  const strategy = (options.strategy
    ? (options.strategy as unknown as NonNullable<
        RetentionPlannerProposal["strategy"]
      >)
    : {
        controllingIdea: seed.controllingIdea.statement,
        controllingIdeaClaimRefs: [...seed.controllingIdeaClaimRefs],
      });
  return {
    strategy,
    beats,
  };
}

/** Qualitative segment copy — no digits, no "beat", no hook-handoff markers, no result language. */
export function qualitativeSegmentText(index: number): string {
  const section = SECTION_WORDS[index] ?? "next";
  if (index === 0) {
    // Hook-valid short opening sentence + body (terminal Hook authority fixtures).
    return `Spain pressure night hits harder. Spain keeps the short moving in section ${section}.`;
  }
  return `Spain pressure keeps the short moving in section ${section}.`;
}

export function qualitativeProposal(plan: RetentionStoryPlan) {
  return {
    title: "Spain pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: plan.beatPlan.beats.map((beat, index) => ({
      beatId: beat.id,
      text: qualitativeSegmentText(index),
      claimRefs: [] as unknown as string[],
    })),
  };
}

export function openingComposerProposal(plan: RetentionStoryPlan) {
  return {
    title: "Spain pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: plan.beatPlan.beats.map((beat, index) => ({
      beatId: beat.id,
      text:
        index === 0
          ? "Spain pressure night hits harder. The opener pulls the viewer into the tension."
          : "Next, Spain advances with clear spoken focus and pace through the following stretch.",
      claimRefs: [] as unknown as string[],
    })),
  };
}

export async function coherentEnvelope(
  qualityMode: "cheap" | "balanced" | "best",
  overrides: Partial<StoryContractInput> = {},
  grounding?: RetentionGroundingContext,
): Promise<CoherentEnvelope> {
  const ledger = createRetentionModelCallLedger(qualityMode);

  if (qualityMode === "cheap") {
    const g = grounding ?? emptyGrounding();
    const contract = normalizeStoryContract({
      ...baseContractInput({ qualityMode: "cheap", ...overrides }),
      grounding: g.claims.length > 0 ? g : overrides.grounding,
    });
    const result = buildDeterministicRetentionStoryPlan({
      contract,
      grounding: normalizeRetentionGroundingContext(
        g.claims.length > 0
          ? g
          : {
              version: 1,
              claims: [],
              researchIdentity: contract.groundingSummary.researchIdentity,
            },
      ),
      manualContext: overrides.manualContext ?? null,
      userInstructions: overrides.userInstructions ?? null,
      ledger,
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") throw new Error("cheap plan not ready");
    return {
      contract,
      grounding: g,
      plan: result.plan,
      strategySeed: result.strategySeed,
      ledger,
      controllingIdeaClaimRefs: [
        ...result.strategySeed.controllingIdeaClaimRefs,
      ],
    };
  }

  const input = makePlanInput({ qualityMode, ...overrides }, grounding);
  const proposal = completePlannerProposal(input);
  const result = await buildRetentionStoryPlan({
    ...input,
    planner: () => proposal,
    ledger,
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error(`${qualityMode} plan not ready`);
  return {
    contract: input.contract,
    grounding: input.grounding,
    plan: result.plan,
    strategySeed: result.strategySeed,
    ledger,
    controllingIdeaClaimRefs: [
      ...result.strategySeed.controllingIdeaClaimRefs,
    ],
  };
}
