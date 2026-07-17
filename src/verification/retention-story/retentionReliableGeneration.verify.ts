/**
 * Sprint 10H.3 — reliable generation + Creative Premise deterministic QA.
 */

import assert from "node:assert/strict";

import { recommendCreateBrief } from "@/features/create/utils/recommend-create-brief";
import { buildDeterministicFallbackComposer } from "@/features/retention-story/composition/build-deterministic-fallback-composer";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { normalizeRetentionGroundingContext } from "@/features/retention-story/grounding/retention-grounding-normalization";
import { parseCreativePremiseFacts } from "@/features/retention-story/grounding/parse-creative-premise-facts";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { resolveAdaptiveRetentionBeatCount } from "@/features/retention-story/planning/resolve-adaptive-retention-beat-count";
import { buildResearchIdentityFromClaims } from "@/features/retention-story/domain/retention-story-fingerprint";
import {
  buildProductionStoryContractInput,
  mergeGroundingWithPremise,
} from "@/features/retention-story/production/build-production-story-contract-input";
import { deriveRetentionClaimAdaptations } from "@/features/retention-story/production/derive-retention-claim-adaptations";
import {
  HOOK_STYLE_RECONCILED_CREATOR_NOTE,
  assertRetentionHookPreferenceDispositionCoherence,
  deriveRetentionHookPreferenceAdaptation,
} from "@/features/retention-story/production/derive-retention-hook-preference-adaptation";
import { buildRetentionGenerationDisposition } from "@/features/retention-story/production/build-retention-generation-disposition";
import { runRetentionProductionNarration } from "@/features/retention-story/production/run-retention-production-narration";
import { buildRetentionExplainabilityModel } from "@/features/retention-story/presentation/retention-explainability";
import { isClaimEligibleForNarrationSupport } from "@/features/retention-story/strategy/retention-claim-support";
import { resolveRetentionDeterministicSubjectAnchor } from "@/features/retention-story/strategy/resolve-retention-deterministic-subject-anchor";

import { extractOpeningSpan } from "@/features/hook-engine";
import type { RetentionHookRunner } from "@/features/retention-story";
import { assertRetentionModelCallLedgerSnapshotCoherence } from "@/features/retention-story/budget/assert-retention-model-call-ledger-snapshot-coherence";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { assertRetentionHookBridgeReadyCoherence } from "@/features/retention-story/integration/assert-retention-hook-bridge-ready-coherence";
import { joinOpeningAndBody, padSpokenWords } from "./retentionSpokenFixtureText";
import {
  makeRetentionComposer,
  passRetentionHookRunner,
} from "./retentionStoryQaDoubles";
import {
  readyBridgeWithAuthority,
  makeEmptyReadyLedger,
} from "./retentionStoryReadyBridge";
import { buildDeterministicFallbackNarrationCandidate } from "@/features/retention-story/composition/build-deterministic-fallback-narration";
import { SECTION_WORDS, coherentEnvelope } from "./retentionStoryCoherentEnvelope";

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  pass ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

