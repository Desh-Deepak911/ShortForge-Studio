/**
 * Story-quality Prompt 2 — Creator Content Authority corpus.
 * Provider-free. Fictional entities only.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  allocateRetentionCreatorContentUnits,
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  buildRetentionNarrationCandidateFromProposal,
  normalizeRetentionComposerProposal,
  parseRetentionCreatorContentUnits,
  runRetentionProductionNarration,
} from "@/features/retention-story";
import { isClaimEligibleForNarrationSupport } from "@/features/retention-story/strategy/retention-claim-support";
import { buildDeterministicFallbackNarrationCandidate } from "@/features/retention-story/composition/build-deterministic-fallback-narration";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { claimRefsSupportLinkedNarrationStatement } from "@/features/retention-story/strategy/retention-claim-linked-support";

import {
  coherentEnvelope,
  eligibleClaimGrounding,
  qualitativeProposal,
} from "./retentionStoryCoherentEnvelope";
import {
  makeRetentionComposer,
  passRetentionHookRunner,
} from "./retentionStoryQaDoubles";

const ROOT = path.resolve(__dirname, "../../..");
const FEATURE_ROOT = path.join(ROOT, "features/retention-story");

const COMEBACK_LONG =
  "After an eighteen-month doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club-imposed monitoring plan that required weekly reporting.";
const COMEBACK_CONTEXT = [
  "Required:",
  "- Harbor United finished tenth in Voss's first eight games back.",
  "- New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
  "Optional:",
  "- A radio host said the club shop sold more away shirts than home shirts.",
  "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
  "Do not claim Voss failed a new test.",
].join("\n");

const PREVIEW_TOPIC = "Rookfall versus Silvermere continental preview";
const PREVIEW_CONTEXT = [
  "Both clubs won continental titles in the last decade.",
  "Each side has missed the knockout rounds for two seasons.",
  "Former Rookfall coach Ivo Kest now leads Silvermere.",
  "The redemption angle is whether Kest can beat the club that discarded him.",
].join("\n");

const RANKING_CONTEXT = [
  "1. Nia Calder — she creates the first shot in almost every Harbor attack, even when the explanation of her movement takes a long clause to describe the dummy, the overlap, and the cutback.",
  "2. Tess Orlow — tempo control through the middle third.",
  "3. Bo Renwick — recovery sprints that rescue broken presses.",
  "4. Imani Shore — set-piece delivery from both flanks.",
  "5. Pax Ellery — late-box arrivals after the second ball.",
].join("\n");

const LONG_SINGLE_LINE_RANKING_CONTEXT = [
  "Preserve this ranking order.",
  "1. Kylian Mbappe — his former club PSG has won the Champions League two times in a row, and the question is whether he can get Real Madrid across the line this season.",
  "2. Vinicius Junior — he has renewed his contract, and the question is whether he can deliver the results Real Madrid need this season.",
  "3. Dean Huijsen — he receives the number four jersey worn by his idol Sergio Ramos, and the question is whether he can take centre stage in a new era of Real Madrid's defence.",
  "4. Trent Alexander-Arnold — after a failed season last year, the question is whether he can come back strongly.",
  "5. Diomande — the question is whether he can progress at Real Madrid in the way Gareth Bale did.",
  "Kylian Mbappe is the exact number-one player in this ranking.",
].join(" ");

const OPINION_CONTEXT = [
  "I think Vale Athletic are being written off too early because the underlying chance quality still looks healthy.",
  "They may still miss the top four.",
  "Keep the uncertainty clear.",
].join("\n");

const OVERFULL_CONTEXT = [
  "Required:",
  "Jori Flint missed six months after a broken ankle.",
  "The new manager wants Flint as the first substitute, not the starter.",
  "Optional:",
  "A fan podcast listed fourteen unrelated midweek rumours.",
  "The kit deal includes a commemorative sleeve patch.",
  "The academy side won a youth cup in the same week.",
  "A travel blog mentioned the away end snack prices.",
].join("\n");

const SPARSE_TOPIC = "Maren Quill tactical question";
const SPARSE_CONTEXT = "Whether Quill can hold a high line.";

const COMPOUND_INPUT = [
  "## Required",
  "- First, Harbor kept a clean sheet",
  "- Second, Vale sat deep",
  "3. Finally the late cross decided it",
  "Notes without a stop",
  "The winger drifted inside after the first pass; the full-back overlapped into the vacated channel",
].join("\n");

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
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

function oldPerBeatThreshold(durationSec: number, beatCount: number): number {
  const hardBudget = Math.round(durationSec * 2.4);
  return Math.max(8, Math.floor(hardBudget / beatCount) + 4);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function buildReadyRequest(input: {
  readonly topic: string;
  readonly manualContext?: string;
  readonly premiseDetails?: string;
  readonly factHandlingMode?: "verified_facts_only" | "creative_premise";
  readonly scriptMode?: "story" | "match_preview" | "top_5" | "opinion_debate";
  readonly durationSec?: number;
}) {
  const contractInput = buildProductionStoryContractInput({
    topic: input.topic,
    durationSec: input.durationSec ?? 45,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: input.scriptMode ?? "story",
    factHandlingMode: input.factHandlingMode ?? "verified_facts_only",
    manualContext: input.manualContext,
    premiseDetails: input.premiseDetails,
  });
  const contract = normalizeStoryContract(contractInput);
  const grounding = contractInput.grounding!;
  const ledger = createRetentionModelCallLedger(contract.qualityMode);
  const planResult = buildReliabilityDeterministicRetentionPlan({
    contract,
    grounding,
    manualContext: input.manualContext ?? null,
    planner: null,
    ledger,
  });
  assert.equal(planResult.status, "ready");
  const contentContract = buildRetentionCreatorContentContract({
    contract,
    grounding,
    manualContext: input.manualContext,
    premiseDetails: input.premiseDetails,
  });
  const request = buildRetentionComposerRequest({
    contract,
    plan: planResult.plan,
    strategySeed: planResult.strategySeed,
    grounding,
    manualContext: input.manualContext,
    hookDirectiveBlock: "",
    modelCallKind: "initial",
    contentContract,
  });
  return {
    contract,
    grounding,
    plan: planResult.plan,
    strategySeed: planResult.strategySeed,
    contentContract,
    request,
  };
}

async function main(): Promise<void> {
  console.log("retentionCreatorContentAuthority (Prompt 2)\n");

  await check("[G] compound and formatted input keeps source order", () => {
    const units = parseRetentionCreatorContentUnits({
      text: COMPOUND_INPUT,
      sourceField: "manual_context",
    });
    const texts = units
      .filter((unit) => unit.kind !== "instruction")
      .map((unit) => unit.text);
    assert.ok(texts.some((text) => /Harbor kept a clean sheet/u.test(text)));
    assert.ok(texts.some((text) => /Vale sat deep/u.test(text)));
    assert.ok(texts.some((text) => /late cross decided it/u.test(text)));
    assert.ok(texts.some((text) => /Notes without a stop/u.test(text)));
    const harbor = texts.findIndex((text) => /Harbor/u.test(text));
    const vale = texts.findIndex((text) => /Vale sat/u.test(text));
    const finallyIdx = texts.findIndex((text) => /Finally/u.test(text));
    assert.ok(harbor >= 0 && vale > harbor && finallyIdx > vale);
    const clauseUnits = units.filter((unit) =>
      /winger drifted inside|full-back overlapped/u.test(unit.text),
    );
    assert.ok(clauseUnits.length >= 1);
    assert.ok(
      clauseUnits.length === 1 ||
        clauseUnits.every((unit) => unit.parentContentUnitId != null),
      "safe clause split must keep a parent or remain one unit",
    );
    const again = parseRetentionCreatorContentUnits({
      text: COMPOUND_INPUT,
      sourceField: "manual_context",
    });
    assert.deepEqual(
      again.map((unit) => unit.contentUnitId),
      units.map((unit) => unit.contentUnitId),
    );
  });

  await check("[A] comeback long fact stays eligible and reaches composer", () => {
    const ready = buildReadyRequest({
      topic: "Calen Voss Harbor United comeback",
      manualContext: `${COMEBACK_LONG}\n${COMEBACK_CONTEXT}`,
      durationSec: 30,
    });
    const longClaim = ready.grounding.claims.find((claim) =>
      claim.text.includes("eighteen-month doping ban"),
    );
    assert.ok(longClaim);
    assert.equal(longClaim!.verification, "unverified");
    assert.equal(longClaim!.provenance, "manual_user");
    assert.equal(longClaim!.permittedFactualUse, true);
    assert.equal(
      isClaimEligibleForNarrationSupport(
        ready.grounding,
        longClaim!.claimId,
        "verified_facts_only",
      ),
      true,
    );
    const beatCount = ready.plan.beatPlan.beats.length;
    assert.ok(wordCount(longClaim!.text) > oldPerBeatThreshold(30, beatCount));
    const authorityTexts = [
      ...ready.request.contentAuthority.orderedEssentialUnits,
      ...ready.request.contentAuthority.orderedOptionalUnits,
    ].map((unit) => unit.text);
    assert.ok(
      authorityTexts.some((text) => text.includes("eighteen-month doping ban")),
    );
    assert.ok(
      ready.request.contentAuthority.forbiddenInventionIds.length >= 1,
    );
    const fallback = buildDeterministicFallbackNarrationCandidate({
      contract: ready.contract,
      plan: ready.plan,
      grounding: ready.grounding,
      contentContract: ready.contentContract,
    });
    assert.ok(
      fallback.usedClaimIds.includes(longClaim!.claimId) ||
        fallback.candidate.assembledNarration.includes("eighteen-month"),
      "long creator fact must remain eligible for composition",
    );
  });

  await check("[B] fallen-giants preview keeps both sides, conflict, payoff", () => {
    const ready = buildReadyRequest({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
      durationSec: 45,
    });
    const authority = ready.request.contentAuthority;
    const corpus = [
      authority.centralSubject,
      authority.controllingIdea,
      authority.intendedConflict ?? "",
      authority.intendedConsequence ?? "",
      ...authority.orderedEssentialUnits.map((unit) => unit.text),
    ].join(" ");
    assert.match(corpus, /Rookfall/u);
    assert.match(corpus, /Silvermere/u);
    assert.match(corpus, /Kest/u);
    assert.match(corpus, /redemption|discarded/u);
    assert.ok(
      authority.requestedStructuralObligations.includes(
        "name_required_participants",
      ),
    );
    const fallback = buildDeterministicFallbackNarrationCandidate({
      contract: ready.contract,
      plan: ready.plan,
      grounding: ready.grounding,
      contentContract: ready.contentContract,
    });
    assert.match(fallback.candidate.assembledNarration, /Rookfall/u);
    assert.match(fallback.candidate.assembledNarration, /Silvermere/u);
  });

  await check("[C] five-player ranking preserves source order and long reasons", () => {
    const ready = buildReadyRequest({
      topic: "Five Harbor attackers to watch",
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
      durationSec: 50,
    });
    const names = ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"];
    const ordered = ready.request.contentAuthority.orderedEssentialUnits.filter(
      (unit) => names.some((name) => unit.text.includes(name.split(" ")[0]!)),
    );
    const seen: string[] = [];
    for (const unit of [
      ...ready.request.contentAuthority.orderedEssentialUnits,
      ...ready.request.eligibleClaims,
    ]) {
      for (const name of names) {
        if (unit.text.includes(name) && !seen.includes(name)) seen.push(name);
      }
    }
    assert.deepEqual(seen, names);
    const longReason = ready.grounding.claims.find((claim) =>
      claim.text.includes("dummy, the overlap"),
    );
    assert.ok(longReason);
    assert.ok(
      wordCount(longReason!.text) >
        oldPerBeatThreshold(50, ready.plan.beatPlan.beats.length),
    );
    assert.ok(
      ready.request.contentAuthority.orderedEssentialUnits.some((unit) =>
        unit.text.includes("dummy, the overlap"),
      ),
    );
    assert.ok(ordered.length >= 5 || seen.length === 5);
  });

  await check("[C2] rich single-line ranking keeps facts beyond the old field limit", () => {
    assert.ok(LONG_SINGLE_LINE_RANKING_CONTEXT.length > 480);
    const ready = buildReadyRequest({
      topic: "Top five Real Madrid players to watch next season",
      manualContext: LONG_SINGLE_LINE_RANKING_CONTEXT,
      scriptMode: "top_5",
      durationSec: 30,
    });
    const names = [
      "Kylian Mbappe",
      "Vinicius Junior",
      "Dean Huijsen",
      "Trent Alexander-Arnold",
      "Diomande",
    ];
    assert.deepEqual(ready.request.compositionBrief.requiredRankingMembership, names);
    assert.equal(ready.request.compositionBrief.rankingNumberOneMember, "Kylian Mbappe");
    assert.equal(
      ready.contentContract.orderedUnits.some((unit) => /^\d+[.)]?$/u.test(unit.text)),
      false,
      "inline list markers are structure, not creator facts",
    );
    for (const name of names) {
      assert.ok(
        ready.contentContract.orderedUnits.some((unit) => unit.text.includes(name)),
        `${name} must survive creator-content parsing`,
      );
    }
    const fallback = buildDeterministicFallbackNarrationCandidate({
      contract: ready.contract,
      plan: ready.plan,
      grounding: ready.grounding,
      contentContract: ready.contentContract,
    }).candidate.assembledNarration;
    for (const name of names) assert.match(fallback, new RegExp(name, "u"));
    assert.match(fallback, /Kylian Mbappe.+number[- ]one|number[- ]one.+Kylian Mbappe/iu);
  });

  await check("[D] opinion stays creator-supplied, not independently verified", () => {
    const ready = buildReadyRequest({
      topic: "Vale Athletic title race argument",
      manualContext: OPINION_CONTEXT,
      scriptMode: "opinion_debate",
      durationSec: 40,
    });
    const opinion = ready.grounding.claims.find((claim) =>
      /written off too early/u.test(claim.text),
    );
    assert.ok(opinion);
    assert.equal(opinion!.verification, "unverified");
    assert.equal(opinion!.provenance, "manual_user");
    const opinionUnit =
      ready.request.contentAuthority.orderedEssentialUnits.find((unit) =>
        /written off too early/u.test(unit.text),
      );
    assert.ok(opinionUnit);
    assert.notEqual(opinionUnit!.authority, "research_verified");
    assert.ok(
      ready.request.contentAuthority.requiredUncertaintyLanguage.includes("may"),
    );
  });

  await check("[E] overfull 30s prefers essential and reports omitted optional IDs", () => {
    const ready = buildReadyRequest({
      topic: "Jori Flint Harbor return",
      manualContext: OVERFULL_CONTEXT,
      durationSec: 30,
    });
    const allocation = allocateRetentionCreatorContentUnits({
      contentContract: ready.contentContract,
      beatCount: ready.plan.beatPlan.beats.length,
    });
    assert.ok(allocation.usedEssentialContentUnitIds.length >= 2);
    assert.ok(allocation.omittedOptionalContentUnitIds.length >= 1);
    const fallback = buildDeterministicFallbackNarrationCandidate({
      contract: ready.contract,
      plan: ready.plan,
      grounding: ready.grounding,
      contentContract: ready.contentContract,
    });
    assert.ok(fallback.omittedContentUnitIds.length >= 1);
    assert.doesNotMatch(
      fallback.candidate.assembledNarration,
      /The central question stays open because each new detail/u,
    );
    assert.match(fallback.candidate.assembledNarration, /Flint|ankle|substitute/u);
  });

  await check("[F] sparse brief stays honest and invents nothing", () => {
    const ready = buildReadyRequest({
      topic: SPARSE_TOPIC,
      manualContext: SPARSE_CONTEXT,
      durationSec: 25,
    });
    const authority = ready.request.contentAuthority;
    assert.match(authority.centralSubject, /Maren Quill|Quill/u);
    const texts = [
      ...authority.orderedEssentialUnits,
      ...authority.orderedOptionalUnits,
    ].map((unit) => unit.text);
    assert.ok(texts.some((text) => /high line/u.test(text)));
    assert.equal(
      texts.some((text) => /\b\d+\b/u.test(text) && !/high line/u.test(text)),
      false,
    );
    assert.equal(authority.orderedOptionalUnits.length, 0);
  });

  await check("[P2-1] default Verified Facts keeps creator facts unverified", () => {
    const ready = buildReadyRequest({
      topic: "Harbor United must sell before buying. A Friday bid is expected.",
      manualContext:
        "A rival may move first. Keep the uncertainty clear and do not name a target.",
    });
    const creator = ready.grounding.claims.filter(
      (claim) =>
        claim.sourceRef === "creator_brief" ||
        claim.sourceRef === "manual_context",
    );
    assert.ok(creator.length >= 4);
    for (const claim of creator) {
      if (claim.forbidden) continue;
      assert.equal(claim.verification, "unverified");
      assert.equal(
        isClaimEligibleForNarrationSupport(
          ready.grounding,
          claim.claimId,
          "verified_facts_only",
        ),
        true,
      );
    }
  });

  await check("[P2-2] Creative Premise remains mode-gated", () => {
    const premise = "Lumen FC start with a 3-0 deficit from the first leg.";
    const verified = buildReadyRequest({
      topic: "Lumen FC continental night",
      premiseDetails: premise,
      factHandlingMode: "verified_facts_only",
    });
    assert.equal(
      verified.grounding.claims.some((claim) =>
        claim.text.includes("3-0 deficit"),
      ),
      false,
    );
    const creative = buildReadyRequest({
      topic: "Lumen FC continental night",
      premiseDetails: premise,
      factHandlingMode: "creative_premise",
    });
    const premiseClaim = creative.grounding.claims.find((claim) =>
      claim.text.includes("3-0 deficit"),
    );
    assert.ok(premiseClaim);
    assert.equal(
      isClaimEligibleForNarrationSupport(
        creative.grounding,
        premiseClaim!.claimId,
        "creative_premise",
      ),
      true,
    );
    assert.equal(
      isClaimEligibleForNarrationSupport(
        creative.grounding,
        premiseClaim!.claimId,
        "verified_facts_only",
      ),
      false,
    );
  });

  await check("[P2-3] forbidden inventions cannot become eligible", () => {
    const ready = buildReadyRequest({
      topic: "Calen Voss return",
      manualContext: "Do not claim Voss failed a new test.\nVoss trained alone on Thursday.",
    });
    const forbidden = ready.grounding.claims.filter((claim) => claim.forbidden);
    assert.ok(forbidden.length >= 1);
    for (const claim of forbidden) {
      assert.equal(claim.permittedFactualUse, false);
      assert.equal(
        isClaimEligibleForNarrationSupport(
          ready.grounding,
          claim.claimId,
          "verified_facts_only",
        ),
        false,
      );
    }
    assert.ok(ready.request.contentAuthority.forbiddenInventionIds.length >= 1);
  });

  await check("[P2-4] composer request carries the complete content contract", () => {
    const ready = buildReadyRequest({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const authority = ready.request.contentAuthority;
    assert.ok(authority.centralSubject);
    assert.ok(authority.controllingIdea);
    assert.ok(authority.orderedEssentialUnits.length >= 2);
    assert.ok(authority.storyWordBudget > 0);
    assert.ok(authority.compositionRules.length >= 8);
    assert.ok(authority.presentationSettings.durationSec >= 30);
    assert.equal(authority.presentationSettings.scriptMode, "match_preview");
  });

  await check("[P2-5] injected coherent composer output is accepted as model_direct", async () => {
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
    assert.equal(
      result.ok,
      true,
      result.ok
        ? ""
        : `${result.failureCategory}:${result.retentionDiagnostics.safeReasonIds.join(",")}`,
    );
    if (!result.ok) throw new Error("expected success");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_direct");
    assert.notEqual(
      result.approved.generationDisposition?.disposition,
      "fallback",
    );
  });

  await check("[P2-6] unsupported invented details are rewritten or rejected", async () => {
    const claimText = "Harbor United pressed from the first whistle.";
    const grounding = eligibleClaimGrounding([
      { id: "harbor-press", text: claimText, role: "required" },
    ]);
    const env = await coherentEnvelope(
      "cheap",
      { topic: "Harbor versus Vale tactical preview" },
      grounding,
    );
    const plan = {
      ...env.plan,
      beatPlan: {
        ...env.plan.beatPlan,
        beats: env.plan.beatPlan.beats.map((beat, index) =>
          index === 1
            ? { ...beat, groundingClaimRefs: ["harbor-press"] as const }
            : beat,
        ),
      },
    };
    const proposal = qualitativeProposal(plan);
    proposal.segments[1]!.text = "Harbor United won 7-1 with twelve goals from Voss.";
    proposal.segments[1]!.claimRefs = ["harbor-press"];
    const normalized = normalizeRetentionComposerProposal(
      proposal,
      plan,
      grounding,
      env.strategySeed,
      [],
      "verified_facts_only",
    );
    assert.ok(
      !/7-1|twelve goals/u.test(normalized.segments[1]!.text),
      "invented score must not survive",
    );
    assert.match(normalized.segments[1]!.text, /pressed from the first whistle/u);
    assert.equal(
      claimRefsSupportLinkedNarrationStatement(
        grounding,
        ["harbor-press"],
        normalized.segments[1]!.text,
      ),
      true,
    );

    const risky = qualitativeProposal(env.plan);
    risky.segments[2]!.text = "Harbor defeated Vale 4-0 in extra time.";
    assert.throws(() =>
      buildRetentionNarrationCandidateFromProposal({
        proposal: risky,
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        origin: "initial_compose",
      }),
    );
  });

  await check("[P2-7] Prompt 1 fallback remains visibly below target", async () => {
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
    assert.equal(
      result.approved.generationDisposition?.disposition,
      "fallback",
    );
    assert.equal(
      result.approved.generationDisposition?.qualityBelowTarget,
      true,
    );
    assert.ok(
      result.approved.validationSummary.storyQualityConfidence < 0.72,
    );
  });

  await check("[P2-8] no production topic special cases in new authority files", () => {
    const files = collectTsFiles(FEATURE_ROOT).filter((file) =>
      /creator-content|claim-linked-support|parse-retention-creator/u.test(
        file,
      ),
    );
    assert.ok(files.length >= 4);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /Manchester|Liverpool|Premier League/iu);
      assert.doesNotMatch(src, /if\s*\(.*(?:club|player|competition).*\)\s*\{/iu);
    }
  });

  await check("[P2-9] linked compression keeps uncertainty and drops filler only", () => {
    const grounding = eligibleClaimGrounding([
      {
        id: "maybe-move",
        text: "A rival may move first for the Harbor midfielder.",
        role: "required",
      },
    ]);
    assert.equal(
      claimRefsSupportLinkedNarrationStatement(
        grounding,
        ["maybe-move"],
        "A rival may move first.",
      ),
      true,
    );
    assert.equal(
      claimRefsSupportLinkedNarrationStatement(
        grounding,
        ["maybe-move"],
        "A rival will sign the Harbor midfielder tomorrow for 40 million.",
      ),
      false,
    );
  });

  await check("[P2-10] duration pad is not used when creator claims are present", () => {
    const ready = buildReadyRequest({
      topic: "Jori Flint Harbor return",
      manualContext: OVERFULL_CONTEXT,
      durationSec: 30,
    });
    const fallback = buildDeterministicFallbackNarrationCandidate({
      contract: ready.contract,
      plan: ready.plan,
      grounding: ready.grounding,
      contentContract: ready.contentContract,
    });
    assert.ok(fallback.usedClaimIds.length > 0);
    assert.doesNotMatch(
      fallback.candidate.assembledNarration,
      /generic duration|In today's|Welcome to/u,
    );
  });

  await check("[P2-11] complete rich ranking rescue cannot become a terminal error", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Top five Real Madrid players to watch next season",
      manualContext: LONG_SINGLE_LINE_RANKING_CONTEXT,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "top_5",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: () => {
        throw new Error("provider unavailable");
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected fallback success");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace
        ?.finalNarrationAuthority,
      "deterministic_rescue",
    );
    for (const name of [
      "Kylian Mbappe",
      "Vinicius Junior",
      "Dean Huijsen",
      "Trent Alexander-Arnold",
      "Diomande",
    ]) {
      assert.match(result.approved.narration, new RegExp(name, "u"));
    }
    assert.equal(result.approved.generationDisposition?.qualityBelowTarget, true);
  });

  console.log("\nretentionCreatorContentAuthority passed\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
