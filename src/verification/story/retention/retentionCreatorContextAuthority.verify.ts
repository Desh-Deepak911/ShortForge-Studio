/**
 * Sprint 10H.4A — creator-context vs research authority fixtures.
 * Network-free production-level verification.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import {
  assertRetentionCreatorContextAuthorityMatchesContract,
  buildRetentionCreatorContextAuthority,
  buildProductionStoryContractInput,
  buildRetentionSafeResponseEnvelope,
  commitRetentionApprovedNarration,
  normalizeStoryContract,
  runRetentionProductionNarration,
  runRetentionTerminalValidation,
  validateRetentionStoryCandidate,
  type RetentionBodyRewriteCallback,
} from "@/features/retention-story";
import { buildRetentionGroundingContext } from "@/features/retention-story/grounding/build-retention-grounding-context";
import { creatorSafeErrorMessage } from "@/features/retention-story/production/map-retention-production-failure";
import { buildRetentionNarrationCandidateFromProposal } from "@/features/retention-story/composition/build-retention-narration-candidate";

import {
  coherentEnvelope,
  SECTION_WORDS,
} from "./retentionStoryCoherentEnvelope";
import {
  assertNoSecrets,
  retentionProductionDoubles,
} from "./retentionStoryQaDoubles";
import { readyBridgeWithAuthority } from "./retentionStoryReadyBridge";
import {
  joinOpeningAndBody,
  padSpokenWords,
} from "./retentionSpokenFixtureText";
import { countRetentionNarrationWords } from "@/features/retention-story";
import { isClaimEligibleForNarrationSupport } from "@/features/retention-story/strategy/retention-claim-support";

const REALISTIC_35_TOPIC =
  "Argentina versus England dramatic match review — late pressure, fouls, and a narrow 2–1 finish that still feels unfinished";
const REALISTIC_35_CONTEXT = [
  "Focus on the emotional swing after the equalizer.",
  "Keep the narration qualitative: intensity, discipline, and late-game nerve.",
  "Do not invent extra scorelines or player statistics beyond the brief.",
  "End on why the result still leaves an open question for the next meeting.",
].join("\n");
const CREATIVE_PREMISE_DETAILS = [
  "Argentina beat England 2–1.",
  "The match had 26 fouls.",
  "The match had 35 tackles.",
].join("\n");
const RESEARCH_PROSE =
  "Assembled research: Argentina recorded 26 fouls and 35 tackles in a 2–1 win over England.";

function minimalAssembled(researchText: string): AssembledContext {
  return {
    queryId: "q-creator-auth",
    topic: "Argentina versus England",
    selectedMode: "match_recap",
    intent: {
      intent: "match",
      subIntent: "review",
      confidence: "high",
      confidencePercent: 90,
      confidenceScore: 0.9,
      matchedPatterns: [],
      reasoning: "test",
      topic: {
        raw: "Argentina versus England",
        normalized: "argentina versus england",
        tokens: ["argentina", "versus", "england"],
      },
    } as unknown as AssembledContext["intent"],
    entities: [],
    verifiedFacts: [
      {
        id: "af-research-1",
        text: researchText,
        provenance: {
          source: "api-football",
          fetchedAt: "2020-01-01T00:00:00.000Z",
        },
      },
    ],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    manualNotes: "",
    warnings: [],
    confidence: { tier: "medium", percent: 70 },
    provenance: {
      source: "api-football",
      fetchedAt: "2020-01-01T00:00:00.000Z",
    },
    promptSections: [],
    diagnostics: [],
  };
}

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function fittingProposal(
  plan: Awaited<ReturnType<typeof coherentEnvelope>>["plan"],
) {
  const budget = plan.compressionGoals.targetWordBudget;
  const n = plan.beatPlan.beats.length;
  const minPer = 4;
  const targetTotal = Math.min(
    Math.max(n * minPer, budget - 8),
    Math.max(n * minPer, Math.floor(budget * 0.78)),
  );
  const base = Math.floor(targetTotal / n);
  let rem = targetTotal - base * n;
  return {
    title: "Spain pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: plan.beatPlan.beats.map((beat, i) => {
      const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem -= 1;
      const section = SECTION_WORDS[i] ?? "next";
      if (i === 0) {
        const open = "Why does Spain pressure matter?";
        const body = padSpokenWords(
          "Spain focus reshapes this preview tonight",
          Math.max(3, target - countRetentionNarrationWords(open)),
        );
        return {
          beatId: beat.id,
          text: joinOpeningAndBody(open, body),
          claimRefs: [] as unknown as string[],
        };
      }
      const seed =
        i === n - 1
          ? "Spain pressure closes this preview tonight"
          : `Spain ${section} focus advances tonight`;
      return {
        beatId: beat.id,
        text: padSpokenWords(seed, target),
        claimRefs: [] as unknown as string[],
      };
    }),
  };
}

async function main(): Promise<void> {
  console.log("retentionCreatorContextAuthority (Sprint 10H.4A)\n");

  await check("[C1] 35s Studio brief with manual context → Pass", async () => {
    const result = await runRetentionProductionNarration({
      topic: REALISTIC_35_TOPIC,
      durationSec: 35,
      generationPath: "script_only",
      qualityMode: "best",
      scriptMode: "match_recap",
      formatStrategyId: "short_retention",
      factHandlingMode: "verified_facts_only",
      manualContext: REALISTIC_35_CONTEXT,
      ...retentionProductionDoubles("best"),
    });
    assert.equal(result.ok, true, result.ok ? "" : result.failureCategory);
    if (result.ok) {
      assert.ok(result.approved.contractFingerprint);
      assert.equal(
        JSON.stringify(result.approved).includes(
          REALISTIC_35_CONTEXT.slice(0, 40),
        ),
        false,
      );
    }
  });

  await check(
    "[C1A] default Grounded story authorizes brief facts and additional notes",
    () => {
      const input = buildProductionStoryContractInput({
        topic:
          "Manchester United must sell before buying! A Friday midfield bid is expected.",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "balanced",
        factHandlingMode: "verified_facts_only",
        manualContext:
          "A rival may move first. Keep the uncertainty clear and do not name a target.",
      });
      const grounding = input.grounding!;
      const creatorClaims = grounding.claims.filter(
        (claim) =>
          claim.sourceRef === "creator_brief" ||
          claim.sourceRef === "manual_context",
      );
      assert.ok(creatorClaims.length >= 4);
      assert.ok(
        creatorClaims.some((claim) => claim.text.endsWith("!")),
        "ordinary punctuation must survive as creator material",
      );
      for (const claim of creatorClaims) {
        assert.equal(claim.provenance, "manual_user");
        assert.equal(claim.verification, "unverified");
        assert.equal(claim.permittedFactualUse, true);
        assert.equal(
          isClaimEligibleForNarrationSupport(
            grounding,
            claim.claimId,
            "verified_facts_only",
          ),
          true,
        );
      }
    },
  );

  await check(
    "[C2] Creative Premise + manual context → Pass with premise facts",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Argentina versus England match review",
        durationSec: 35,
        generationPath: "script_only",
        qualityMode: "balanced",
        scriptMode: "match_recap",
        formatStrategyId: "short_retention",
        factHandlingMode: "creative_premise",
        premiseDetails: CREATIVE_PREMISE_DETAILS,
        manualContext: REALISTIC_35_CONTEXT,
        ...retentionProductionDoubles("balanced"),
      });
      assert.equal(result.ok, true, result.ok ? "" : result.failureCategory);
      const contractInput = buildProductionStoryContractInput({
        topic: "Argentina versus England match review",
        durationSec: 35,
        generationPath: "script_only",
        qualityMode: "balanced",
        factHandlingMode: "creative_premise",
        premiseDetails: CREATIVE_PREMISE_DETAILS,
        manualContext: REALISTIC_35_CONTEXT,
      });
      const premiseClaims = (contractInput.grounding?.claims ?? []).filter(
        (c) => c.sourceRef === "creative_premise",
      );
      assert.ok(premiseClaims.length >= 3);
      const normalized = normalizeStoryContract(contractInput);
      assert.ok(normalized.identities.manualContextIdentity);
    },
  );

  await check(
    "[C3] Creative Premise + structured Smart Research → Pass",
    async () => {
      const assembled = minimalAssembled(RESEARCH_PROSE);
      const result = await runRetentionProductionNarration({
        topic: "Argentina versus England match review",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "balanced",
        scriptMode: "match_recap",
        formatStrategyId: "short_retention",
        factHandlingMode: "creative_premise",
        premiseDetails: CREATIVE_PREMISE_DETAILS,
        assembledContext: assembled,
        generationContext: RESEARCH_PROSE,
        ...retentionProductionDoubles("balanced"),
      });
      assert.equal(result.ok, true, result.ok ? "" : result.failureCategory);
    },
  );

  await check(
    "[C4] Smart Research with no creator context → manual identity null",
    () => {
      const assembled = minimalAssembled(RESEARCH_PROSE);
      const input = buildProductionStoryContractInput({
        topic: "Argentina versus England match review",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "balanced",
        assembledContext: assembled,
      });
      const contract = normalizeStoryContract(input);
      assert.equal(contract.identities.manualContextIdentity, null);
      assert.ok(contract.groundingSummary.researchIdentity);
    },
  );

  await check(
    "[C5] Resolved research prose is not hashed as manual context",
    () => {
      const assembled = minimalAssembled(RESEARCH_PROSE);
      const withResearchOnly = normalizeStoryContract(
        buildProductionStoryContractInput({
          topic: "Argentina versus England",
          durationSec: 30,
          generationPath: "script_only",
          qualityMode: "cheap",
          assembledContext: assembled,
        }),
      );
      const researchAsManual = normalizeStoryContract(
        buildProductionStoryContractInput({
          topic: "Argentina versus England",
          durationSec: 30,
          generationPath: "script_only",
          qualityMode: "cheap",
          manualContext: RESEARCH_PROSE,
        }),
      );
      assert.equal(withResearchOnly.identities.manualContextIdentity, null);
      assert.ok(researchAsManual.identities.manualContextIdentity);
      assert.notEqual(
        withResearchOnly.identities.manualContextIdentity,
        researchAsManual.identities.manualContextIdentity,
      );
    },
  );

  await check(
    "[C6] Creator manual + research keep separate authorities",
    () => {
      const assembled = minimalAssembled(RESEARCH_PROSE);
      const authority = buildRetentionCreatorContextAuthority({
        manualContext: REALISTIC_35_CONTEXT,
      });
      const input = buildProductionStoryContractInput({
        topic: "Argentina versus England",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        manualContext: authority.manualContext,
        assembledContext: assembled,
      });
      const contract = normalizeStoryContract(input);
      assert.equal(
        contract.identities.manualContextIdentity,
        authority.manualContextIdentity,
      );
      assert.ok(contract.groundingSummary.researchIdentity);
      assert.notEqual(
        contract.identities.manualContextIdentity,
        contract.groundingSummary.researchIdentity,
      );
      const grounding = buildRetentionGroundingContext({
        creatorBrief: "Argentina versus England",
        assembledContext: assembled,
        manualContext: authority.manualContext,
      });
      assert.ok(
        grounding.claims.some((c) => c.provenance === "research_provider"),
      );
      assert.ok(grounding.claims.some((c) => c.provenance === "manual_user"));
    },
  );

  await check(
    "[C7] Validation receives same context authority as planning",
    async () => {
      const authority = buildRetentionCreatorContextAuthority({
        manualContext: REALISTIC_35_CONTEXT,
      });
      const env = await coherentEnvelope("cheap", {
        manualContext: authority.manualContext,
      });
      assert.equal(
        env.contract.identities.manualContextIdentity,
        authority.manualContextIdentity,
      );
      const candidate = buildRetentionNarrationCandidateFromProposal({
        proposal: fittingProposal(env.plan),
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        origin: "after_hook_approval",
      }).candidate;
      const bridge = readyBridgeWithAuthority(
        candidate,
        env.plan,
        "cheap",
        env.ledger,
      );
      const outcome = validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
        creatorContextAuthority: authority,
      });
      assert.equal(outcome.status, "validated");
      assertRetentionCreatorContextAuthorityMatchesContract(
        authority,
        env.contract,
      );
    },
  );

  await check(
    "[C8] Validation with null context when contract expects context → fail closed",
    async () => {
      const authority = buildRetentionCreatorContextAuthority({
        manualContext: REALISTIC_35_CONTEXT,
      });
      const env = await coherentEnvelope("cheap", {
        manualContext: authority.manualContext,
      });
      const candidate = buildRetentionNarrationCandidateFromProposal({
        proposal: fittingProposal(env.plan),
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        origin: "after_hook_approval",
      }).candidate;
      const bridge = readyBridgeWithAuthority(
        candidate,
        env.plan,
        "cheap",
        env.ledger,
      );
      const outcome = validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
        creatorContextAuthority: null,
      });
      assert.equal(outcome.status, "failed");
      if (outcome.status === "failed") {
        assert.equal(outcome.reason, "creator_context_identity_mismatch");
      }
    },
  );

  await check(
    "[C9] Validation with changed context → fail closed",
    async () => {
      const authority = buildRetentionCreatorContextAuthority({
        manualContext: REALISTIC_35_CONTEXT,
      });
      const env = await coherentEnvelope("cheap", {
        manualContext: authority.manualContext,
      });
      const candidate = buildRetentionNarrationCandidateFromProposal({
        proposal: fittingProposal(env.plan),
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        origin: "after_hook_approval",
      }).candidate;
      const bridge = readyBridgeWithAuthority(
        candidate,
        env.plan,
        "cheap",
        env.ledger,
      );
      const changed = buildRetentionCreatorContextAuthority({
        manualContext: "Completely different creator notes for mismatch.",
      });
      const outcome = validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
        creatorContextAuthority: changed,
      });
      assert.equal(outcome.status, "failed");
      if (outcome.status === "failed") {
        assert.equal(outcome.reason, "creator_context_identity_mismatch");
      }
    },
  );

  await check(
    "[C10] Validation with creator/research contexts swapped → fail closed",
    async () => {
      const authority = buildRetentionCreatorContextAuthority({
        manualContext: REALISTIC_35_CONTEXT,
      });
      const env = await coherentEnvelope("cheap", {
        manualContext: authority.manualContext,
      });
      const candidate = buildRetentionNarrationCandidateFromProposal({
        proposal: fittingProposal(env.plan),
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        origin: "after_hook_approval",
      }).candidate;
      const bridge = readyBridgeWithAuthority(
        candidate,
        env.plan,
        "cheap",
        env.ledger,
      );
      const swapped = buildRetentionCreatorContextAuthority({
        manualContext: RESEARCH_PROSE,
      });
      const outcome = validateRetentionStoryCandidate({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
        creatorContextAuthority: swapped,
      });
      assert.equal(outcome.status, "failed");
      if (outcome.status === "failed") {
        assert.equal(outcome.reason, "creator_context_identity_mismatch");
      }
    },
  );

  await check("[C11] Commit gate with correct context → Pass", async () => {
    const authority = buildRetentionCreatorContextAuthority({
      manualContext: REALISTIC_35_CONTEXT,
    });
    const result = await runRetentionProductionNarration({
      topic: "Argentina versus England match review",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      manualContext: authority.manualContext,
      ...retentionProductionDoubles("cheap"),
    });
    assert.equal(result.ok, true);
  });

  await check("[C12] Commit gate with stale context → reject", async () => {
    const authority = buildRetentionCreatorContextAuthority({
      manualContext: REALISTIC_35_CONTEXT,
    });
    const env = await coherentEnvelope("cheap", {
      manualContext: authority.manualContext,
    });
    const candidate = buildRetentionNarrationCandidateFromProposal({
      proposal: fittingProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "after_hook_approval",
    }).candidate;
    const bridge = readyBridgeWithAuthority(
      candidate,
      env.plan,
      "cheap",
      env.ledger,
    );
    const terminal = await runRetentionTerminalValidation({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
      ledger: env.ledger,
      creatorContextAuthority: authority,
    });
    assert.ok(
      terminal.status === "pass_without_rewrite" ||
        terminal.status === "pass_after_rewrite",
      terminal.status,
    );
    const stale = buildRetentionCreatorContextAuthority({
      manualContext: "Stale notes that no longer match the contract.",
    });
    const committed = commitRetentionApprovedNarration({
      terminal,
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      ledger: env.ledger,
      title: bridge.title,
      creatorContextAuthority: stale,
    });
    assert.equal(committed.ok, false);
  });

  await check(
    "[C13] Post-rewrite validation retains context authority",
    async () => {
      const authority = buildRetentionCreatorContextAuthority({
        manualContext: REALISTIC_35_CONTEXT,
      });
      const env = await coherentEnvelope("best", {
        manualContext: authority.manualContext,
      });
      const candidate = buildRetentionNarrationCandidateFromProposal({
        proposal: fittingProposal(env.plan),
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        origin: "after_hook_approval",
      }).candidate;
      // Force a rewrite-eligible weak editorial path when possible; otherwise
      // prove post-rewrite call site still accepts the same authority.
      const bridge = readyBridgeWithAuthority(
        candidate,
        env.plan,
        "best",
        env.ledger,
      );
      const rewriteComposer: RetentionBodyRewriteCallback = async ({
        currentCandidate,
      }) => ({
        title: "Argentina versus England",
        hookClaimRefs: [],
        segments: currentCandidate.segments.map((segment) => ({
          beatId: segment.beatId,
          text: segment.text,
          claimRefs: [...segment.claimRefs],
        })),
      });
      const terminal = await runRetentionTerminalValidation({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
        ledger: env.ledger,
        rewriteComposer,
        creatorContextAuthority: authority,
      });
      assert.ok(
        terminal.status === "pass_without_rewrite" ||
          terminal.status === "pass_after_rewrite" ||
          terminal.status === "rewrite_not_allowed" ||
          terminal.status === "post_rewrite_retention_failed" ||
          terminal.status === "post_rewrite_hook_failed" ||
          terminal.status === "rewrite_proposal_invalid" ||
          terminal.status === "opening_preservation_failed",
        terminal.status,
      );
      // Authority mismatch must not be the failure mode when authority is correct.
      assert.equal(
        terminal.diagnostics.safeReasonIds.includes(
          "creator_context_identity_mismatch",
        ),
        false,
      );
    },
  );

  await check(
    "[C14] JSON/NDJSON contain no raw context authority",
    async () => {
      const result = await runRetentionProductionNarration({
        topic: "Argentina versus England match review",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        manualContext: REALISTIC_35_CONTEXT,
        generationContext: RESEARCH_PROSE,
        ...retentionProductionDoubles("cheap"),
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const envelope = buildRetentionSafeResponseEnvelope(result);
      const blob = JSON.stringify({
        type: "complete",
        success: true,
        ...envelope,
        hookPlan: result.approved.hookPlan,
        hookDiagnostics: result.approved.hookDiagnostics,
      });
      assert.equal(blob.includes(REALISTIC_35_CONTEXT.slice(0, 32)), false);
      assert.equal(blob.includes(RESEARCH_PROSE.slice(0, 32)), false);
      assert.equal(blob.includes("creatorContextAuthority"), false);
      assert.equal(blob.includes("manualContextIdentity"), false);
      assertNoSecrets(blob);
    },
  );

  await check("[C15] Draft persistence keeps original creator notes", () => {
    const createFlow = readFileSync(
      path.join(
        process.cwd(),
        "src/features/create/components/CreateStoryFlow.tsx",
      ),
      "utf8",
    );
    assert.doesNotMatch(createFlow, /context:\s*data\.generationContext/);
    assert.match(createFlow, /Persist original creator notes only/);
    assert.match(createFlow, /researchApplied/);
  });

  await check(
    "[C16] Concurrent research/manual requests do not leak context",
    async () => {
      const a = runRetentionProductionNarration({
        topic: "Argentina versus England match review",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        manualContext: "Creator note A — emotional swing only.",
        ...retentionProductionDoubles("cheap"),
      });
      const b = runRetentionProductionNarration({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: "cheap",
        manualContext: "Creator note B — Spain press structure.",
        ...retentionProductionDoubles("cheap"),
      });
      const [ra, rb] = await Promise.all([a, b]);
      assert.equal(ra.ok, true);
      assert.equal(rb.ok, true);
      if (!ra.ok || !rb.ok) return;
      assert.notEqual(
        ra.approved.contractFingerprint,
        rb.approved.contractFingerprint,
      );
      const blobA = JSON.stringify(ra.approved);
      const blobB = JSON.stringify(rb.approved);
      assert.equal(blobA.includes("Creator note B"), false);
      assert.equal(blobB.includes("Creator note A"), false);
    },
  );

  await check(
    "[C17] Audio-first starts VO only after corrected validation/commit",
    () => {
      const audio = readFileSync(
        path.join(
          process.cwd(),
          "src/features/story/services/audio-first-generation.service.ts",
        ),
        "utf8",
      );
      assert.match(audio, /creatorManualContext/);
      assert.match(audio, /generationContext/);
      assert.match(audio, /runRetentionProductionNarration/);
      const fullFnStart = audio.indexOf(
        "export async function generateAudioFirstStory",
      );
      const fullFn = audio.slice(fullFnStart);
      const retentionIdx = fullFn.indexOf("runRetentionProductionNarration");
      const voiceAwaitIdx = fullFn.search(/await\s+voiceoverFn/);
      assert.ok(retentionIdx >= 0, "audio-first must call Retention narration");
      assert.ok(voiceAwaitIdx >= 0, "audio-first must await voiceover");
      assert.ok(
        voiceAwaitIdx > retentionIdx,
        "voiceover must start only after Retention production/commit",
      );
      // Shared input must not treat assembled context as Retention manualContext.
      assert.doesNotMatch(
        audio.slice(
          audio.indexOf("function buildRetentionSharedInput"),
          audio.indexOf("function retentionFailureEnvelope"),
        ),
        /manualContext:\s*input\.context/,
      );
    },
  );

  await check(
    "[C18] Safe failure classification is not editorial quality_failure",
    () => {
      assert.equal(
        creatorSafeErrorMessage("validation_authority_mismatch"),
        "ShortForge could not safely finalize this draft. Please retry.",
      );
      assert.notEqual(
        creatorSafeErrorMessage("validation_authority_mismatch"),
        creatorSafeErrorMessage("quality_failure"),
      );
      assert.doesNotMatch(
        creatorSafeErrorMessage("validation_authority_mismatch"),
        /Studio|add more context/i,
      );
    },
  );

  console.log("\nretentionCreatorContextAuthority — all fixtures passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