async function main() {
  console.log("Sprint 10H.3 reliable generation QA");

  await check("[R1] adaptive beats for 25–35s stay in 5–7 band", () => {
    for (const durationSec of [25, 30, 35] as const) {
      const contract = normalizeStoryContract({
        topic: "Argentina versus England match review",
        durationSec,
        generationPath: "script_only",
        qualityMode: "cheap",
        formatStrategyId: "short_retention",
        tone: "dramatic",
        scriptMode: "story",
      });
      const adaptive = resolveAdaptiveRetentionBeatCount(contract);
      assert.ok(adaptive.target >= 5 && adaptive.target <= 7, String(durationSec));
      assert.ok(adaptive.max <= 7, String(durationSec));
    }
  });

  await check("[R2] Creative Premise facts parse as creator_asserted", () => {
    const facts = parseCreativePremiseFacts(
      [
        "Argentina beat England 2–1.",
        "The match had 26 fouls.",
        "The match had 35 tackles.",
      ].join("\n"),
    );
    assert.equal(facts.length, 3);
    for (const claim of facts) {
      assert.equal(claim.provenance, "manual_user");
      assert.equal(claim.verification, "unverified");
      assert.equal(claim.sourceRef, "creative_premise");
      assert.equal(claim.permittedFactualUse, true);
      assert.equal(claim.forbidden, false);
    }
  });

  await check("[R3] Creative Premise claims support narration only in that mode", () => {
    const input = buildProductionStoryContractInput({
      topic: "Argentina versus England",
      durationSec: 35,
      generationPath: "script_only",
      qualityMode: "balanced",
      factHandlingMode: "creative_premise",
      premiseDetails: [
        "Argentina beat England 2–1.",
        "The match had 26 fouls.",
        "The match had 35 tackles.",
      ].join("\n"),
    });
    const contract = normalizeStoryContract(input);
    const grounding = normalizeRetentionGroundingContext(input.grounding!);
    assert.equal(contract.factHandlingMode, "creative_premise");
    const premise = grounding.claims.filter(
      (c) => c.sourceRef === "creative_premise",
    );
    assert.equal(premise.length, 3);
    for (const claim of premise) {
      assert.equal(
        isClaimEligibleForNarrationSupport(
          grounding,
          claim.claimId,
          "creative_premise",
        ),
        true,
      );
      assert.equal(
        isClaimEligibleForNarrationSupport(
          grounding,
          claim.claimId,
          "verified_facts_only",
        ),
        false,
      );
    }
  });

  await check("[R4] planner invalid → complete story with planner_fallback_used", async () => {
    // Topic aligns with QA Hook double / composer fixtures (Spain).
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 35,
      generationPath: "script_only",
      qualityMode: "balanced",
      formatStrategyId: "short_retention",
      tone: "dramatic",
      planner: () => ({ strategy: null, beats: null }),
      composer: makeRetentionComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected ok");
    assert.ok(result.approved.narration.trim().length > 40);
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "planner_fallback_used",
      ),
    );
  });

  await check("[R5] empty composer → deterministic fallback success", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      planner: null,
      composer: () => ({ title: "x", hookClaimRefs: [], segments: [] }),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected ok");
    assert.ok(result.approved.narration.trim().length > 20);
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "deterministic_story_fallback_used",
      ) ||
        result.approved.generationDisposition?.adaptations.includes(
          "reliability_rescue_used",
        ),
    );
  });

  await check("[R6] Creative Premise production path completes with fixture facts", async () => {
    const premiseDetails = [
      "Spain beat France 2–1.",
      "The match had 26 fouls.",
      "The match had 35 tackles.",
    ].join("\n");
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 35,
      generationPath: "script_only",
      qualityMode: "best",
      tone: "dramatic",
      formatStrategyId: "short_retention",
      factHandlingMode: "creative_premise",
      premiseDetails,
      planner: () => ({ strategy: null, beats: null }),
      composer: (request) => {
        const n = request.orderedBeatIds.length;
        const segments = request.orderedBeatIds.map((beatId, i) => {
          if (i === 0) {
            return {
              beatId,
              text: "Why does Spain pressure matter?",
              claimRefs: [] as string[],
            };
          }
          if (i === n - 1) {
            return {
              beatId,
              text: "Spain pressure closes this preview decisively tonight.",
              claimRefs: [] as string[],
            };
          }
          const beat = request.beats.find((b) => b.beatId === beatId);
          const ref = beat?.groundingClaimRefs[0];
          const claim = ref
            ? request.eligibleClaims.find((c) => c.claimId === ref)
            : undefined;
          if (claim) {
            return {
              beatId,
              text: claim.text.endsWith(".") ? claim.text : `${claim.text}.`,
              claimRefs: [claim.claimId],
            };
          }
          return {
            beatId,
            text: "Spain tactical pressure advances with clear spoken focus.",
            claimRefs: [] as string[],
          };
        });
        return {
          title: "Spain vs France premise review",
          hookClaimRefs: [] as string[],
          segments,
        };
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected ok");
    assert.ok(result.approved.narration.length > 40);
    assert.equal(
      result.approved.generationDisposition?.factHandlingMode,
      "creative_premise",
    );
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "creative_premise_used",
      ),
    );
    assert.equal(
      /\b3-?\s*0\b|\b4-?\s*1\b|\b50 fouls\b/i.test(result.approved.narration),
      false,
    );
  });

  await check("[R7] recommendation card stays honest (no retention %)", () => {
    const rec = recommendCreateBrief({
      topic:
        "Argentina versus England dramatic match review with pressure and tempo",
      durationSec: 35,
      scriptMode: "story",
      tone: "dramatic",
      enableResearch: true,
      factHandlingMode: "verified_facts_only",
      hasPremiseDetails: false,
      hasManualContext: true,
    });
    assert.equal(rec.qualityMode, "best");
    assert.ok(!/will go viral|guaranteed views|scientific/i.test(rec.summary));
    assert.match(rec.summary, /Recommended settings|generatable/i);
    assert.equal(rec.hookStyle, "auto");
    assert.ok(rec.targetNarrationWords > 0);
  });

  await check("[R8] reliability deterministic plan works for Studio quality", () => {
    const contract = normalizeStoryContract({
      topic: "Argentina versus England",
      durationSec: 35,
      generationPath: "script_only",
      qualityMode: "best",
      formatStrategyId: "short_retention",
    });
    const grounding = normalizeRetentionGroundingContext({
      version: 1,
      claims: [],
      researchIdentity: null,
    });
    const plan = buildReliabilityDeterministicRetentionPlan({
      contract,
      grounding,
      planner: null,
    });
    assert.equal(plan.status, "ready");
    if (plan.status !== "ready") throw new Error("expected ready");
    assert.ok(plan.plan.beatPlan.beats.length >= 5);
    assert.ok(plan.plan.beatPlan.beats.length <= 7);
    const composer = buildDeterministicFallbackComposer({
      contract,
      plan: plan.plan,
    });
    const proposal = composer({
      orderedBeatIds: plan.plan.beatPlan.beats.map((b) => b.id),
      durationSec: contract.durationSec,
    } as never);
    assert.ok(proposal && typeof proposal === "object");
  });

  await check("[R9] mergeGroundingWithPremise recomputes researchIdentity", () => {
    const premise = [
      "Argentina beat England 2–1.",
      "The match had 26 fouls.",
      "The match had 35 tackles.",
    ].join("\n");
    const baseA = {
      version: 1 as const,
      claims: Object.freeze([
        Object.freeze({
          claimId: "research_a",
          text: "Spain pressed high.",
          provenance: "research_provider" as const,
          verification: "verified" as const,
          permittedFactualUse: true,
          forbidden: false,
          sourceRef: "provider:stats",
        }),
      ]),
      researchIdentity: "stale-identity-must-not-survive",
    };
    const baseB = {
      version: 1 as const,
      claims: Object.freeze([
        ...baseA.claims,
      ].reverse()),
      researchIdentity: "other-stale",
    };
    const mergedA = mergeGroundingWithPremise({
      base: baseA as never,
      factHandlingMode: "creative_premise",
      premiseDetails: premise,
    });
    const mergedB = mergeGroundingWithPremise({
      base: baseB as never,
      factHandlingMode: "creative_premise",
      premiseDetails: premise,
    });
    assert.notEqual(mergedA.researchIdentity, "stale-identity-must-not-survive");
    assert.equal(
      mergedA.researchIdentity,
      buildResearchIdentityFromClaims(mergedA.claims),
    );
    assert.equal(mergedA.researchIdentity, mergedB.researchIdentity);
    assert.ok(
      mergedA.claims.some((c) => c.sourceRef === "creative_premise"),
    );
    // Order-independent identity after normalize.
    const normA = normalizeRetentionGroundingContext(mergedA);
    const normB = normalizeRetentionGroundingContext(mergedB);
    assert.equal(normA.researchIdentity, normB.researchIdentity);
  });

  await check("[R10] composer throw → deterministic story, no 2nd model success", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      planner: null,
      composer: () => {
        throw new Error("composer boom");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected ok");
    assert.ok(result.approved.narration.trim().length > 20);
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "deterministic_story_fallback_used",
      ),
    );
    const budget = result.approved.safeDiagnostics.budget;
    assert.ok(budget);
    // Failed model initial consumed; deterministic rescue is zero-cost.
    assert.ok((budget.initialNarration ?? 0) <= 1);
    assert.equal(result.approved.generationDisposition?.disposition, "fallback");
  });

  await check("[R11] empty Creative Premise details → story without premise used", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "creative_premise",
      premiseDetails: "   ",
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected ok");
    assert.equal(
      result.approved.generationDisposition?.adaptations.includes(
        "creative_premise_used",
      ),
      false,
    );
    assert.ok(
      result.approved.generationDisposition?.creatorFacingNotes.some((n) =>
        /premise details/i.test(n),
      ),
    );
  });

  await check("[R12] Creative Premise composer fail still uses authorized facts", async () => {
    const premiseDetails = [
      "Argentina beat England 2–1.",
      "The match had 26 fouls.",
      "The match had 35 tackles.",
    ].join("\n");
    const result = await runRetentionProductionNarration({
      topic: "Argentina versus England match review",
      durationSec: 35,
      generationPath: "script_only",
      qualityMode: "balanced",
      tone: "dramatic",
      scriptMode: "match_recap",
      formatStrategyId: "short_retention",
      factHandlingMode: "creative_premise",
      premiseDetails,
      planner: null,
      composer: () => {
        throw new Error("model composer unavailable");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : `${result.failureCategory}: ${result.error}`,
    );
    if (!result.ok) throw new Error("expected ok");
    const narration = result.approved.narration.toLowerCase();
    assert.ok(narration.includes("26") || narration.includes("fouls"));
    assert.ok(narration.includes("35") || narration.includes("tackles"));
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "creative_premise_used",
      ),
    );
    // No ungrounded full-result leak from raw topic first-four-words path.
    assert.equal(
      /^argentina beat england/i.test(result.approved.narration.trim()),
      false,
    );
  });

  await check("[R13] safe subject anchor strips ungrounded result topics", () => {
    const risky = [
      "Argentina beat England 2–1",
      "Spain won the final",
      "France lost to Spain",
      "Argentina recorded a win",
    ];
    for (const topic of risky) {
      const anchor = resolveRetentionDeterministicSubjectAnchor(topic);
      assert.ok(anchor);
      assert.equal(/\b2\s*[-–]\s*1\b|\bwon the final\b|\blost to\b|\brecorded a win\b/i.test(anchor!), false, topic);
    }
    assert.equal(
      resolveRetentionDeterministicSubjectAnchor("Argentina versus England"),
      "Argentina versus England",
    );
    assert.ok(resolveRetentionDeterministicSubjectAnchor("AC Milan"));
    assert.ok(resolveRetentionDeterministicSubjectAnchor("AS Roma"));
    assert.ok(resolveRetentionDeterministicSubjectAnchor("São Paulo"));
    assert.ok(resolveRetentionDeterministicSubjectAnchor("AI FC"));
  });

  await check("[R14] verified-only manual facts emit unsupported_facts_omitted", () => {
    const input = buildProductionStoryContractInput({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      manualContext: "Spain won 4-1 with 50 fouls in a chaotic night.",
    });
    const contract = normalizeStoryContract(input);
    const grounding = normalizeRetentionGroundingContext(input.grounding!);
    const adaptations = deriveRetentionClaimAdaptations({
      contract,
      grounding,
      candidate: {
        version: 1,
        origin: "final",
        planFingerprint: "rsp:test",
        candidateFingerprint: "rcand:test",
        assembledNarration: "Why does Spain pressure matter? The contest tightens.",
        orderedBeatIds: ["rbeat:a", "rbeat:b"],
        segments: [
          {
            beatId: "rbeat:a",
            text: "Why does Spain pressure matter?",
            claimRefs: [],
            startOffset: 0,
            endOffset: 30,
            factualRisk: false,
          },
          {
            beatId: "rbeat:b",
            text: "The contest tightens.",
            claimRefs: [],
            startOffset: 31,
            endOffset: 52,
            factualRisk: false,
          },
        ],
      } as never,
      manualContext: "Spain won 4-1 with 50 fouls in a chaotic night.",
    });
    assert.ok(adaptations.includes("unsupported_facts_omitted"));
    assert.equal(adaptations.includes("creative_premise_used"), false);
  });

  await check("[R15] concurrent requests isolate disposition/ledger", async () => {
    const [a, b] = await Promise.all([
      runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        planner: null,
        composer: makeRetentionComposer(),
        hookRunner: passRetentionHookRunner,
      }),
      runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        factHandlingMode: "creative_premise",
        premiseDetails: "Spain beat France 2–1.",
        planner: null,
        composer: () => {
          throw new Error("isolate");
        },
        hookRunner: passRetentionHookRunner,
      }),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) throw new Error("expected both ok");
    assert.notEqual(
      a.approved.generationDisposition?.disposition,
      undefined,
    );
    assert.ok(
      b.approved.generationDisposition?.adaptations.includes(
        "deterministic_story_fallback_used",
      ),
    );
  });

  // ── Sprint 10H.3B — Hook reconciliation + terminal ledger coherence ──

  const failAfterComposeHookRunner = (): {
    runner: RetentionHookRunner;
    hookInvocations: { count: number };
    modelInitialSuccesses: { count: number };
  } => {
    const hookInvocations = { count: 0 };
    const modelInitialSuccesses = { count: 0 };
    const runner: RetentionHookRunner = async (input) => {
      hookInvocations.count += 1;
      await input.modelCall({
        kind: "initial",
        topic: input.topic,
        tone: input.tone,
        duration: input.duration,
        scriptMode: input.scriptMode,
        context: input.context,
        templatePromptBlock: input.templatePromptBlock,
        hookDirectiveBlock: input.hookContext.directive.promptBlock,
        permittedClaimIds: input.hookContext.permittedClaimIds,
        qualityMode: input.qualityMode,
        model: input.model,
      });
      modelInitialSuccesses.count += 1;
      return {
        ok: false as const,
        error: "forced_explicit_hook_preference_failure",
        diagnostics: {
          contractVersion: input.hookContext.request.contractVersion,
          strategyId: input.hookContext.plan.strategyId,
          strategyVersion: input.hookContext.plan.strategyVersion,
          strategySource: input.hookContext.plan.strategySource,
          generationPath: input.hookContext.generationPath,
          requestFingerprint: input.hookContext.request.requestFingerprint,
          planFingerprint: input.hookContext.plan.planFingerprint,
          groundingStatus: "user_context_only" as const,
          validationOutcome: "fail" as const,
          repairAttempts: 0 as const,
          templateInfluenced: false,
          promptIntelligenceInfluenced: false,
          adapterRan: true,
          fallbackReason: "forced_preference_failure",
        },
        snapshot: input.hookContext.snapshot,
      };
    };
    return { runner, hookInvocations, modelInitialSuccesses };
  };

  const weakOpeningComposer = () => {
    return (request: Parameters<ReturnType<typeof makeRetentionComposer>>[0]) => {
      const n = request.orderedBeatIds.length;
      const segments = request.orderedBeatIds.map((beatId, i) => {
        if (i === 0) {
          return {
            beatId,
            text: joinOpeningAndBody(
              "Spain looks ready.",
              padSpokenWords(
                "Spain tactical focus reshapes this France preview tonight",
                8,
              ),
            ),
            claimRefs: [] as string[],
          };
        }
        const section = SECTION_WORDS[i] ?? "next";
        return {
          beatId,
          text: padSpokenWords(
            i === n - 1
              ? "Spain pressure closes this preview decisively tonight"
              : `Spain ${section} pressure advances with clear focus`,
            8,
          ),
          claimRefs: [] as string[],
        };
      });
      return {
        title: "Spain pressure story",
        hookClaimRefs: [] as string[],
        segments,
      };
    };
  };

  await check("[H3B-1] explicit Hook fail → zero-model Auto reconcile succeeds", async () => {
    const probe = failAfterComposeHookRunner();
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "provocative_question",
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: probe.runner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    assert.equal(probe.modelInitialSuccesses.count, 1);
    assert.equal(probe.hookInvocations.count, 1);
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
    );
    assert.equal(
      result.approved.generationDisposition?.adaptations.includes(
        "deterministic_story_fallback_used",
      ),
      false,
    );
    assert.equal(
      result.approved.safeDiagnostics.budget?.initialNarration,
      1,
    );
  });

  await check("[H3B-2] explicit+Auto fail → one deterministic rescue, no 3rd model", async () => {
    const probe = failAfterComposeHookRunner();
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "provocative_question",
      planner: null,
      composer: weakOpeningComposer(),
      hookRunner: async (input) => {
        // First preference attempt fails after compose; det rescue uses pass path.
        if (probe.hookInvocations.count === 0) {
          return probe.runner(input);
        }
        return passRetentionHookRunner(input);
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    // One model compose on first bridge; det rescue is zero-model.
    assert.equal(probe.modelInitialSuccesses.count, 1);
    const budget = result.approved.safeDiagnostics.budget;
    assert.ok(budget);
    assert.equal(budget.initialNarration, 1);
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "deterministic_story_fallback_used",
      ),
    );
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
    );
  });

  await check("[H3B-3] normal explicit Hook passes without reconciliation", async () => {
    let hooks = 0;
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "provocative_question",
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: async (input) => {
        hooks += 1;
        return passRetentionHookRunner(input);
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    assert.equal(hooks, 1);
    assert.equal(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
      false,
    );
  });

  await check("[H3B-4] Write My Own body failure preserves exact opening", async () => {
    const opening = "Wait for Spain's next surge.";
    let composeAttempts = 0;
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "user_written",
      userAuthoredHook: opening,
      planner: null,
      composer: async () => {
        composeAttempts += 1;
        if (composeAttempts === 1) {
          throw new Error("composer_call_failed");
        }
        // Should not reach a second model compose — det rescue owns body.
        throw new Error("unexpected_second_model_compose");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    assert.equal(composeAttempts, 1);
    const span = extractOpeningSpan(result.approved.narration);
    assert.ok(span);
    assert.equal(span.openingText, opening);
    assert.ok(result.approved.narration.startsWith(opening));
    assert.equal(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
      false,
    );
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "deterministic_story_fallback_used",
      ),
    );
    assert.equal(result.approved.hookDiagnostics.strategyId, "user_directed");
    assert.equal(result.approved.hookDiagnostics.strategySource, "user_authored");
  });

  await check("[H3B-5] Write My Own opening hard-gate → safe fail, no Auto", async () => {
    const opening = "Argentina recorded a win.";
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "user_written",
      userAuthoredHook: opening,
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: async (input) => {
        await input.modelCall({
          kind: "initial",
          topic: input.topic,
          tone: input.tone,
          duration: input.duration,
          scriptMode: input.scriptMode,
          context: input.context,
          templatePromptBlock: input.templatePromptBlock,
          hookDirectiveBlock: input.hookContext.directive.promptBlock,
          permittedClaimIds: input.hookContext.permittedClaimIds,
          qualityMode: input.qualityMode,
          model: input.model,
        });
        return {
          ok: false as const,
          error: "hard_gate",
          diagnostics: {
            contractVersion: input.hookContext.request.contractVersion,
            strategyId: input.hookContext.plan.strategyId,
            strategyVersion: input.hookContext.plan.strategyVersion,
            strategySource: input.hookContext.plan.strategySource,
            generationPath: input.hookContext.generationPath,
            requestFingerprint: input.hookContext.request.requestFingerprint,
            planFingerprint: input.hookContext.plan.planFingerprint,
            groundingStatus: "user_context_only" as const,
            validationOutcome: "fail" as const,
            repairAttempts: 0 as const,
            templateInfluenced: false,
            promptIntelligenceInfluenced: false,
            adapterRan: true,
            fallbackReason: "failed_hard_gate_safety",
          },
          snapshot: input.hookContext.snapshot,
        };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected failure");
    assert.equal(result.failureCategory, "hook_terminal_failure");
    assert.match(result.error, /Write My Own opening/i);
    assert.match(result.error, /Auto was not used/i);
    assert.ok(
      result.retentionDiagnostics.safeReasonIds.includes(
        "user_authored_opening_hard_gate_failure",
      ),
    );
  });

  await check("[H3B-6] forged second successful initial rejected", () => {
    const ledger = createRetentionModelCallLedger("cheap");
    ledger.consume("initial_narration");
    ledger.recordOutcome("initial_narration", "succeeded");
    ledger.consume("initial_narration");
    ledger.recordOutcome("initial_narration", "succeeded");
    assert.throws(
      () =>
        assertRetentionModelCallLedgerSnapshotCoherence(
          ledger.snapshot(),
          "cheap",
          {
            requireClosed: true,
            requireSuccessfulInitialNarration: true,
          },
        ),
      /model_call_ledger_invalid|RetentionStoryError/,
    );
  });

  await check("[H3B-7] stale model bridge cannot borrow later det marker", async () => {
    const env = await coherentEnvelope("cheap");
    const candidate = buildDeterministicFallbackNarrationCandidate({
      contract: env.contract,
      plan: env.plan,
      grounding: env.grounding,
    }).candidate;
    const ledger = makeEmptyReadyLedger("cheap");
    const stale = readyBridgeWithAuthority(
      candidate,
      env.plan,
      "cheap",
      ledger,
    );
    // Later deterministic marker appears on a divergent ledger snapshot.
    const later = createRetentionModelCallLedger("cheap");
    later.consume("initial_narration");
    later.recordOutcome("initial_narration", "succeeded");
    later.recordOutcome("initial_narration", "skipped_deterministic");
    const forged = {
      ...stale,
      diagnostics: {
        ...stale.diagnostics,
        budget: later.snapshot(),
        compositionAuthority: "model_initial" as const,
        composerAttempts:
          later.snapshot().counts.initial_narration +
          later.snapshot().counts.length_compression +
          later.snapshot().counts.hook_repair +
          later.snapshot().counts.hook_fallback,
      },
    };
    assert.throws(
      () =>
        assertRetentionHookBridgeReadyCoherence(forged, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
    );
  });

  await check("[H3B-8] concurrent Hook styles isolate candidate/ledger", async () => {
    const [explicit, wmo] = await Promise.all([
      runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        hookStyle: "provocative_question",
        planner: null,
        composer: makeRetentionComposer(),
        hookRunner: passRetentionHookRunner,
      }),
      runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        hookStyle: "user_written",
        userAuthoredHook: "Wait for Spain's next surge.",
        planner: null,
        composer: () => {
          throw new Error("wmo_body_fail");
        },
        hookRunner: passRetentionHookRunner,
      }),
    ]);
    assert.equal(explicit.ok, true);
    assert.equal(wmo.ok, true);
    if (!explicit.ok || !wmo.ok) throw new Error("expected both ok");
    assert.ok(
      wmo.approved.narration.startsWith("Wait for Spain's next surge."),
    );
    assert.equal(
      wmo.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
      false,
    );
    assert.notEqual(
      explicit.approved.candidateFingerprint,
      wmo.approved.candidateFingerprint,
    );
  });

  // ── Sprint 10H.5B — final Hook preference disposition coherence ──

  const reqProv = Object.freeze({
    strategyId: "provocative_question",
    strategySource: "user_selected",
    requestFingerprint: "req:prov",
    planFingerprint: "plan:prov",
  });

  await check("[H5B-1] Flexible explicit ID change → reconciliation", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "provocative_question",
      requestedHookPlan: reqProv,
      finalHookPlan: {
        strategyId: "cold_open",
        strategySource: "strategy_library",
      },
    });
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    assert.equal(derived.adaptation, "hook_style_reconciled");
  });

  await check("[H5B-2] Flexible explicit source-only change → reconciliation", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "provocative_question",
      requestedHookPlan: reqProv,
      finalHookPlan: {
        strategyId: "provocative_question",
        strategySource: "strategy_library",
      },
    });
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    assert.equal(derived.adaptation, "hook_style_reconciled");
  });

  await check("[H5B-3] Flexible exact ID/source → no reconciliation", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "provocative_question",
      requestedHookPlan: reqProv,
      finalHookPlan: reqProv,
    });
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    assert.equal(derived.adaptation, null);
  });

  await check("[H5B-4] Auto resolves any strategy → no reconciliation", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "auto",
      requestedHookPlan: {
        strategyId: "cold_open",
        strategySource: "strategy_library",
      },
      finalHookPlan: {
        strategyId: "stakes_first",
        strategySource: "prompt_intelligence",
      },
    });
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    assert.equal(derived.adaptation, null);
  });

  await check("[H5B-5] Write My Own exact → no reconciliation", () => {
    const wmo = Object.freeze({
      strategyId: "user_directed",
      strategySource: "user_authored",
    });
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "user_written",
      requestedHookPlan: wmo,
      finalHookPlan: wmo,
    });
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    assert.equal(derived.adaptation, null);
  });

  await check("[H5B-6] Write My Own mismatch → fail closed", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "user_written",
      requestedHookPlan: {
        strategyId: "user_directed",
        strategySource: "user_authored",
      },
      finalHookPlan: {
        strategyId: "cold_open",
        strategySource: "strategy_library",
      },
    });
    assert.equal(derived.status, "fail");
    if (derived.status !== "fail") throw new Error("expected fail");
    assert.equal(derived.safeReasonId, "user_authored_hook_authority_mismatch");
  });

  await check("[H5B-7] Precise exact → pass", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "precise",
      selectedHookStyle: "provocative_question",
      requestedHookPlan: reqProv,
      finalHookPlan: reqProv,
    });
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    assert.equal(derived.adaptation, null);
  });

  await check("[H5B-8] Precise mismatch → fail closed", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "precise",
      selectedHookStyle: "provocative_question",
      requestedHookPlan: reqProv,
      finalHookPlan: {
        strategyId: "cold_open",
        strategySource: "strategy_library",
      },
    });
    assert.equal(derived.status, "fail");
    if (derived.status !== "fail") throw new Error("expected fail");
    assert.equal(derived.safeReasonId, "precise_mode_no_silent_hook_auto");
  });

  await check("[H5B-9] forged/missing requested authority → fail closed", () => {
    const missing = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "provocative_question",
      requestedHookPlan: null,
      finalHookPlan: reqProv,
    });
    assert.equal(missing.status, "fail");
    const forged = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "provocative_question",
      requestedHookPlan: { strategyId: "", strategySource: "user_selected" },
      finalHookPlan: reqProv,
    });
    assert.equal(forged.status, "fail");
  });

  await check("[H5B-10] disposition note/adaptation coherence + no duplicates", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "provocative_question",
      requestedHookPlan: reqProv,
      finalHookPlan: {
        strategyId: "cold_open",
        strategySource: "strategy_library",
      },
    });
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    const contract = normalizeStoryContract(
      buildProductionStoryContractInput({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
      }),
    );
    const grounding = normalizeRetentionGroundingContext({
      version: 1,
      claims: [],
      researchIdentity: null,
    });
    const plan = buildReliabilityDeterministicRetentionPlan({
      contract,
      grounding,
      planner: null,
    });
    assert.equal(plan.status, "ready");
    if (plan.status !== "ready") throw new Error("expected plan");
    const disposition = buildRetentionGenerationDisposition({
      contract,
      plan: plan.plan,
      narration: "Spain pressure reshapes this France preview tonight with clear focus.",
      adaptations: ["hook_style_reconciled", "hook_style_reconciled"],
    });
    assert.equal(
      disposition.adaptations.filter((id) => id === "hook_style_reconciled")
        .length,
      1,
    );
    assert.ok(
      disposition.creatorFacingNotes.includes(HOOK_STYLE_RECONCILED_CREATOR_NOTE),
    );
    const coherent = assertRetentionHookPreferenceDispositionCoherence({
      derive: derived,
      adaptations: disposition.adaptations,
      creatorFacingNotes: disposition.creatorFacingNotes,
    });
    assert.equal(coherent.status, "ok");

    const falsePositive = assertRetentionHookPreferenceDispositionCoherence({
      derive: { status: "ok", adaptation: null },
      adaptations: ["hook_style_reconciled"],
      creatorFacingNotes: [HOOK_STYLE_RECONCILED_CREATOR_NOTE],
    });
    assert.equal(falsePositive.status, "fail");

    const missingAdapt = assertRetentionHookPreferenceDispositionCoherence({
      derive: derived,
      adaptations: [],
      creatorFacingNotes: [],
    });
    assert.equal(missingAdapt.status, "fail");
  });

  await check("[H5B-11] Flexible outer Auto rescue → reconciliation emitted", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "provocative_question",
      planner: null,
      composer: () => {
        throw new Error("force_outer_auto_rescue");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
    );
    assert.ok(
      result.approved.generationDisposition?.creatorFacingNotes.includes(
        HOOK_STYLE_RECONCILED_CREATOR_NOTE,
      ),
    );
    assert.notEqual(result.approved.hookPlan.strategyId, "provocative_question");
  });

  await check("[H5B-12] Flexible repair under same ID/source → no reconciliation", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "provocative_question",
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    assert.equal(result.approved.hookPlan.strategyId, "provocative_question");
    assert.equal(result.approved.hookPlan.strategySource, "user_selected");
    assert.equal(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
      false,
    );
  });

  await check("[H5B-13] Auto production path → no reconciliation", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "auto",
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    assert.equal(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
      false,
    );
  });

  await check("[H5B-14] Precise production exact → pass", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "provocative_question",
      creationReliabilityMode: "precise",
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    assert.equal(result.approved.hookPlan.strategyId, "provocative_question");
    assert.equal(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
      false,
    );
  });

  await check("[H5B-15] Precise production mismatch → fail closed", async () => {
    const probe = failAfterComposeHookRunner();
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "provocative_question",
      creationReliabilityMode: "precise",
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: probe.runner,
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected fail");
    assert.ok(
      result.retentionDiagnostics.safeReasonIds.includes(
        "precise_mode_no_silent_hook_auto",
      ),
    );
  });

  await check("[H5B-16] final after participant reconcile derives from final bridge", async () => {
    // Intermediate Auto reconcile (different strategy), then participant-coverage
    // rebuild restores the original explicit Hook context as the truly final bridge.
    let calls = 0;
    const result = await runRetentionProductionNarration({
      topic:
        "Argentina versus England dramatic match review — late pressure and a narrow finish",
      durationSec: 35,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "match_recap",
      formatStrategyId: "short_retention",
      hookStyle: "headline_first",
      planner: null,
      composer: async (request) => {
        calls += 1;
        const n = request.orderedBeatIds.length;
        // Argentina-only so participant reconcile must rebuild the final bridge.
        return {
          title: "Argentina only",
          hookClaimRefs: [],
          segments: request.orderedBeatIds.map((beatId, i) => ({
            beatId,
            text:
              i === 0
                ? joinOpeningAndBody(
                    "Argentina's late pressure decides everything.",
                    padSpokenWords(
                      "Argentina focus reshapes this review tonight",
                      8,
                    ),
                  )
                : i === n - 1
                  ? padSpokenWords(
                      "Argentina pressure closes this review tonight",
                      8,
                    )
                  : padSpokenWords(
                      "Argentina focus advances with clear intensity tonight",
                      8,
                    ),
            claimRefs: [],
          })),
        };
      },
      hookRunner: async (input) => {
        // Fail preference once so Auto reconcile installs a non-explicit plan.
        if (calls <= 1) {
          await input.modelCall({
            kind: "initial",
            topic: input.topic,
            tone: input.tone,
            duration: input.duration,
            scriptMode: input.scriptMode,
            context: input.context,
            templatePromptBlock: input.templatePromptBlock,
            hookDirectiveBlock: input.hookContext.directive.promptBlock,
            permittedClaimIds: input.hookContext.permittedClaimIds,
            qualityMode: input.qualityMode,
            model: input.model,
          });
          return {
            ok: false as const,
            error: "forced_explicit_hook_preference_failure",
            diagnostics: {
              contractVersion: input.hookContext.request.contractVersion,
              strategyId: input.hookContext.plan.strategyId,
              strategyVersion: input.hookContext.plan.strategyVersion,
              strategySource: input.hookContext.plan.strategySource,
              generationPath: input.hookContext.generationPath,
              requestFingerprint: input.hookContext.request.requestFingerprint,
              planFingerprint: input.hookContext.plan.planFingerprint,
              groundingStatus: "user_context_only" as const,
              validationOutcome: "fail" as const,
              repairAttempts: 0 as const,
              templateInfluenced: false,
              promptIntelligenceInfluenced: false,
              adapterRan: true,
              fallbackReason: "forced_preference_failure",
            },
            snapshot: input.hookContext.snapshot,
          };
        }
        return passRetentionHookRunner(input);
      },
    });
    assert.equal(result.ok, true, result.ok ? "" : `${result.failureCategory}:${result.retentionDiagnostics.safeReasonIds.join(",")}`);
    if (!result.ok) throw new Error("expected success");
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "participant_coverage_reconciled",
      ),
    );
    // Final bridge must drive disposition — not the intermediate Auto plan.
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "flexible",
      selectedHookStyle: "headline_first",
      requestedHookPlan: {
        strategyId: "headline_first",
        strategySource: "user_selected",
      },
      finalHookPlan: result.approved.hookPlan,
    });
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    const hasReconcile =
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ) === true;
    assert.equal(hasReconcile, derived.adaptation === "hook_style_reconciled");
    // After participant rebuild with original Hook context, final authority is
    // the requested explicit style — no reconciliation adaptation.
    assert.equal(result.approved.hookPlan.strategyId, "headline_first");
    assert.equal(result.approved.hookPlan.strategySource, "user_selected");
    assert.equal(hasReconcile, false);
  });

  await check("[H5B-17] JSON disposition matches Review explainability note", async () => {
    const probe = failAfterComposeHookRunner();
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      hookStyle: "provocative_question",
      planner: null,
      composer: makeRetentionComposer(),
      hookRunner: probe.runner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected success");
    assert.ok(
      result.approved.generationDisposition?.adaptations.includes(
        "hook_style_reconciled",
      ),
    );
    const note =
      result.approved.generationDisposition?.creatorFacingNotes.find((n) =>
        n.includes("Hook style was adjusted"),
      );
    assert.ok(note);
    const model = buildRetentionExplainabilityModel({
      retentionPlan: result.approved.planSnapshot,
      retentionValidation: result.approved.validationSummary,
      generationDisposition: result.approved.generationDisposition,
      formatStrategyId: result.approved.planSnapshot.formatStrategyId,
      durationSec: 30,
      factHandlingMode: "verified_facts_only",
    });
    assert.equal(model.available, true);
    const adaptationRow = model.rows.find((r) => r.id === "adaptations");
    assert.ok(adaptationRow?.value.includes("hook style reconciled"));
    assert.ok(model.rows.some((r) => r.value === note));
  });

  console.log("\nSPRINT 10H.3B HOOK RECONCILIATION AUTHORITY QA: PASS");
  console.log("SPRINT 10H.5B FINAL HOOK DISPOSITION COHERENCE QA: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
