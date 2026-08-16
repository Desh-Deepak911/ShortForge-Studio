/**
 * Story-quality Prompt 5 — provider-free hardening corpus.
 * Fictional subjects only. No production topic special cases.
 */

import assert from "node:assert/strict";

import {
  applyRetentionTonePresentation,
  assertRetentionRescuePromotionFidelity,
  assembleRetentionNarrationCandidate,
  buildLegacyPlanningLanguageFallback,
  buildRetentionCoherentDeterministicRescue,
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  buildRetentionNarrationCandidateFromProposal,
  detectRetentionFactualRisk,
  extractRetentionPresentationInvariantTokens,
  getRetentionCoherentRescueRuntimeProbe,
  mapRetentionNarrationToBeats,
  resetRetentionCoherentRescueRuntimeProbe,
  RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID,
  runRetentionProductionNarration,
  statementHasRetentionDateSignal,
} from "@/features/retention-story";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import type { ScriptMode, Tone } from "@/types/footiebitz";

import { passRetentionHookRunner } from "./retentionStoryQaDoubles";

const SCAFFOLD =
  /central idea|that connection|next part|consequence keeps growing|What decides|those details|comes into focus|pressure decides|the contest tightens|hold hold|answer answer/iu;

const PADDED_REPEAT = /\b(\p{L}{3,})\s+\1\b/u;

const LONG_FACT =
  "Harbor United finished tenth after Calen Voss returned from a doping ban and Mira Solan asked the crowd to stay patient while the support-versus-pressure question stayed open.";

const ADJACENT_FACTS = [
  "Harbor United finished tenth in Voss's first stretch back.",
  "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
  "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
].join(" ");

const RANKING_CONTEXT = [
  "1. Nia Calder — she creates the first shot in almost every Harbor attack.",
  "2. Tess Orlow — tempo control through the middle third.",
  "3. Bo Renwick — recovery sprints that rescue broken presses.",
  "4. Imani Shore — set-piece delivery from both flanks.",
  "5. Pax Ellery — late-box arrivals after the second ball.",
].join("\n");

const PREVIEW_CONTEXT = [
  "Both clubs won continental titles in the last decade.",
  "Each side has missed the knockout rounds for two seasons.",
  "Former Rookfall coach Ivo Kest now leads Silvermere.",
  "The redemption angle is whether Kest can beat the club that discarded him.",
].join("\n");

const COMEBACK_CONTEXT = [
  LONG_FACT,
  ADJACENT_FACTS,
  "Do not claim Voss failed a new test.",
].join("\n");

