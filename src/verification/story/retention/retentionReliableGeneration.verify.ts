/**
 * Sprint 10H.3 — reliable generation + Creative Premise deterministic QA.
 */

import assert from "node:assert/strict";

import { recommendCreateBrief } from "@/features/create/utils/recommend-create-brief";
import { buildDeterministicFallbackComposer } from "@/features/retention-story/composition/build-deterministic-fallback-composer";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { normalizeRetentionGroundingContext } from "@/features/retention-story/grounding/retention-grounding-normalization";
import { parseCreativePremiseFacts } from "@/features/retention-story/grounding/parse-creative-premise-facts";
import { buildRetentionGroundingContext } from "@/features/retention-story/grounding/build-retention-grounding-context";
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
import {
  joinOpeningAndBody,
  padSpokenWords,
} from "./retentionSpokenFixtureText";
import {
  makeRetentionComposer,
  passRetentionHookRunner,
} from "./retentionStoryQaDoubles";
import {
  readyBridgeWithAuthority,
  makeEmptyReadyLedger,
} from "./retentionStoryReadyBridge";
import { buildDeterministicFallbackNarrationCandidate } from "@/features/retention-story/composition/build-deterministic-fallback-narration";
import {
  SECTION_WORDS,
  coherentEnvelope,
} from "./retentionStoryCoherentEnvelope";

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
      assert.ok(
        adaptive.target >= 5 && adaptive.target <= 7,
        String(durationSec),
      );
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

  await check(
    "[R2A] Creative Premise prose paragraphs preserve each supplied fact",
    () => {
      const facts = parseCreativePremiseFacts(
        "Northbridge entered administration in 2018. Captain Elias Ward stayed. Academy players reached a cup semifinal. The run restored belief.",
      );
      assert.equal(facts.length, 4);
      assert.deepEqual(
        facts.map((fact) => fact.text),
        [
          "Northbridge entered administration in 2018.",
          "Captain Elias Ward stayed.",
          "Academy players reached a cup semifinal.",
          "The run restored belief.",
        ],
      );
    },
  );

  await check(
    "[R3] Creative Premise claims support narration only in that mode",
    () => {
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
    },
  );

  await check(
    "[R4] planner invalid → complete story with planner_fallback_used",
    async () => {
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
      assert.equal(
        result.ok,
        true,
        result.ok
          ? ""
          : `${result.failureCategory}: ${result.error}`,
      );
      if (!result.ok) throw new Error("expected ok");
      assert.ok(result.approved.narration.trim().length > 40);
      assert.ok(
        result.approved.generationDisposition?.adaptations.includes(
          "planner_fallback_used",
        ),
      );
    },
  );

  await check(
    "[R5] empty composer → deterministic fallback success",
    async () => {
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
      const narrationWords = result.approved.narration
        .trim()
        .split(/\s+/u)
        .filter(Boolean).length;
      assert.ok(narrationWords >= 6, `deterministic rescue used only ${narrationWords} words`);
      assert.ok(narrationWords <= Math.round(30 * 2.4));
      assert.match(result.approved.narration, /Spain/u);
      assert.match(result.approved.narration, /France/u);
      assert.doesNotMatch(
        result.approved.narration,
        /central idea|that connection|next part|consequence keeps growing|What decides/iu,
      );
      assert.equal(
        result.approved.generationDisposition?.disposition,
        "fallback",
      );
      assert.equal(
        result.approved.generationDisposition?.qualityBelowTarget,
        true,
      );
      assert.ok(
        result.approved.generationDisposition?.adaptations.includes(
          "deterministic_story_fallback_used",
        ) ||
          result.approved.generationDisposition?.adaptations.includes(
            "reliability_rescue_used",
          ),
      );
    },
  );

  await check(
    "[R5A] rich Build brief keeps creator facts and never leaks the instruction verb",
    () => {
      const topic =
        "Build a coherent opinion-led story about how a superstar departure may have helped Northport become stronger.";
      const manualContext = [
        "MANUAL NOTES",
        "- The superstar left Northport for Kingside in 2024",
        "- Northport won the continental title in 2025 and 2026",
        "- Northport signed a World Cup-winning forward",
        "- The coach wants a third consecutive continental title",
      ].join("\n");
      const contractInput = buildProductionStoryContractInput({
        topic,
        durationSec: 45,
        generationPath: "script_only",
        qualityMode: "balanced",
        factHandlingMode: "verified_facts_only",
        manualContext,
      });
      const contract = normalizeStoryContract(contractInput);
      const grounding = normalizeRetentionGroundingContext(
        contractInput.grounding!,
      );
      const plan = buildReliabilityDeterministicRetentionPlan({
        contract,
        grounding,
        manualContext,
        planner: null,
      });
      assert.equal(plan.status, "ready");
      if (plan.status !== "ready") throw new Error("expected ready plan");
      const built = buildDeterministicFallbackNarrationCandidate({
        contract,
        grounding,
        plan: plan.plan,
      });
      assert.doesNotMatch(built.candidate.assembledNarration, /\bBuild(?:'s)?\b/u);
      assert.match(
        built.candidate.assembledNarration,
        /Northport won the continental title in 2025 and 2026/u,
      );
      assert.match(
        built.candidate.assembledNarration,
        /Northport signed a World Cup-winning forward/u,
      );
      assert.ok(built.usedClaimIds.length >= 3);
    },
  );

  await check(
    "[R5B] production rescue rewards rich bullet notes in default fact mode",
    async () => {
      const result = await runRetentionProductionNarration({
        topic:
          "Build a coherent opinion-led story about how a superstar departure may have helped Northport become stronger.",
        manualContext: [
          "MANUAL NOTES",
          "- The superstar left Northport for Kingside in 2024",
          "- Northport won the continental title in 2025 and 2026",
          "- Northport signed a World Cup-winning forward",
          "- The coach wants a third consecutive continental title",
        ].join("\n"),
        durationSec: 45,
        generationPath: "script_only",
        qualityMode: "cheap",
        factHandlingMode: "verified_facts_only",
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
      if (!result.ok) throw new Error("expected fail-soft success");
      assert.doesNotMatch(result.approved.narration, /\bBuild(?:'s)?\b/u);
      assert.match(
        result.approved.narration,
        /Northport won the continental title in 2025 and 2026/u,
      );
      assert.match(
        result.approved.narration,
        /Northport signed a World Cup-winning forward/u,
      );
    },
  );

  await check(
    "[T1] vacuous deterministic fallback stays success but below target — never validation_pass",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Jordan Hale comeback after injury",
        durationSec: 45,
        generationPath: "script_only",
        qualityMode: "cheap",
        factHandlingMode: "verified_facts_only",
        planner: null,
        composer: () => {
          throw new Error("model composer unavailable");
        },
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      const disposition = result.approved.generationDisposition;
      assert.ok(disposition);
      assert.equal(disposition!.disposition, "fallback");
      assert.equal(disposition!.qualityBelowTarget, true);
      assert.ok(
        disposition!.adaptations.includes("deterministic_story_fallback_used"),
      );
      assert.ok(
        disposition!.creatorFacingNotes.some((n) =>
          /basic fallback narration was used/i.test(n),
        ),
      );
      const notes = result.approved.validationSummary.warningNotes;
      assert.ok(!notes.includes("validation_pass"));
      assert.ok(
        notes.includes("validation_pass_with_quality_warning") ||
          notes.includes("quality_below_target") ||
          notes.includes("deterministic_fallback_accepted"),
      );
      assert.ok(
        result.approved.validationSummary.storyQualityConfidence < 0.72,
        `storyQualityConfidence too high: ${result.approved.validationSummary.storyQualityConfidence}`,
      );
      const trace =
        disposition!.acceptanceTrace ??
        result.approved.safeDiagnostics.acceptanceTrace;
      assert.ok(trace);
      assert.equal(trace!.finalNarrationAuthority, "deterministic_rescue");
      assert.equal(trace!.deterministicRescueAccepted, true);
      assert.ok(trace!.earliestDecisiveRejection != null);
    },
  );

  await check(
    "[T2] fallen-giants match preview with two participants completes",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Northport versus Kingside continental preview",
        manualContext: [
          "Northport won the last two continental titles.",
          "Kingside signed three starters this summer.",
          "Northport press high from the first minute.",
          "Kingside prefer a low block and counters.",
        ].join("\n"),
        durationSec: 45,
        generationPath: "script_only",
        qualityMode: "cheap",
        scriptMode: "match_preview",
        factHandlingMode: "verified_facts_only",
        planner: null,
        composer: () => {
          throw new Error("model composer unavailable");
        },
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      assert.match(result.approved.narration, /Northport/u);
      assert.match(result.approved.narration, /Kingside/u);
      assert.equal(
        result.approved.generationDisposition?.disposition,
        "fallback",
      );
      assert.equal(
        result.approved.generationDisposition?.qualityBelowTarget,
        true,
      );
    },
  );

  await check(
    "[T3] five-player ranking with five named entries completes",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Rank five midfielders for the season awards",
        manualContext: [
          "Ava Rourke led assists for Harbor FC.",
          "Miles Chen controlled tempo for Eastbridge.",
          "Sofia Nguyen pressed highest for Lakeside.",
          "Omar Diallo won the most duels for Southgate.",
          "Elena Petrov created the most big chances for Westford.",
        ].join("\n"),
        durationSec: 50,
        generationPath: "script_only",
        qualityMode: "cheap",
        scriptMode: "top_5",
        factHandlingMode: "verified_facts_only",
        planner: null,
        composer: () => {
          throw new Error("model composer unavailable");
        },
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      assert.equal(
        result.approved.generationDisposition?.disposition,
        "fallback",
      );
      assert.equal(
        result.approved.generationDisposition?.qualityBelowTarget,
        true,
      );
      assert.ok(
        result.approved.validationSummary.storyQualityConfidence < 0.75,
      );
      const names = [
        "Ava",
        "Miles",
        "Sofia",
        "Omar",
        "Elena",
      ];
      const hitCount = names.filter((name) =>
        result.approved.narration.includes(name),
      ).length;
      assert.ok(
        hitCount >= 3,
        `expected ranking names in narration, hit=${hitCount}`,
      );
    },
  );

  await check(
    "[T4] strong coherent model narration remains accepted without fallback",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 40,
        generationPath: "script_only",
        qualityMode: "balanced",
        factHandlingMode: "verified_facts_only",
        planner: null,
        composer: makeRetentionComposer(),
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      const disposition = result.approved.generationDisposition;
      assert.ok(disposition);
      assert.notEqual(
        disposition!.disposition,
        "fallback",
        `unexpected fallback: ${JSON.stringify(disposition!.acceptanceTrace)}`,
      );
      assert.ok(
        !disposition!.adaptations.includes("deterministic_story_fallback_used"),
      );
      assert.match(result.approved.narration, /Spain|France|pressure/u);
      const trace = disposition!.acceptanceTrace;
      assert.ok(trace);
      assert.equal(trace!.finalNarrationAuthority, "model_direct");
      assert.equal(trace!.modelNarrationAccepted, true);
    },
  );

  await check(
    "[T5] weak coherent narration is not confused with broken filler",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "balanced",
        factHandlingMode: "verified_facts_only",
        planner: null,
        composer: (request) => {
          const n = request.orderedBeatIds.length;
          const budget = Math.round(request.durationSec * 2.4);
          const minPer = 4;
          const targetTotal = Math.min(
            Math.max(n * minPer, budget - 8),
            Math.max(n * minPer, Math.floor(budget * 0.78)),
          );
          const base = Math.floor(targetTotal / n);
          let rem = targetTotal - base * n;
          const segments = request.orderedBeatIds.map((beatId, i) => {
            const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
            if (rem > 0) rem -= 1;
            if (i === 0) {
              const open = "Why does Spain pressure matter?";
              const openWords = open.trim().split(/\s+/).filter(Boolean).length;
              return {
                beatId,
                text: joinOpeningAndBody(
                  open,
                  padSpokenWords(
                    "Spain keeps pressing France",
                    Math.max(3, target - openWords),
                  ),
                ),
                claimRefs: [] as string[],
              };
            }
            return {
              beatId,
              text: padSpokenWords(
                i === n - 1
                  ? "Spain keeps pressing France until the shape finally breaks"
                  : "Spain keeps pressing France",
                target,
              ),
              claimRefs: [] as string[],
            };
          });
          return {
            title: "Spain pressure story",
            hookClaimRefs: [] as string[],
            segments,
          };
        },
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      assert.ok(
        !result.approved.generationDisposition?.adaptations.includes(
          "deterministic_story_fallback_used",
        ),
        `unexpected fallback: ${JSON.stringify(result.approved.generationDisposition?.acceptanceTrace)}`,
      );
      assert.doesNotMatch(
        result.approved.narration,
        /begins with a choice whose consequence keeps growing/iu,
      );
    },
  );

  await check(
    "[T6] fact-rich narration with modest hook stays above broken filler",
    async () => {
      const { evaluateRetentionNarrationSubstance } = await import(
        "@/features/retention-story/validation/evaluate-retention-narration-substance"
      );
      const grounding = {
        version: 1 as const,
        researchIdentity: null,
        claims: [
          {
            claimId: "c1",
            text: "Jordan Hale tore his ACL in March 2024.",
            provenance: "manual_user" as const,
            verification: "unverified" as const,
            permittedFactualUse: true,
            forbidden: false,
            sourceRef: "manual_notes",
          },
          {
            claimId: "c2",
            text: "Hale returned for Northport in September 2025.",
            provenance: "manual_user" as const,
            verification: "unverified" as const,
            permittedFactualUse: true,
            forbidden: false,
            sourceRef: "manual_notes",
          },
          {
            claimId: "c3",
            text: "Hale scored in the continental final.",
            provenance: "manual_user" as const,
            verification: "unverified" as const,
            permittedFactualUse: true,
            forbidden: false,
            sourceRef: "manual_notes",
          },
        ],
      };
      const factRich = {
        assembledNarration:
          "Jordan Hale came back. Jordan Hale tore his ACL in March 2024. Hale returned for Northport in September 2025. Hale scored in the continental final.",
        segments: [
          { text: "Jordan Hale came back." },
          { text: "Jordan Hale tore his ACL in March 2024." },
          { text: "Hale returned for Northport in September 2025." },
          { text: "Hale scored in the continental final." },
        ],
      };
      const vacuous = {
        assembledNarration:
          "What decides Jordan Hale's outcome? Jordan Hale begins with a choice whose consequence keeps growing. That connection gives the next part. Together, those details bring Jordan Hale's central idea into focus.",
        segments: [
          { text: "What decides Jordan Hale's outcome?" },
          {
            text: "Jordan Hale begins with a choice whose consequence keeps growing.",
          },
          { text: "That connection gives the next part." },
          {
            text: "Together, those details bring Jordan Hale's central idea into focus.",
          },
        ],
      };
      const richEval = evaluateRetentionNarrationSubstance({
        topic: "Jordan Hale comeback after injury",
        grounding,
        candidate: factRich as never,
      });
      const vacuousEval = evaluateRetentionNarrationSubstance({
        topic: "Jordan Hale comeback after injury",
        grounding,
        candidate: vacuous as never,
      });
      assert.equal(vacuousEval.qualityBelowTarget, true);
      assert.ok(richEval.substanceScore > vacuousEval.substanceScore);
      assert.ok(vacuousEval.substanceScore < 0.34);
      assert.ok(
        richEval.creatorClaimCoverageRatio >= 0.66,
        `claim coverage too low: ${richEval.creatorClaimCoverageRatio}`,
      );
    },
  );

  await check(
    "[T7] meaningful hook with body payoff keeps model authority",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 40,
        generationPath: "script_only",
        qualityMode: "balanced",
        factHandlingMode: "verified_facts_only",
        planner: null,
        composer: (request) => {
          const n = request.orderedBeatIds.length;
          const budget = Math.round(request.durationSec * 2.4);
          const minPer = 4;
          const targetTotal = Math.min(
            Math.max(n * minPer, budget - 8),
            Math.max(n * minPer, Math.floor(budget * 0.78)),
          );
          const base = Math.floor(targetTotal / n);
          let rem = targetTotal - base * n;
          const segments = request.orderedBeatIds.map((beatId, i) => {
            const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
            if (rem > 0) rem -= 1;
            if (i === 0) {
              const open = "Why does Spain pressure matter?";
              const openWords = open.trim().split(/\s+/).filter(Boolean).length;
              return {
                beatId,
                text: joinOpeningAndBody(
                  open,
                  padSpokenWords(
                    "Spain tactical focus reshapes this France preview tonight",
                    Math.max(3, target - openWords),
                  ),
                ),
                claimRefs: [] as string[],
              };
            }
            const seed =
              i === n - 1
                ? "Spain pressure closes this preview by forcing France into deeper blocks"
                : `Spain ${SECTION_WORDS[i] ?? "next"} pressure advances with clear focus`;
            return {
              beatId,
              text: padSpokenWords(seed, target),
              claimRefs: [] as string[],
            };
          });
          return {
            title: "Spain pressure story",
            hookClaimRefs: [] as string[],
            segments,
          };
        },
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      assert.match(result.approved.narration, /Spain/u);
      assert.match(result.approved.narration, /France/u);
      assert.equal(
        result.approved.generationDisposition?.acceptanceTrace
          ?.finalNarrationAuthority,
        "model_direct",
      );
    },
  );

  await check(
    "[T8] short question hook without semantic payoff stays advisory-weak, not fallback-confused",
    async () => {
      const { evaluateRetentionNarrationSubstance } = await import(
        "@/features/retention-story/validation/evaluate-retention-narration-substance"
      );
      const emptyGrounding = {
        version: 1 as const,
        claims: [],
        researchIdentity: null,
      };
      const vacuousCandidate = {
        assembledNarration:
          "What decides Harbor's outcome? Harbor begins with a choice whose consequence keeps growing. That connection gives the next part. Together, those details bring Harbor's central idea into focus.",
        segments: [
          { text: "What decides Harbor's outcome?" },
          {
            text: "Harbor begins with a choice whose consequence keeps growing.",
          },
          { text: "That connection gives the next part." },
          {
            text: "Together, those details bring Harbor's central idea into focus.",
          },
        ],
      };
      const weak = evaluateRetentionNarrationSubstance({
        topic: "Harbor FC late equalizer",
        grounding: emptyGrounding,
        candidate: vacuousCandidate as never,
      });
      assert.equal(weak.qualityBelowTarget, true);
      assert.ok(weak.substanceScore < 0.34);
      assert.ok(weak.planningScaffoldDetected);

      const coherentCandidate = {
        assembledNarration:
          "Harbor FC found a late equalizer. Harbor FC equalized in the 88th minute and kept the tie alive.",
        segments: [
          { text: "Harbor FC found a late equalizer." },
          {
            text: "Harbor FC equalized in the 88th minute and kept the tie alive.",
          },
        ],
      };
      const coherent = evaluateRetentionNarrationSubstance({
        topic: "Harbor FC late equalizer",
        grounding: emptyGrounding,
        candidate: coherentCandidate as never,
      });
      assert.equal(coherent.planningScaffoldDetected, false);
      assert.ok(coherent.substanceScore > weak.substanceScore);
    },
  );

  await check(
    "[T9] no topic-specific production rules for football clubs or rankings",
    async () => {
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const root = join(
        process.cwd(),
        "src/features/retention-story/production/run-retention-production-narration.ts",
      );
      const src = readFileSync(root, "utf8");
      assert.doesNotMatch(src, /Manchester|Liverpool|Premier League/iu);
      assert.doesNotMatch(src, /if\s*\(.*club.*\)\s*\{/iu);
      assert.doesNotMatch(
        src,
        /scriptMode\s*===\s*["']top_5["']\s*&&\s*.*football/iu,
      );
    },
  );

  await check(
    "[R6] Creative Premise production path completes with fixture facts",
    async () => {
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
                claimRefs: [] as unknown as string[],
              };
            }
            if (i === n - 1) {
              return {
                beatId,
                text: "Spain pressure closes this preview decisively tonight.",
                claimRefs: [] as unknown as string[],
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
              claimRefs: [] as unknown as string[],
            };
          });
          return {
            title: "Spain vs France premise review",
            hookClaimRefs: [] as unknown as string[],
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
    },
  );

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

  await check(
    "[R8] reliability deterministic plan works for Studio quality",
    () => {
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
    },
  );

  await check(
    "[R9] mergeGroundingWithPremise recomputes researchIdentity",
    () => {
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
        claims: Object.freeze([...baseA.claims].reverse()),
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
      assert.notEqual(
        mergedA.researchIdentity,
        "stale-identity-must-not-survive",
      );
      assert.equal(
        mergedA.researchIdentity,
        buildResearchIdentityFromClaims(mergedA.claims),
      );
      assert.equal(mergedA.researchIdentity, mergedB.researchIdentity);
      assert.ok(mergedA.claims.some((c) => c.sourceRef === "creative_premise"));
      // Order-independent identity after normalize.
      const normA = normalizeRetentionGroundingContext(mergedA);
      const normB = normalizeRetentionGroundingContext(mergedB);
      assert.equal(normA.researchIdentity, normB.researchIdentity);
    },
  );

  await check(
    "[R10] composer throw → deterministic story, no 2nd model success",
    async () => {
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
      assert.equal(
        result.approved.generationDisposition?.disposition,
        "fallback",
      );
    },
  );

  await check(
    "[R11] empty Creative Premise details → story without premise used",
    async () => {
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
    },
  );

  await check(
    "[R12] Creative Premise composer fail still uses authorized facts",
    async () => {
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
        result.ok
          ? ""
          : `${result.failureCategory}: ${JSON.stringify(result.retentionDiagnostics)}`,
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
    },
  );

  await check(
    "[R13] safe subject anchor strips ungrounded result topics",
    () => {
      const risky = [
        "Argentina beat England 2–1",
        "Spain won the final",
        "France lost to Spain",
        "Argentina recorded a win",
      ];
      for (const topic of risky) {
        const anchor = resolveRetentionDeterministicSubjectAnchor(topic);
        assert.ok(anchor);
        assert.equal(
          /\b2\s*[-–]\s*1\b|\bwon the final\b|\blost to\b|\brecorded a win\b/i.test(
            anchor!,
          ),
          false,
          topic,
        );
      }
      assert.equal(
        resolveRetentionDeterministicSubjectAnchor("Argentina versus England"),
        "Argentina versus England",
      );
      assert.ok(resolveRetentionDeterministicSubjectAnchor("AC Milan"));
      assert.ok(resolveRetentionDeterministicSubjectAnchor("AS Roma"));
      assert.ok(resolveRetentionDeterministicSubjectAnchor("São Paulo"));
      assert.ok(resolveRetentionDeterministicSubjectAnchor("AI FC"));
    },
  );

  await check(
    "[R13A] full creator briefs produce bounded subject anchors",
    () => {
      const brief =
        "Tell the dramatic rise, fall, and attempted rebirth of Xabi Alonso. Begin with his extraordinary breakthrough at Bayer Leverkusen, then contrast that rise with pressure at Real Madrid.";
      const anchor = resolveRetentionDeterministicSubjectAnchor(brief);
      assert.ok(anchor);
      assert.match(anchor!, /Xabi Alonso/i);
      assert.doesNotMatch(anchor!, /^Tell\b/i);
      assert.ok(anchor!.length <= 96);
      assert.ok(anchor!.split(/\s+/).length <= 12);
    },
  );

  await check(
    "[R13A.1] instruction-only briefs stay out of subject and fact authority",
    async () => {
      assert.equal(
        resolveRetentionDeterministicSubjectAnchor("Explain the offside trap!"),
        "offside trap",
      );
      const grounding = buildRetentionGroundingContext({
        creatorBrief: "Explain the offside trap!",
      });
      assert.equal(grounding.claims.length, 0);

      const result = await runRetentionProductionNarration({
        topic: "Explain the offside trap!",
        durationSec: 25,
        generationPath: "script_only",
        qualityMode: "cheap",
        tone: "tactical",
        scriptMode: "tactical_review",
        formatStrategyId: "short_retention",
        factHandlingMode: "verified_facts_only",
        planner: null,
        composer: () => {
          throw new Error("model composer unavailable");
        },
        hookRunner: passRetentionHookRunner,
      });
      assert.equal(
        result.ok,
        true,
        result.ok
          ? ""
          : JSON.stringify({
              category: result.failureCategory,
              reasons: result.retentionDiagnostics.safeReasonIds,
              gates:
                result.retentionDiagnostics.validationFailureSummary
                  ?.failedHardGateIds,
            }),
      );
      if (!result.ok) throw new Error("expected instruction-only rescue");
      assert.doesNotMatch(result.approved.narration, /\bExplain(?:'s)?\b/i);
      assert.match(result.approved.narration, /\boffside\b/i);
      const sentences = result.approved.narration
        .split(/(?<=[.!?…])\s+/u)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      assert.equal(new Set(sentences).size, sentences.length);
    },
  );

  await check(
    "[R13A.2] changing a premise changes the rescued narration",
    async () => {
      const create = (topic: string, premiseDetails: string) =>
        runRetentionProductionNarration({
          topic,
          durationSec: 35,
          generationPath: "script_only",
          qualityMode: "balanced",
          tone: "tactical",
          scriptMode: "tactical_review",
          formatStrategyId: "short_retention",
          factHandlingMode: "creative_premise",
          premiseDetails,
          planner: null,
          composer: () => {
            throw new Error("model composer unavailable");
          },
          hookRunner: passRetentionHookRunner,
        });

      const riverside = await create(
        "Preview Riverside against Albion through the weak side.",
        "Albion press with two narrow forwards. Riverside’s weak-side winger stays high.",
      );
      const northbridge = await create(
        "Trace Northbridge FC through its rebuilding year.",
        "Northbridge entered administration in 2018. Captain Elias Ward stayed with the club.",
      );
      assert.equal(riverside.ok, true);
      assert.equal(northbridge.ok, true);
      if (!riverside.ok || !northbridge.ok) {
        throw new Error("expected premise-sensitive rescue");
      }
      assert.match(riverside.approved.narration, /narrow forwards/i);
      assert.match(riverside.approved.narration, /weak-side winger/i);
      assert.match(northbridge.approved.narration, /administration in 2018/i);
      assert.match(northbridge.approved.narration, /Elias Ward stayed/i);
      assert.notEqual(
        riverside.approved.narration,
        northbridge.approved.narration,
      );
    },
  );

  await check(
    "[R13B] Retention-first explicit Hook survives a long creator brief",
    async () => {
      const result = await runRetentionProductionNarration({
        topic:
          "Tell the dramatic rise, fall, and attempted rebirth of Xabi Alonso. Begin with his extraordinary breakthrough at Bayer Leverkusen, then contrast that rise with pressure at Real Madrid and his new challenge at Chelsea.",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        tone: "dramatic",
        scriptMode: "story",
        formatStrategyId: "short_retention",
        hookStyle: "provocative_question",
        factHandlingMode: "creative_premise",
        premiseDetails:
          "Chelsea and Alonso are two damaged reputations taking one enormous gamble on each other.",
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
      assert.ok(result.approved.narration.trim().length > 20);
    },
  );

  await check("[R14] Grounded story keeps creator facts eligible", () => {
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
        assembledNarration:
          "Why does Spain pressure matter? The contest tightens.",
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
    const creatorClaims = grounding.claims.filter(
      (claim) => claim.sourceRef === "manual_context",
    );
    assert.ok(creatorClaims.length > 0);
    assert.ok(
      creatorClaims.every((claim) =>
        isClaimEligibleForNarrationSupport(
          grounding,
          claim.claimId,
          "verified_facts_only",
        ),
      ),
    );
    assert.equal(adaptations.includes("unsupported_facts_omitted"), false);
    assert.equal(adaptations.includes("creative_premise_used"), false);
  });

  await check(
    "[R15] concurrent requests isolate disposition/ledger",
    async () => {
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
      assert.notEqual(a.approved.generationDisposition?.disposition, undefined);
      assert.ok(
        b.approved.generationDisposition?.adaptations.includes(
          "deterministic_story_fallback_used",
        ),
      );
    },
  );

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
    return (
      request: Parameters<ReturnType<typeof makeRetentionComposer>>[0],
    ) => {
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
            claimRefs: [] as unknown as string[],
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
          claimRefs: [] as unknown as string[],
        };
      });
      return {
        title: "Spain pressure story",
        hookClaimRefs: [] as unknown as string[],
        segments,
      };
    };
  };

  await check(
    "[H3B-1] explicit Hook fail after canonical accept keeps model narration",
    async () => {
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
      assert.equal(result.approved.safeDiagnostics.budget?.initialNarration, 1);
      assert.equal(probe.hookInvocations.count, 0);
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "hook_style_reconciled",
        ),
        false,
      );
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "deterministic_story_fallback_used",
        ),
        false,
      );
      assert.equal(result.approved.safeDiagnostics.budget?.initialNarration, 1);
    },
  );

  await check(
    "[H3B-2] weak opening still kept after Hook fail when canonical accept holds",
    async () => {
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
          if (probe.hookInvocations.count === 0) {
            return probe.runner(input);
          }
          return passRetentionHookRunner(input);
        },
      });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      const budget = result.approved.safeDiagnostics.budget;
      assert.ok(budget);
      assert.equal(budget.initialNarration, 1);
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "deterministic_story_fallback_used",
        ),
        false,
      );
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "hook_style_reconciled",
        ),
        false,
      );
    },
  );

  await check(
    "[H3B-3] normal explicit Hook passes without reconciliation",
    async () => {
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
      assert.equal(hooks, 0);
      assert.equal(result.approved.safeDiagnostics.budget?.initialNarration, 1);
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "hook_style_reconciled",
        ),
        false,
      );
    },
  );

  await check(
    "[H3B-4] Write My Own body failure preserves exact opening",
    async () => {
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
      assert.equal(
        result.approved.hookDiagnostics.strategySource,
        "user_authored",
      );
    },
  );

  await check(
    "[H3B-5] Write My Own opening hard-gate → visible Auto reconciliation",
    async () => {
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
      assert.equal(
        result.ok,
        true,
        result.ok
          ? ""
          : JSON.stringify({
              category: result.failureCategory,
              reasons: result.retentionDiagnostics.safeReasonIds,
              gates:
                result.retentionDiagnostics.validationFailureSummary
                  ?.failedHardGateIds,
            }),
      );
      if (!result.ok) throw new Error("expected fail-soft success");
      assert.notEqual(result.approved.hookDiagnostics.strategyId, "user_directed");
      assert.ok(
        result.approved.generationDisposition?.adaptations.includes(
          "hook_style_reconciled",
        ),
      );
    },
  );

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

  await check(
    "[H3B-7] stale model bridge cannot borrow later det marker",
    async () => {
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
      assert.throws(() =>
        assertRetentionHookBridgeReadyCoherence(forged, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      );
    },
  );

  await check(
    "[H3B-8] concurrent Hook styles isolate candidate/ledger",
    async () => {
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
    },
  );

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

  await check(
    "[H5B-2] Flexible explicit source-only change → reconciliation",
    () => {
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
    },
  );

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

  await check("[H5B-6] Write My Own mismatch → visible reconciliation", () => {
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
    assert.equal(derived.status, "ok");
    if (derived.status !== "ok") throw new Error("expected ok");
    assert.equal(derived.adaptation, "hook_style_reconciled");
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

  await check("[H5B-8] Precise mismatch → visible reconciliation", () => {
    const derived = deriveRetentionHookPreferenceAdaptation({
      reliabilityMode: "precise",
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

  await check(
    "[H5B-9] forged/missing requested authority → fail closed",
    () => {
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
    },
  );

  await check(
    "[H5B-10] disposition note/adaptation coherence + no duplicates",
    () => {
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
      const contractInput = buildProductionStoryContractInput({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
      });
      const contract = normalizeStoryContract(contractInput);
      const grounding = normalizeRetentionGroundingContext(
        contractInput.grounding!,
      );
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
        narration:
          "Spain pressure reshapes this France preview tonight with clear focus.",
        adaptations: ["hook_style_reconciled", "hook_style_reconciled"],
      });
      assert.equal(
        disposition.adaptations.filter((id) => id === "hook_style_reconciled")
          .length,
        1,
      );
      assert.ok(
        disposition.creatorFacingNotes.includes(
          HOOK_STYLE_RECONCILED_CREATOR_NOTE,
        ),
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
    },
  );

  await check(
    "[H5B-11] Flexible outer Auto rescue → reconciliation emitted",
    async () => {
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
      assert.notEqual(
        result.approved.hookPlan.strategyId,
        "provocative_question",
      );
    },
  );

  await check(
    "[H5B-12] Flexible repair under same ID/source → no reconciliation",
    async () => {
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
    },
  );

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

  await check(
    "[H5B-15] Precise production Hook fail after canonical accept keeps narration",
    async () => {
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
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected success");
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "hook_style_reconciled",
        ),
        false,
      );
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "deterministic_story_fallback_used",
        ),
        false,
      );
    },
  );

  await check(
    "[H5B-16] final after participant reconcile derives from final bridge",
    async () => {
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
                requestFingerprint:
                  input.hookContext.request.requestFingerprint,
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
      assert.equal(
        result.ok,
        true,
        result.ok
          ? ""
          : `${result.failureCategory}:${result.retentionDiagnostics.safeReasonIds.join(",")}`,
      );
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
      assert.equal(
        hasReconcile,
        derived.adaptation === "hook_style_reconciled",
      );
      // After participant rebuild with original Hook context, final authority is
      // the requested explicit style — no reconciliation adaptation.
      assert.equal(result.approved.hookPlan.strategyId, "headline_first");
      assert.equal(result.approved.hookPlan.strategySource, "user_selected");
      assert.equal(hasReconcile, false);
    },
  );

  await check(
    "[H5B-17] JSON disposition matches Review explainability after kept Hook fail",
    async () => {
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
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "hook_style_reconciled",
        ),
        false,
      );
      const note =
        result.approved.generationDisposition?.creatorFacingNotes.find((n) =>
          n.includes("Hook style was adjusted"),
        );
      assert.equal(note, undefined);
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
      assert.equal(
        adaptationRow?.value.includes("hook style reconciled") ?? false,
        false,
      );
    },
  );

  console.log("\nSPRINT 10H.3B HOOK RECONCILIATION AUTHORITY QA: PASS");
  console.log("SPRINT 10H.5B FINAL HOOK DISPOSITION COHERENCE QA: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
