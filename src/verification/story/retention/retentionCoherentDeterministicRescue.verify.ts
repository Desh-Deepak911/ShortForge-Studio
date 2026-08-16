/**
 * Story-quality Prompt 4 — coherent fact-grounded deterministic rescue corpus.
 * Provider-free. Fictional subjects only. No production topic special cases.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  assembleRetentionNarrationCandidate,
  buildRetentionCoherentDeterministicRescue,
  buildRetentionCreatorContentContract,
  detectRetentionFactualRisk,
  evaluateRetentionHookBodyPayoff,
  evaluateRetentionNarrationSubstance,
  mapRetentionNarrationToBeats,
  RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID,
  runRetentionProductionNarration,
  statementHasRetentionDateSignal,
} from "@/features/retention-story";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import type { ScriptMode, Tone } from "@/types/footiebitz";

import { passRetentionHookRunner } from "./retentionStoryQaDoubles";

const ROOT = path.resolve(__dirname, "../../..");
const FEATURE_ROOT = path.join(ROOT, "features/retention-story");

const SCAFFOLD =
  /central idea|that connection|next part|consequence keeps growing|What decides|those details|comes into focus|pressure decides|the contest tightens/iu;

const COMEBACK_CONTEXT = [
  "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan.",
  "Harbor United finished tenth in Voss's first stretch back.",
  "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
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

const RECAP_CONTEXT = [
  "Harbor beat Vale two nil after Solan switched to a narrow midfield.",
  "Vale had started brighter and pinned Harbor back.",
  "The turning point was Solan's switch just after the break.",
  "Harbor then controlled the channels and the result stood.",
].join("\n");

const TACTICAL_CONTEXT = [
  "Quill asks whether a high line can hold against direct runners.",
  "The mechanism is the back line stepping up as the six screens the first ball.",
  "When the six is drawn wide, the counter is a dropped eight covering the lane.",
].join("\n");

const OPINION_CONTEXT = [
  "I think Vale Athletic are being written off too early because the chance quality still looks healthy.",
  "They may still miss the top four.",
  "Keep the uncertainty clear.",
].join("\n");

const HISTORY_CONTEXT = [
  "Today the Harbor derby still decides local bragging rights.",
  "Earlier the two docks clubs shared a ground.",
  "The turning point was the riverside move that split the support.",
  "That split still shapes who the crowd backs.",
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

function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
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
    durationSec: input.durationSec ?? 45,
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

function rescue(input: ReturnType<typeof buildReady>, extras?: {
  readonly preserveOpeningText?: string;
  readonly hookStyle?: HookStyleSelection;
}) {
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

function assertNoScaffold(narration: string): void {
  assert.doesNotMatch(narration, SCAFFOLD);
}

function substanceOf(input: {
  readonly topic: string;
  readonly narration: string;
  readonly segments: readonly { readonly text: string }[];
  readonly grounding: ReturnType<typeof buildReady>["grounding"];
}) {
  return evaluateRetentionNarrationSubstance({
    topic: input.topic,
    grounding: input.grounding,
    candidate: {
      assembledNarration: input.narration,
      segments: input.segments,
    } as never,
  });
}

async function main(): Promise<void> {
  console.log("retention-coherent-deterministic-rescue");

  await check("[id] canonical rescue identity is stable", () => {
    assert.equal(
      RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID,
      "retention-coherent-deterministic-rescue/1",
    );
  });

  await check("[A] player comeback rescue uses facts and payoff", () => {
    const ready = buildReady({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK_CONTEXT,
      scriptMode: "story",
      durationSec: 45,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    assert.match(narration, /Voss|ban|Harbor|Solan|tenth/u);
    assert.match(narration, /stand|pressure|patient/u);
    assert.doesNotMatch(narration, /failed a new test/u);
    assert.equal(built.lowContextWarning, false);
    const relation = evaluateRetentionHookBodyPayoff({
      narration,
      contentContract: ready.contentContract,
      hookOpening: built.hookOpening,
      payoffClosing: built.payoffClosing,
    });
    assert.equal(relation.ok, true, relation.reasonIds.join(","));
  });

  await check("[B] fallen-giants preview names both sides and a result question", () => {
    const ready = buildReady({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
      durationSec: 45,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    assert.match(narration, /Rookfall/u);
    assert.match(narration, /Silvermere/u);
    assert.match(narration, /Kest|redemption|discarded|result|open/u);
    assert.match(narration, /\?/u);
  });

  await check("[C] five-player ranking keeps order and distinct reasons", () => {
    const ready = buildReady({
      topic: "Five Harbor attackers to watch",
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
      durationSec: 50,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    const names = ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"];
    const firstAt = names.map((name) => narration.indexOf(name));
    assert.ok(firstAt.every((index) => index >= 0), narration);
    for (let i = 1; i < firstAt.length; i++) {
      assert.ok(firstAt[i]! > firstAt[i - 1]!, "ranking order drifted");
    }
    for (const name of names) {
      const copies = narration.split(name).length - 1;
      assert.ok(copies >= 1 && copies <= 2, `${name} copies=${copies}`);
    }
    assert.match(narration, /dummy|overlap|cutback/u);
    assert.match(narration, /Nia Calder/u);
  });

  await check("[D] match recap is a recap, not a preview", () => {
    const ready = buildReady({
      topic: "Harbor versus Vale recap",
      manualContext: RECAP_CONTEXT,
      scriptMode: "match_recap",
      durationSec: 40,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    assert.match(narration, /Harbor/u);
    assert.match(narration, /Vale/u);
    assert.match(narration, /switch|turning|nil|result/u);
    assert.doesNotMatch(narration, /before the first whistle/u);
    assert.equal(built.thread, "result_turning_point");
  });

  await check("[E] tactical analysis avoids generic pressure language", () => {
    const ready = buildReady({
      topic: "Maren Quill high line",
      manualContext: TACTICAL_CONTEXT,
      scriptMode: "tactical_review",
      durationSec: 40,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    assert.match(narration, /high line|six|eight|screen/u);
    assert.doesNotMatch(narration, /pressure decides/iu);
    assert.equal(built.thread, "tactical_mechanism");
  });

  await check("[F] opinion keeps uncertainty", () => {
    const ready = buildReady({
      topic: "Vale Athletic title race argument",
      manualContext: OPINION_CONTEXT,
      scriptMode: "opinion_debate",
      durationSec: 40,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    assert.match(narration, /Vale/u);
    assert.match(narration, /\bmay\b/u);
    assert.doesNotMatch(narration, /will win the title/u);
  });

  await check("[G] historical explainer keeps chronology", () => {
    const ready = buildReady({
      topic: "Harbor derby split",
      manualContext: HISTORY_CONTEXT,
      scriptMode: "historical_explainer",
      durationSec: 40,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    assert.match(narration, /riverside|derby|docks|split/u);
    const earlier = narration.search(/earlier|shared a ground|riverside/iu);
    const later = narration.search(/today|still|backs/iu);
    assert.ok(earlier >= 0 && later >= 0);
  });

  await check("[H] sparse subject-only input stays short and honest", () => {
    const ready = buildReady({
      topic: "Maren Quill",
      durationSec: 25,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    assert.match(narration, /Quill/u);
    assert.ok(wordCount(narration) < Math.floor(25 * 2.4 * 0.88));
    assert.equal(built.lowContextWarning, true);
    assert.doesNotMatch(narration, /\b(?:2024|trophy|signed)\b/u);
  });

  await check("[I] overfull 30s keeps essentials and omits optional IDs", () => {
    const ready = buildReady({
      topic: "Jori Flint Harbor return",
      manualContext: OVERFULL_CONTEXT,
      durationSec: 30,
    });
    const built = rescue(ready);
    const narration = built.candidate.assembledNarration;
    assertNoScaffold(narration);
    assert.match(narration, /Flint|ankle|substitute/u);
    assert.ok(built.omittedContentUnitIds.length >= 1);
    assert.doesNotMatch(narration, /snack prices/u);
  });

  const hookStyles: HookStyleSelection[] = [
    "auto",
    "provocative_question",
    "stakes_first",
    "curiosity_gap",
    "user_written",
  ];
  for (const style of hookStyles) {
    await check(`[J] hook style ${style} stays related to body/payoff`, () => {
      const ready = buildReady({
        topic: "Calen Voss Harbor return",
        manualContext: COMEBACK_CONTEXT,
        hookStyle: style,
        durationSec: 40,
      });
      const built = rescue(ready, {
        hookStyle: style,
        ...(style === "user_written"
          ? { preserveOpeningText: "Stand with Voss now." }
          : {}),
      });
      const narration = built.candidate.assembledNarration;
      assertNoScaffold(narration);
      if (style === "user_written") {
        assert.match(narration, /Stand with Voss now/u);
      }
      const relation = evaluateRetentionHookBodyPayoff({
        narration,
        contentContract: ready.contentContract,
        hookOpening: built.hookOpening,
        payoffClosing: built.payoffClosing,
        userWrittenHookAccepted: style === "user_written",
      });
      assert.equal(relation.ok, true, `${style}: ${relation.reasonIds.join(",")}`);
    });
  }

  await check("[J-unsupported] unsupported style reconciles visibly", () => {
    const ready = buildReady({
      topic: "Maren Quill",
      hookStyle: "countdown_tease",
      durationSec: 20,
    });
    const built = rescue(ready, { hookStyle: "countdown_tease" });
    assert.equal(built.hookReconciled, true);
    assertNoScaffold(built.candidate.assembledNarration);
  });

  await check("[K] tone variants keep facts and change only presentation", () => {
    const facts = /Voss|ban|Harbor|Solan|tenth/;
    const news = rescue(
      buildReady({
        topic: "Calen Voss Harbor return",
        manualContext: COMEBACK_CONTEXT,
        tone: "news",
      }),
    );
    const dramatic = rescue(
      buildReady({
        topic: "Calen Voss Harbor return",
        manualContext: COMEBACK_CONTEXT,
        tone: "dramatic",
      }),
    );
    assert.match(news.candidate.assembledNarration, facts);
    assert.match(dramatic.candidate.assembledNarration, facts);
    assert.doesNotMatch(news.candidate.assembledNarration, /failed a new test/u);
    assert.doesNotMatch(dramatic.candidate.assembledNarration, /failed a new test/u);
  });

  await check("[L] longer duration adds optional substance without repetition", () => {
    const short = rescue(
      buildReady({
        topic: "Jori Flint Harbor return",
        manualContext: OVERFULL_CONTEXT,
        durationSec: 15,
      }),
    );
    const longer = rescue(
      buildReady({
        topic: "Jori Flint Harbor return",
        manualContext: OVERFULL_CONTEXT,
        durationSec: 60,
      }),
    );
    assert.ok(
      wordCount(longer.candidate.assembledNarration) >=
        wordCount(short.candidate.assembledNarration),
    );
    assert.match(short.candidate.assembledNarration, /Flint|ankle/u);
    const stems = longer.candidate.assembledNarration
      .split(/(?<=[.!?…])\s+/u)
      .map((sentence) => sentence.toLowerCase().slice(0, 24));
    assert.equal(new Set(stems).size, stems.length);
    for (const duration of [15, 30, 45, 60] as const) {
      const built = rescue(
        buildReady({
          topic: "Calen Voss Harbor return",
          manualContext: COMEBACK_CONTEXT,
          durationSec: duration,
        }),
      );
      assert.ok(
        wordCount(built.candidate.assembledNarration) <= Math.round(duration * 2.4) + 2,
      );
      assertNoScaffold(built.candidate.assembledNarration);
    }
  });

  await check("[M] modal may is uncertainty; month May needs date context", () => {
    assert.equal(statementHasRetentionDateSignal("They may struggle to finish."), false);
    assert.equal(statementHasRetentionDateSignal("Voss may return next week."), false);
    assert.equal(statementHasRetentionDateSignal("He may be unable to start."), false);
    assert.equal(statementHasRetentionDateSignal("May struggle is not a date."), false);
    assert.equal(statementHasRetentionDateSignal("May 2027"), true);
    assert.equal(statementHasRetentionDateSignal("May 14"), true);
    assert.equal(statementHasRetentionDateSignal("14 May"), true);
    assert.equal(statementHasRetentionDateSignal("signed in May 2027"), true);
    assert.equal(statementHasRetentionDateSignal("signed in May"), false);
    assert.equal(detectRetentionFactualRisk("They may still miss the top four").signals.includes("date"), false);
    assert.ok(detectRetentionFactualRisk("Signed in May 2027").signals.includes("date"));
    const ready = buildReady({
      topic: "Vale Athletic title race argument",
      manualContext: OPINION_CONTEXT,
      scriptMode: "opinion_debate",
    });
    const built = rescue(ready);
    assert.match(built.candidate.assembledNarration, /\bmay\b/u);
    const dateOnly = built.candidate.segments.filter((segment) =>
      detectRetentionFactualRisk(segment.text).signals.includes("date"),
    );
    assert.equal(dateOnly.length, 0);
  });

  await check("[N] cross-topic sameness does not survive a name swap", () => {
    const comeback = rescue(
      buildReady({
        topic: "Calen Voss Harbor return",
        manualContext: COMEBACK_CONTEXT,
      }),
    ).candidate.assembledNarration;
    const preview = rescue(
      buildReady({
        topic: PREVIEW_TOPIC,
        manualContext: PREVIEW_CONTEXT,
        scriptMode: "match_preview",
      }),
    ).candidate.assembledNarration;
    const ranking = rescue(
      buildReady({
        topic: "Five Harbor attackers to watch",
        manualContext: RANKING_CONTEXT,
        scriptMode: "top_5",
        durationSec: 50,
      }),
    ).candidate.assembledNarration;
    assert.notEqual(comeback.replace(/Voss|Harbor/gu, "X"), preview.replace(/Rookfall|Silvermere/gu, "X"));
    assert.notEqual(preview.replace(/Rookfall|Silvermere/gu, "X"), ranking.replace(/Nia Calder|Harbor/gu, "X"));
    const swapped = comeback.replace(/Voss/gu, "Kest").replace(/Harbor/gu, "Silvermere");
    assert.notEqual(swapped, preview);
    assert.match(comeback, /ban|tenth|Solan/u);
    assert.match(preview, /Kest|discarded|continental/u);
    assert.match(ranking, /Nia Calder|Tess Orlow/u);
  });

  await check("[reject] vacuous and broken narrations fail substance or relation", () => {
    const ready = buildReady({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK_CONTEXT,
    });
    const vacuous = substanceOf({
      topic: ready.contract.topic,
      grounding: ready.grounding,
      narration:
        "What decides Voss's outcome? Voss begins with a choice whose consequence keeps growing. That connection gives the next part. Together, those details bring Voss's central idea into focus.",
      segments: [
        { text: "What decides Voss's outcome?" },
        { text: "Voss begins with a choice whose consequence keeps growing." },
        { text: "That connection gives the next part." },
        { text: "Together, those details bring Voss's central idea into focus." },
      ],
    });
    assert.equal(vacuous.qualityBelowTarget, true);
    assert.ok(vacuous.planningScaffoldDetected);

    const rankingReady = buildReady({
      topic: "Five Harbor attackers to watch",
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const missingRank = rescue(rankingReady);
    assert.match(missingRank.candidate.assembledNarration, /Nia Calder/u);
    const brokenRanking = substanceOf({
      topic: rankingReady.contract.topic,
      grounding: rankingReady.grounding,
      narration: "Nia Calder creates shots. Tess Orlow keeps tempo.",
      segments: [
        { text: "Nia Calder creates shots." },
        { text: "Tess Orlow keeps tempo." },
      ],
    });
    assert.ok(
      brokenRanking.qualityBelowTarget ||
        brokenRanking.diagnosticIds.includes("low_creator_claim_coverage"),
    );

    const previewReady = buildReady({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const oneSided = evaluateRetentionHookBodyPayoff({
      narration: "Rookfall arrive with a question. The night stays open.",
      contentContract: previewReady.contentContract,
    });
    assert.equal(oneSided.ok, false);

    const zeroCoverage = substanceOf({
      topic: ready.contract.topic,
      grounding: ready.grounding,
      narration: "The night stays interesting for everyone watching.",
      segments: [{ text: "The night stays interesting for everyone watching." }],
    });
    assert.ok(zeroCoverage.diagnosticIds.includes("low_creator_claim_coverage"));
  });

  await check("[reject-rescue] broken briefs still create a coherent warning rescue", async () => {
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
    assert.equal(
      result.ok,
      true,
      result.ok ? "ok" : JSON.stringify(result, null, 2).slice(0, 2200),
    );
    if (!result.ok) throw new Error("expected ok");
    assert.equal(result.approved.generationDisposition?.disposition, "fallback");
    assert.equal(result.approved.generationDisposition?.qualityBelowTarget, true);
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "deterministic_rescue",
    );
    const entered = result.approved.generationDisposition?.acceptanceTrace?.events.filter(
      (event) => event.stage === "deterministic_rescue_entered",
    );
    const accepted = result.approved.generationDisposition?.acceptanceTrace?.events.filter(
      (event) => event.stage === "deterministic_rescue_accepted",
    );
    assert.equal(entered?.length, 1);
    assert.equal(accepted?.length, 1);
    assertNoScaffold(result.approved.narration);
    assert.match(result.approved.narration, /Hale|comeback|injury/u);
  });

  await check("[map] rescue narration remaps byte-for-byte", () => {
    const ready = buildReady({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK_CONTEXT,
    });
    const built = rescue(ready);
    const mapped = mapRetentionNarrationToBeats({
      narration: built.candidate.assembledNarration,
      plan: ready.plan,
      grounding: ready.grounding,
      strategySeed: ready.strategySeed,
      usedClaimIds: built.usedClaimIds,
      hookOpening: built.hookOpening,
      payoffClosing: built.payoffClosing,
    });
    const reassembled = assembleRetentionNarrationCandidate({
      origin: "final",
      planFingerprint: ready.plan.planFingerprint,
      orderedBeatIds: ready.plan.beatPlan.beats.map((beat) => beat.id),
      segments: mapped.segments,
      assemblyGap: " ",
    });
    assert.equal(reassembled.assembledNarration, built.candidate.assembledNarration);
  });

  await check("[path] old scaffold is unreachable from production", () => {
    const files = collectTsFiles(FEATURE_ROOT);
    const production = files.filter((file) =>
      /\/(production|composition|integration)\//.test(file),
    );
    const forbidden = [
      "What decides ${",
      "consequence keeps growing",
      "That connection gives the next part",
      "central idea into focus",
      "The contest tightens through pressure and resolve",
      "pressure decides who advances",
    ];
    for (const file of production) {
      if (file.endsWith("evaluate-retention-narration-substance.ts")) continue;
      if (file.endsWith("validate-retention-narration-first-proposal.ts")) continue;
      if (file.endsWith("evaluate-retention-canonical-narration-acceptance.ts")) continue;
      if (file.endsWith("evaluate-retention-hook-body-payoff.ts")) continue;
      if (file.endsWith("build-retention-coherent-deterministic-rescue.ts")) continue;
      const source = readFileSync(file, "utf8");
      for (const phrase of forbidden) {
        assert.equal(
          source.includes(phrase),
          false,
          `${path.relative(FEATURE_ROOT, file)} still contains ${phrase}`,
        );
      }
    }
    const wrapper = readFileSync(
      path.join(FEATURE_ROOT, "composition/build-deterministic-fallback-narration.ts"),
      "utf8",
    );
    assert.match(wrapper, /buildRetentionCoherentDeterministicRescue/u);
    assert.doesNotMatch(wrapper, /qualitativeUtterance|durationBridges|topicAnchoredOpening/u);
    const composer = readFileSync(
      path.join(FEATURE_ROOT, "composition/build-deterministic-fallback-composer.ts"),
      "utf8",
    );
    assert.match(composer, /buildRetentionCoherentDeterministicRescue/u);
    const productionNarration = readFileSync(
      path.join(FEATURE_ROOT, "production/run-retention-production-narration.ts"),
      "utf8",
    );
    assert.match(
      productionNarration,
      /buildDeterministicFallbackNarrationCandidate|buildRetentionCoherentDeterministicRescue/u,
    );
    const rescueSource = readFileSync(
      path.join(
        FEATURE_ROOT,
        "composition/build-retention-coherent-deterministic-rescue.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(
      rescueSource,
      /\b(?:Arsenal|Chelsea|Liverpool|Barcelona|Real Madrid|Premier League|La Liga|Haaland|Mbappe)\b/u,
    );
    assert.doesNotMatch(rescueSource, /What decides \$\{/u);
    assert.doesNotMatch(rescueSource, /openai|createRetentionProductionComposer/u);
  });

  await check("[provider-free] rescue does not consume ledger calls", () => {
    const ready = buildReady({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK_CONTEXT,
    });
    const before = ready.ledger.snapshot();
    rescue(ready);
    const after = ready.ledger.snapshot();
    assert.deepEqual(after.counts, before.counts);
  });

  console.log("retention-coherent-deterministic-rescue: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