const MAY_CONTEXT = [
  "Vale Athletic may struggle to finish in the top four.",
  "The midfielder may return after the international break.",
  "The keeper may be unable to start.",
  "The club announced a May 2027 academy wing.",
  "A friendly is listed for May 14.",
  "Another date is 14 May.",
  "The lease was signed in May 2027, and they may still miss the title.",
].join("\n");

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function buildReady(input: {
  readonly topic: string;
  readonly manualContext?: string;
  readonly scriptMode?: ScriptMode;
  readonly durationSec?: number;
  readonly tone?: Tone;
  readonly hookStyle?: HookStyleSelection;
}) {
  const contractInput = buildProductionStoryContractInput({
    topic: input.topic,
    durationSec: input.durationSec ?? 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: input.scriptMode ?? "story",
    factHandlingMode: "verified_facts_only",
    manualContext: input.manualContext,
    tone: input.tone,
    hookStyle: input.hookStyle,
    ...(input.hookStyle === "user_written"
      ? { userAuthoredHook: "Stand with Voss now." }
      : {}),
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
  if (planResult.status !== "ready") throw new Error("expected ready plan");
  const contentContract = buildRetentionCreatorContentContract({
    contract,
    grounding,
    manualContext: input.manualContext,
    hookStyle: input.hookStyle ?? null,
  });
  return {
    contract,
    grounding,
    plan: planResult.plan,
    strategySeed: planResult.strategySeed,
    contentContract,
    ledger,
  };
}

function rescue(
  input: ReturnType<typeof buildReady>,
  extras?: {
    readonly preserveOpeningText?: string;
    readonly hookStyle?: HookStyleSelection;
  },
) {
  return buildRetentionCoherentDeterministicRescue({
    contract: input.contract,
    plan: input.plan,
    grounding: input.grounding,
    contentContract: input.contentContract,
    strategySeed: input.strategySeed,
    hookStyle: extras?.hookStyle ?? null,
    ...(extras?.preserveOpeningText
      ? { preserveOpeningText: extras.preserveOpeningText }
      : {}),
  });
}

function assertHonestNarration(narration: string): void {
  assert.doesNotMatch(narration, SCAFFOLD);
  assert.doesNotMatch(narration, PADDED_REPEAT);
  assert.doesNotMatch(narration, /still has a decision attached/iu);
}

async function main(): Promise<void> {
  console.log("retention-story-quality-hardening");

  await check("[A1] short sparse rescue does not pad leftover beats", () => {
    const ready = buildReady({
      topic: "Maren Quill",
      durationSec: 20,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertHonestNarration(narration);
    const empties = built.candidate.segments.filter((segment) => segment.text.length === 0);
    assert.ok(
      empties.length === 0 || empties.every((segment) => segment.beatId !== built.candidate.segments[0]?.beatId),
    );
    assert.equal(
      built.candidate.segments
        .filter((segment) => segment.text.length > 0)
        .map((segment) => segment.text)
        .join(" "),
      narration,
    );
    assert.doesNotMatch(narration, /\b(hold|answer|Quill)\s+\1\b/u);
  });

  await check("[A1] fact-rich short story keeps accepted bytes without filler words", () => {
    const ready = buildReady({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK_CONTEXT,
      durationSec: 15,
    });
    const built = rescue(ready);
    assertHonestNarration(built.candidate.assembledNarration);
    assert.match(built.candidate.assembledNarration, /Voss|Harbor|Solan|tenth/u);
    for (const segment of built.candidate.segments) {
      assert.doesNotMatch(segment.text, /^(?:hold|answer|and|five)$/u);
    }
  });

  const promoteCases: readonly {
    readonly label: string;
    readonly topic: string;
    readonly manualContext?: string;
    readonly scriptMode?: ScriptMode;
    readonly hookStyle?: HookStyleSelection;
    readonly preserveOpeningText?: string;
    readonly mustMatch: RegExp;
  }[] = [
    {
      label: "long factual sentence",
      topic: "Calen Voss Harbor return",
      manualContext: LONG_FACT,
      mustMatch: /tenth|Solan|Voss/u,
    },
    {
      label: "adjacent factual sentences",
      topic: "Calen Voss Harbor return",
      manualContext: ADJACENT_FACTS,
      mustMatch: /tenth|Solan|stands/u,
    },
    {
      label: "five-entry ranking",
      topic: "Five Harbor attackers to watch",
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
      mustMatch: /Nia Calder[\s\S]*Tess Orlow[\s\S]*Bo Renwick[\s\S]*Imani Shore[\s\S]*Pax Ellery/u,
    },
    {
      label: "match preview participants",
      topic: "Rookfall versus Silvermere continental preview",
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
      mustMatch: /Rookfall/u,
    },
    {
      label: "user-written Hook",
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK_CONTEXT,
      hookStyle: "user_written",
      preserveOpeningText: "Stand with Voss now.",
      mustMatch: /Stand with Voss now/u,
    },
    {
      label: "flexible Auto reconciliation",
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK_CONTEXT,
      hookStyle: "auto",
      mustMatch: /Voss|Harbor/u,
    },
  ];

  for (const testCase of promoteCases) {
    await check(`[A2] promote/remap keeps facts: ${testCase.label}`, () => {
      const ready = buildReady({
        topic: testCase.topic,
        manualContext: testCase.manualContext,
        scriptMode: testCase.scriptMode,
        hookStyle: testCase.hookStyle,
        durationSec: 40,
      });
      const built = rescue(ready, {
        hookStyle: testCase.hookStyle,
        preserveOpeningText: testCase.preserveOpeningText,
      });
      const canonical = built.candidate.assembledNarration;
      assert.match(canonical, testCase.mustMatch);
      if (testCase.scriptMode === "top_5") {
        for (const name of ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"]) {
          assert.match(canonical, new RegExp(name, "u"));
        }
      }
      if (testCase.scriptMode === "match_preview") {
        assert.match(canonical, /Rookfall/u);
        assert.match(canonical, /Silvermere/u);
      }
      const mapped = mapRetentionNarrationToBeats({
        narration: canonical,
        plan: ready.plan,
        grounding: ready.grounding,
        strategySeed: ready.strategySeed,
        usedClaimIds: built.usedClaimIds,
        hookOpening: built.hookOpening,
        payoffClosing: built.payoffClosing,
        allowEmptyInternalBeats: true,
      });
      const reassembled = assembleRetentionNarrationCandidate({
        origin: "final",
        planFingerprint: ready.plan.planFingerprint,
        orderedBeatIds: ready.plan.beatPlan.beats.map((beat) => beat.id),
        segments: mapped.segments,
        assemblyGap: " ",
      });
      assert.equal(reassembled.assembledNarration, canonical);
      const fidelity = assertRetentionRescuePromotionFidelity({
        canonicalNarration: canonical,
        promotedNarration: reassembled.assembledNarration,
        authorisedHookReplacement: false,
        canonicalUsedContentIds: built.usedContentUnitIds,
        promotedUsedContentIds: built.usedContentUnitIds,
        essentialContentIds: built.usedContentUnitIds,
        requiredUncertaintyMarkers: ["may", "might"],
      });
      assert.equal(fidelity.ok, true, fidelity.ok ? "" : fidelity.reason);
    });
  }

  await check("[A2] narration-first ranking payoff is not replaced by claim text", () => {
    const ready = buildReady({
      topic: "Five Harbor attackers to watch",
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
      durationSec: 40,
    });
    const request = buildRetentionComposerRequest({
      contract: ready.contract,
      plan: ready.plan,
      grounding: ready.grounding,
      strategySeed: ready.strategySeed,
      contentContract: ready.contentContract,
      manualContext: RANKING_CONTEXT,
      hookDirectiveBlock: "",
      modelCallKind: "initial",
    });
    const narration =
      "Nia Calder creates the first shot. Tess Orlow controls tempo. Bo Renwick rescues broken presses. Imani Shore delivers set pieces. Pax Ellery arrives late. Nia Calder remains the number one payoff.";
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: {
        title: "Five Harbor attackers",
        narration,
        usedContentIds: request.contentAuthority.orderedEssentialUnits
          .map((unit) => unit.claimId)
          .filter((id): id is string => id != null),
        omittedContentIds: [],
      },
      plan: ready.plan,
      grounding: ready.grounding,
      strategySeed: ready.strategySeed,
      origin: "initial_compose",
      extras: {
        contentContract: ready.contentContract,
        brief: request.compositionBrief,
        eligibleClaimIds: new Set(request.eligibleClaims.map((claim) => claim.claimId)),
      },
    });
    const last =
      built.candidate.assembledNarration
        .trim()
        .split(/(?<=[.!?…])\s+/u)
        .filter(Boolean)
        .at(-1) ?? "";
    assert.equal(built.candidate.assembledNarration, narration);
    assert.match(last, /Nia|number one|payoff/u);
    assert.doesNotMatch(
      built.candidate.assembledNarration,
      /tempo control through the middle third/u,
    );
  });

  await check("[A3] runtime probe: every rescue entrypoint stays on the canonical builder", async () => {
    resetRetentionCoherentRescueRuntimeProbe();
    const entrypoints: readonly {
      readonly label: string;
      readonly composer: () => never | object;
      readonly rewriteComposer?: () => never;
      readonly qualityMode?: "cheap" | "balanced" | "best";
      readonly hookStyle?: HookStyleSelection;
    }[] = [
      {
        label: "composer unavailable",
        composer: () => {
          throw new Error("model composer unavailable");
        },
      },
      {
        label: "composer call failed",
        composer: () => {
          throw new Error("composer_call_failed");
        },
      },
      {
        label: "malformed proposal",
        composer: () => ({ title: "", segments: [] }),
      },
      {
        label: "hook rejection",
        composer: () => ({
          title: "Broken",
          hookOpening: "2024",
          payoffClosing: "The night stays open.",
          usedContentIds: [],
          omittedContentIds: [],
          hookClaimRefs: [],
          assemblyGap: " ",
          segments: [
            { beatId: "x", text: "2024 scores decide everything immediately tonight.", claimRefs: [] },
          ],
        }),
      },
      {
        label: "length rejection",
        composer: () => ({
          title: "Overlong",
          usedContentIds: [],
          omittedContentIds: [],
          hookClaimRefs: [],
          assemblyGap: " ",
          segments: [
            {
              beatId: "x",
              text: `${"Harbor United keep repeating the same unused clause. ".repeat(80)}The night stays open.`,
              claimRefs: [],
            },
          ],
        }),
      },
      {
        label: "studio rewrite failure",
        qualityMode: "best",
        composer: () => {
          throw new Error("model composer unavailable");
        },
        rewriteComposer: () => {
          throw new Error("studio rewrite failed");
        },
      },
    ];

    for (const entry of entrypoints) {
      const before = getRetentionCoherentRescueRuntimeProbe();
      const result = await runRetentionProductionNarration({
        topic: "Jordan Hale comeback after injury",
        manualContext:
          "Hale missed eight months after ankle surgery. The new coach wants him as a substitute first.",
        durationSec: 30,
        generationPath: "script_only",
        qualityMode: entry.qualityMode ?? "cheap",
        factHandlingMode: "verified_facts_only",
        planner: null,
        composer: entry.composer as never,
        hookRunner: passRetentionHookRunner,
        ...(entry.rewriteComposer
          ? { rewriteComposer: entry.rewriteComposer as never }
          : {}),
        ...(entry.hookStyle ? { hookStyle: entry.hookStyle } : {}),
      });
      const after = getRetentionCoherentRescueRuntimeProbe();
      assert.equal(after.builderId, RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID);
      assert.equal(after.legacyScaffoldInvocations, 0, entry.label);
      assert.ok(after.canonicalInvocations > before.canonicalInvocations, entry.label);
      assert.equal(result.ok, true, `${entry.label} should fail-soft`);
      if (!result.ok) throw new Error(entry.label);
      const trace = result.approved.generationDisposition?.acceptanceTrace;
      const entered = trace?.events.filter((event) => event.stage === "deterministic_rescue_entered") ?? [];
      const accepted = trace?.events.filter((event) => event.stage === "deterministic_rescue_accepted") ?? [];
      assert.equal(entered.length, 1, `${entry.label} entered=${entered.length}`);
      assert.equal(accepted.length, 1, `${entry.label} accepted=${accepted.length}`);
      assert.equal(trace?.finalNarrationAuthority, "deterministic_rescue");
      assertHonestNarration(result.approved.narration);
    }

    const flexible = await runRetentionProductionNarration({
      topic: "Jordan Hale comeback after injury",
      manualContext:
        "Hale missed eight months after ankle surgery. The new coach wants him as a substitute first.",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "match_preview",
      factHandlingMode: "verified_facts_only",
      creationReliabilityMode: "flexible",
      planner: null,
      composer: () => {
        throw new Error("model composer unavailable");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(flexible.ok, true);
    if (!flexible.ok) throw new Error("flexible");
    const flexTrace = flexible.approved.generationDisposition?.acceptanceTrace;
    assert.equal(
      flexTrace?.events.filter((event) => event.stage === "deterministic_rescue_entered").length,
      1,
    );
    assert.equal(
      flexTrace?.events.filter((event) => event.stage === "deterministic_rescue_accepted").length,
      1,
    );
    assert.match(flexible.approved.narration, /Hale|ankle|substitute/u);

    const lastResort = await runRetentionProductionNarration({
      topic: "Jordan Hale comeback after injury",
      durationSec: 25,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: () => {
        throw new Error("model composer unavailable");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(lastResort.ok, true);
    if (!lastResort.ok) throw new Error("last-resort");
    assert.equal(
      lastResort.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "deterministic_rescue",
    );
    assert.equal(getRetentionCoherentRescueRuntimeProbe().legacyScaffoldInvocations, 0);
    assert.throws(() => buildLegacyPlanningLanguageFallback());
    assert.equal(getRetentionCoherentRescueRuntimeProbe().legacyScaffoldInvocations, 1);
    resetRetentionCoherentRescueRuntimeProbe();
    assert.equal(getRetentionCoherentRescueRuntimeProbe().legacyScaffoldInvocations, 0);
  });

  const subjectCases: readonly { readonly topic: string; readonly expect: RegExp; readonly forbid: RegExp }[] = [
    {
      topic: "Please write a dramatic story about whether Luka Modrić can still dictate tempo",
      expect: /Modri[cć]/u,
      forbid: /Can the (?:European|dramatic|whether) hold\?/iu,
    },
    {
      topic: "Preview Bayer Leverkusen continental form",
      expect: /Leverkusen/u,
      forbid: /Can the (?:Preview|continental) hold\?/iu,
    },
    {
      topic: "Can Łukasz Fabiański still command the box?",
      expect: /Fabiański|Lukasz|Łukasz/u,
      forbid: /Can the Can hold\?/iu,
    },
    {
      topic: "Write about rainy European away nights",
      expect: /supplied facts remain in view|away nights remain|rainy European away nights/iu,
      forbid: /Can the European hold\?/iu,
    },
    {
      topic: "???",
      expect: /supplied facts remain in view|known facts|try again/iu,
      forbid: /Can the \?\?\? hold\?/iu,
    },
    {
      topic: "THE HARBOR DERBY",
      expect: /HARBOR|Harbor|DERBY|Derby/u,
      forbid: /Can the THE hold\?/iu,
    },
    {
      topic: "Atlético Nacional home form",
      expect: /Atl[eé]tico|Nacional/u,
      forbid: /Can the home hold\?/iu,
    },
  ];

  for (const testCase of subjectCases) {
    await check(`[A4] sparse subject: ${testCase.topic.slice(0, 48)}`, async () => {
      if (/^\?+$/u.test(testCase.topic)) {
        const result = await runRetentionProductionNarration({
          topic: testCase.topic,
          durationSec: 20,
          generationPath: "script_only",
          qualityMode: "cheap",
          factHandlingMode: "verified_facts_only",
          planner: null,
          composer: () => {
            throw new Error("model composer unavailable");
          },
          hookRunner: passRetentionHookRunner,
        });
        const text = result.ok ? result.approved.narration : result.error;
        assert.match(text, testCase.expect);
        assert.doesNotMatch(text, testCase.forbid);
        assert.doesNotMatch(text, /Can the European hold\?/iu);
        return;
      }
      const ready = buildReady({ topic: testCase.topic, durationSec: 20 });
      const built = rescue(ready);
      assert.match(built.candidate.assembledNarration, testCase.expect);
      assert.doesNotMatch(built.candidate.assembledNarration, testCase.forbid);
      assert.doesNotMatch(built.hookOpening, /Can the European hold\?/iu);
      assertHonestNarration(built.candidate.assembledNarration);
    });
  }

  await check("[A5] three tones differ in presentation and keep fact tokens", () => {
    const readyNews = buildReady({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK_CONTEXT,
      tone: "news",
      durationSec: 40,
    });
    const news = rescue(readyNews).candidate.assembledNarration;
    const tones: Tone[] = ["dramatic", "funny", "emotional"];
    const presentations = [news];
    for (const tone of tones) {
      const ready = buildReady({
        topic: "Calen Voss Harbor return",
        manualContext: COMEBACK_CONTEXT,
        tone,
        durationSec: 40,
      });
      const built = rescue(ready);
      const narration = built.candidate.assembledNarration;
      assertHonestNarration(narration);
      assert.deepEqual(
        extractRetentionPresentationInvariantTokens(narration),
        extractRetentionPresentationInvariantTokens(news),
      );
      assert.deepEqual(built.usedContentUnitIds, rescue(readyNews).usedContentUnitIds);
      presentations.push(narration);
    }
    assert.ok(new Set(presentations).size >= 3, presentations.join("\n---\n"));
    const direct = applyRetentionTonePresentation(news, "dramatic");
    assert.notEqual(direct, news);
    assert.deepEqual(
      extractRetentionPresentationInvariantTokens(direct),
      extractRetentionPresentationInvariantTokens(news),
    );
    assert.equal(
      applyRetentionTonePresentation(
        "The evidence remains supported. The reading may still stand.",
        "dramatic",
      ),
      "The evidence remains supported. Now the reading may still stand.",
    );
  });

  await check("[A6] modal may survives composition, rescue, promote, and mapping", () => {
    const ready = buildReady({
      topic: "Vale Athletic title race argument",
      manualContext: MAY_CONTEXT,
      scriptMode: "opinion_debate",
      durationSec: 45,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assert.match(narration, /\bmay\b/u);
    assert.equal(statementHasRetentionDateSignal("They may struggle to finish."), false);
    assert.equal(statementHasRetentionDateSignal("Voss may return next week."), false);
    assert.equal(statementHasRetentionDateSignal("He may be unable to start."), false);
    assert.equal(statementHasRetentionDateSignal("May 2027"), true);
    assert.equal(statementHasRetentionDateSignal("May 14"), true);
    assert.equal(statementHasRetentionDateSignal("14 May"), true);
    assert.equal(statementHasRetentionDateSignal("signed in May 2027"), true);
    const mapped = mapRetentionNarrationToBeats({
      narration,
      plan: ready.plan,
      grounding: ready.grounding,
      strategySeed: ready.strategySeed,
      usedClaimIds: built.usedClaimIds,
      allowEmptyInternalBeats: true,
    });
    assert.match(mapped.segments.map((segment) => segment.text).join(" "), /\bmay\b/u);
    const dateSignals = detectRetentionFactualRisk("They may struggle").signals.includes("date");
    assert.equal(dateSignals, false);
  });

  console.log("retention-story-quality-hardening: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
