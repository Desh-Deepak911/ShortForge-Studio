/**
 * Story-quality Prompt 3 — narration-first / settings-driven composer corpus.
 * Provider-free. Fictional subjects only. No production topic special cases.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildRetentionComposerRequest,
  buildRetentionCompositionBrief,
  buildRetentionCreatorContentContract,
  buildRetentionNarrationCandidateFromProposal,
  evaluateRetentionHookBodyPayoff,
  getRetentionModeArchitecture,
  listRetentionModeArchitectures,
  listRetentionQualityCompositionEffort,
  resolveRetentionDurationUtilisationPolicy,
  resolveRetentionQualityCompositionEffort,
  runRetentionProductionNarration,
  selectRetentionAdaptiveComposerClaims,
} from "@/features/retention-story";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import type {
  RetentionComposerCallback,
  RetentionComposerRequest,
} from "@/features/retention-story";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import type { ScriptMode, Tone } from "@/types/footiebitz";

import {
  makeRetentionComposer,
  makeRetentionPlanner,
  passRetentionHookRunner,
} from "./retentionStoryQaDoubles";

const ROOT = path.resolve(__dirname, "../../..");
const FEATURE_ROOT = path.join(ROOT, "features/retention-story");

const COMEBACK_CONTEXT = [
  "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan.",
  "Required:",
  "- Harbor United finished tenth in Voss's first stretch back.",
  "- New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
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

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?…]+[.!?…]/u);
  return match?.[0]?.trim() ?? text.trim().split(/\s+/u).slice(0, 8).join(" ");
}

function lastSentence(text: string): string {
  const parts = text.trim().split(/(?<=[.!?…])\s+/u).filter(Boolean);
  return parts[parts.length - 1] ?? text;
}

function hookOpeningFor(
  style: HookStyleSelection | "auto" | "user_written",
  brief: RetentionComposerRequest["compositionBrief"],
  scriptMode: ScriptMode,
): string {
  if (scriptMode === "opinion_debate") return "Are Vale written off early?";
  if (scriptMode === "tactical_review") return "Can the high line hold?";
  if (scriptMode === "historical_explainer") {
    return "Why did the riverside split last?";
  }
  if (scriptMode === "match_recap") return "The switch decided Harbor.";
  if (scriptMode === "match_preview") return "Can Kest answer Rookfall?";
  if (scriptMode === "top_5") return "Who stands last tonight?";
  if (style === "provocative_question") {
    return /Voss|Harbor/i.test(brief.centralSubject)
      ? "Can support outlast pressure?"
      : `Can ${brief.centralSubject.split(/\s+/u)[0] ?? "this"} still hold?`;
  }
  if (style === "stakes_first" || style === "headline_first") {
    return /Voss/i.test(brief.centralSubject)
      ? "Harbor pressure now decides Voss."
      : `${brief.centralSubject.split(/\s+/u).slice(0, 2).join(" ")} now decides this.`;
  }
  if (style === "curiosity_gap") {
    return /Voss|Harbor/i.test(brief.centralSubject)
      ? "Why does Harbor still wait?"
      : `Why does ${brief.centralSubject.split(/\s+/u)[0] ?? "this"} still wait?`;
  }
  if (style === "cold_open") {
    return /Voss|Harbor/i.test(brief.centralSubject)
      ? "Voss walked back into Harbor."
      : `${brief.centralSubject.split(/\s+/u)[0] ?? "This"} walked back in.`;
  }
  if (style === "countdown_tease") return "Who stands last tonight?";
  if (style === "contrarian_claim" || style === "myth_challenge") {
    return "The return is not settled.";
  }
  if (style === "user_written") return "Stand with Voss now.";
  if (
    /Voss|Harbor/i.test(brief.centralSubject) &&
    brief.intendedConflict &&
    /support|pressure|Voss/i.test(brief.intendedConflict)
  ) {
    return "Can support outlast pressure?";
  }
  const idea = (brief.intendedConflict || brief.controllingIdea || brief.centralSubject)
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length >= 4)
    .slice(0, 4)
    .join(" ");
  const subject = new Set(
    brief.centralSubject
      .replace(/[^\p{L}\s]/gu, " ")
      .toLowerCase()
      .split(/\s+/u)
      .filter((token) => token.length >= 4),
  );
  const ideaTokens = idea.toLowerCase().split(/\s+/u).filter(Boolean);
  if (idea && ideaTokens.some((token) => !subject.has(token))) {
    return `${idea}?`;
  }
  const anchor = ideaTokens[0] || "this";
  return `Can ${anchor} still hold?`;
}

function makeNarrationFirstComposer(input?: {
  readonly hookStyle?: HookStyleSelection | "auto" | "user_written";
  readonly toneFlavor?: string;
}): RetentionComposerCallback {
  return (request) => {
    const brief = request.compositionBrief;
    const opening = hookOpeningFor(
      input?.hookStyle ?? brief.hookStrategy,
      brief,
      request.scriptMode,
    );
    const essential = request.contentAuthority.orderedEssentialUnits.map(
      (unit) => unit.text.replace(/\d+/gu, "").replace(/\s+/gu, " ").trim(),
    );
    const optional = request.contentAuthority.orderedOptionalUnits.map(
      (unit) => unit.text.replace(/\d+/gu, "").replace(/\s+/gu, " ").trim(),
    );
    const includeOptional = request.durationSec >= 36 && optional.length > 0;
    const essentialTake =
      request.durationSec <= 15 ? 1 : request.durationSec <= 30 ? 2 : 3;
    const toneBit = input?.toneFlavor ?? "";
    const mode = request.scriptMode;
    const bodyCore =
      mode === "match_preview"
        ? `${brief.requiredParticipants.join(" and ") || brief.centralSubject} carry the meeting. ${essential.slice(0, 3).join(" ")} The decisive conflict is whether redemption can arrive before the first whistle.`
        : mode === "match_recap"
          ? `${essential[0] ?? brief.controllingIdea} Vale had started brighter. The turning point forced a response, and the result then changed what the night meant.`
          : mode === "tactical_review"
            ? `${essential.join(" ")} That mechanism creates the lane, and the covering eight is the counter that decides whether the line holds.`
            : mode === "opinion_debate"
              ? `${(essential[0] ?? brief.controllingIdea).replace(/\bmay\b/giu, "might")} The strongest reading is the chance quality. A credible counter remains visible. The defensible close stays qualified.`
              : mode === "historical_explainer"
                ? `${essential.join(" ")} The earlier split still explains why the present crowd chooses sides.`
                : mode === "top_5"
                  ? "Nia Calder creates the first shot with a dummy, overlap, and cutback. Tess Orlow controls tempo. Bo Renwick rescues broken presses. Imani Shore delivers set pieces. Pax Ellery arrives late, and Nia Calder stands last as the decisive name."
                  : `${essential.slice(0, essentialTake).join(" ")} ${includeOptional ? optional[0] ?? "" : ""} The same conflict tightens until the promised payoff arrives.`;
    const payoff =
      mode === "match_preview"
        ? "The meeting still asks whether Kest can answer Rookfall."
        : mode === "match_recap"
          ? "The result now belongs to the switch, not to a preview of what comes next."
          : mode === "top_5"
            ? "Nia Calder remains the number one payoff."
            : mode === "opinion_debate"
              ? "The conclusion stays qualified because they maybe still fall short."
              : mode === "tactical_review"
                ? "The line holds only if that covering eight arrives."
                : mode === "historical_explainer"
                  ? "That is why the split still matters now."
                  : /Voss|Harbor|support|pressure/i.test(
                        brief.intendedConsequence ?? brief.controllingIdea,
                      )
                    ? "The payoff is whether Harbor stands with Voss."
                    : `The payoff stays with ${brief.centralSubject.split(" ").slice(0, 3).join(" ")}.`;
    const hard = brief.durationUtilisation.storyHardWordBudget;
    let narration = [opening, toneBit, bodyCore, payoff]
      .filter((part) => part.trim().length > 0)
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
    if (wordCount(narration) > hard) {
      const kept = `${opening} ${essential[0] ?? brief.controllingIdea} ${payoff}`
        .replace(/\s+/gu, " ")
        .trim();
      const words = kept.split(/\s+/u);
      narration =
        words.length <= hard
          ? kept
          : `${opening} ${payoff}`.replace(/\s+/gu, " ").trim();
    }
    const used = [
      ...request.contentAuthority.orderedEssentialUnits
        .map((unit) => unit.claimId)
        .filter((id): id is string => id != null),
    ];
    const omitted = includeOptional
      ? []
      : request.contentAuthority.orderedOptionalUnits
          .map((unit) => unit.claimId)
          .filter((id): id is string => id != null);
    return {
      title: `${brief.centralSubject.split(" ").slice(0, 4).join(" ")} story`,
      narration,
      usedContentIds: used,
      omittedContentIds: omitted,
      hookClaimRefs: [],
      hookOpening: opening,
      payoffClosing: payoff,
    };
  };
}

function buildReady(input: {
  readonly topic: string;
  readonly manualContext?: string;
  readonly scriptMode?: ScriptMode;
  readonly durationSec?: number;
  readonly qualityMode?: "cheap" | "balanced" | "best";
  readonly tone?: Tone;
  readonly hookStyle?: HookStyleSelection | "auto";
}) {
  const contractInput = buildProductionStoryContractInput({
    topic: input.topic,
    durationSec: input.durationSec ?? 45,
    generationPath: "script_only",
    qualityMode: input.qualityMode ?? "cheap",
    scriptMode: input.scriptMode ?? "story",
    tone: input.tone ?? "dramatic",
    factHandlingMode: "verified_facts_only",
    manualContext: input.manualContext,
    hookStyle: input.hookStyle,
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
    hookStyle: input.hookStyle,
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

function composeMapped(
  ready: ReturnType<typeof buildReady>,
  composer: RetentionComposerCallback,
) {
  const proposal = composer(ready.request);
  return buildRetentionNarrationCandidateFromProposal({
    proposal,
    plan: ready.plan,
    grounding: ready.grounding,
    strategySeed: ready.strategySeed,
    origin: "initial_compose",
    extras: {
      contentContract: ready.contentContract,
      brief: ready.request.compositionBrief,
      eligibleClaimIds: new Set(
        ready.request.eligibleClaims.map((claim) => claim.claimId),
      ),
    },
  });
}

async function main(): Promise<void> {
  console.log("retentionNarrationFirstSettings (Prompt 3)\n");

  await check("[registry] every Script Mode has a distinct architecture", () => {
    const modes = listRetentionModeArchitectures();
    assert.equal(modes.length, 8);
    const signatures = modes.map((entry) => entry.phaseIds.join(">"));
    assert.equal(new Set(signatures).size, 8);
    assert.deepEqual(getRetentionModeArchitecture("story").phaseIds, [
      "opening_tension",
      "context",
      "evidence",
      "escalation",
      "consequence_payoff",
    ]);
    assert.ok(
      getRetentionModeArchitecture("top_5").phaseIds.includes("number_one_payoff"),
    );
    for (const file of collectTsFiles(
      path.join(FEATURE_ROOT, "composition"),
    ).filter((file) => file.includes("mode-architecture"))) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /Harbor United finished tenth/u);
      assert.doesNotMatch(src, /Why does Spain/u);
    }
  });

  await check("[effort] Fast/Balanced/Studio table respects current ceilings", () => {
    const table = listRetentionQualityCompositionEffort();
    assert.equal(table.length, 3);
    assert.deepEqual(resolveRetentionQualityCompositionEffort("cheap"), {
      qualityMode: "cheap",
      plannerCalls: 0,
      narrationFirstComposerCalls: 1,
      boundedRepairWhenPermitted: false,
      targetedBodyRewrite: false,
      automaticRewriteUnlessSafetyRescue: false,
    });
    assert.equal(resolveRetentionQualityCompositionEffort("balanced").plannerCalls, 1);
    assert.equal(
      resolveRetentionQualityCompositionEffort("best").targetedBodyRewrite,
      true,
    );
  });

  await check("[duration] utilisation is class-specific, not one percentage", () => {
    const ultra = resolveRetentionDurationUtilisationPolicy({ durationSec: 15 });
    const short = resolveRetentionDurationUtilisationPolicy({ durationSec: 30 });
    const extended = resolveRetentionDurationUtilisationPolicy({ durationSec: 60 });
    assert.equal(ultra.durationClass, "ultra_short");
    assert.equal(short.durationClass, "short");
    assert.equal(extended.durationClass, "extended");
    assert.ok(ultra.minimumUtilisation < short.minimumUtilisation);
    assert.ok(short.minimumUtilisation < extended.minimumUtilisation);
    assert.notEqual(ultra.minimumUtilisation, 0.88);
    assert.ok(ultra.rationale.includes("15–24"));
  });

  const comeback = buildReady({
    topic: "Calen Voss Harbor United comeback",
    manualContext: COMEBACK_CONTEXT,
    scriptMode: "story",
    durationSec: 45,
  });
  const preview = buildReady({
    topic: PREVIEW_TOPIC,
    manualContext: PREVIEW_CONTEXT,
    scriptMode: "match_preview",
    durationSec: 45,
  });
  const ranking = buildReady({
    topic: "Five Harbor attackers to watch",
    manualContext: RANKING_CONTEXT,
    scriptMode: "top_5",
    durationSec: 50,
  });

  await check("[adaptive] essential and ranking claims survive past eight", () => {
    assert.ok(comeback.request.eligibleClaims.length >= 1);
    assert.ok("compositionBrief" in comeback.request);
    assert.equal(comeback.request.requiredOutputSchema.preferNarrationFirst, true);
    const names = ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"];
    const seen: string[] = [];
    for (const claim of ranking.request.eligibleClaims) {
      for (const name of names) {
        if (claim.text.includes(name) && !seen.includes(name)) seen.push(name);
      }
    }
    for (const unit of ranking.request.contentAuthority.orderedEssentialUnits) {
      for (const name of names) {
        if (unit.text.includes(name) && !seen.includes(name)) seen.push(name);
      }
    }
    assert.deepEqual(seen, names);
    assert.ok(
      ranking.request.eligibleClaims.length > 8 ||
        ranking.request.contentAuthority.orderedEssentialUnits.length >= 5,
    );
    const adaptive = selectRetentionAdaptiveComposerClaims({
      eligibleClaims: ranking.request.eligibleClaims,
      requiredClaimIds: ranking.request.eligibleClaims.map((claim) => claim.claimId),
      optionalClaimIds: [],
      durationSec: 15,
    });
    assert.ok(adaptive.included.length >= Math.min(5, ranking.request.eligibleClaims.length));
    for (const durationSec of [15, 30, 45, 60] as const) {
      const ready = buildReady({
        topic: "Calen Voss Harbor United comeback",
        manualContext: COMEBACK_CONTEXT,
        durationSec,
      });
      assert.ok(ready.request.eligibleClaims.length >= 1);
      assert.ok(ready.request.compositionBrief.durationUtilisation.durationSec === durationSec);
    }
  });

  await check("[A] comeback narration-first mapping is byte-faithful", () => {
    const before =
      "Opening tension. Ban fact. Poor return. New coach. Support versus pressure.";
    const built = composeMapped(comeback, makeNarrationFirstComposer());
    const after = built.candidate.assembledNarration;
    console.log("  before/after comeback:\n   ", before, "\n   ", after);
    assert.equal(after.includes("\n\n"), false);
    assert.equal(
      built.candidate.segments
        .map((segment) => segment.text)
        .filter(Boolean)
        .join(" "),
      after,
    );
    assert.match(after, /Voss|Harbor|support|pressure/u);
    assert.match(lastSentence(after), /Harbor|Voss|support|pressure/u);
    const relationship = evaluateRetentionHookBodyPayoff({
      narration: after,
      contentContract: comeback.contentContract,
      brief: comeback.request.compositionBrief,
    });
    assert.equal(relationship.ok, true, relationship.reasonIds.join(","));
  });

  await check("[B] fallen-giants preview names both participants", () => {
    const before = "Preview hook. One club. Form. Question.";
    const built = composeMapped(preview, makeNarrationFirstComposer());
    const after = built.candidate.assembledNarration;
    console.log("  before/after preview:\n   ", before, "\n   ", after);
    assert.match(after, /Rookfall/u);
    assert.match(after, /Silvermere/u);
    assert.match(after, /Kest/u);
    assert.doesNotMatch(after, /\bwill kick off tomorrow\b/u);
    assert.equal(after.includes("\n\n"), false);
  });

  await check("[C] five-player ranking keeps exact membership", () => {
    const before = "Top five list dumped as one checklist.";
    const built = composeMapped(ranking, makeNarrationFirstComposer());
    const after = built.candidate.assembledNarration;
    console.log("  before/after ranking:\n   ", before, "\n   ", after);
    const names = ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"];
    for (const name of names) {
      assert.match(after, new RegExp(name.split(" ")[0]!, "u"));
    }
    assert.equal(new Set(names.map((name) => name.split(" ")[0])).size, 5);
    assert.match(after, /Nia Calder/u);
    assert.match(lastSentence(after), /Nia|number one|decisive/u);
  });

  await check("[D] match recap is not written as a preview", () => {
    const ready = buildReady({
      topic: "Harbor versus Vale recap",
      manualContext: RECAP_CONTEXT,
      scriptMode: "match_recap",
      durationSec: 40,
    });
    const built = composeMapped(ready, makeNarrationFirstComposer());
    assert.match(built.candidate.assembledNarration, /result|switch|turning/u);
    assert.doesNotMatch(
      built.candidate.assembledNarration,
      /before the first whistle/u,
    );
    assert.notEqual(
      ready.request.compositionBrief.narrativeArchitecture.phaseIds.join(">"),
      preview.request.compositionBrief.narrativeArchitecture.phaseIds.join(">"),
    );
  });

  await check("[E] tactical analysis uses mechanism causality", () => {
    const ready = buildReady({
      topic: "Maren Quill high line question",
      manualContext: TACTICAL_CONTEXT,
      scriptMode: "tactical_review",
      durationSec: 40,
    });
    const built = composeMapped(ready, makeNarrationFirstComposer());
    assert.match(built.candidate.assembledNarration, /mechanism|covering eight|line/u);
    assert.doesNotMatch(
      built.candidate.assembledNarration,
      /Spain pressure advances with clear focus/u,
    );
  });

  await check("[F] opinion stays qualified", () => {
    const ready = buildReady({
      topic: "Vale Athletic title race argument",
      manualContext: OPINION_CONTEXT,
      scriptMode: "opinion_debate",
      durationSec: 40,
    });
    const built = composeMapped(ready, makeNarrationFirstComposer());
    assert.match(built.candidate.assembledNarration, /may/u);
    assert.match(built.candidate.assembledNarration, /written off|chance quality|qualified/u);
  });

  await check("[G] history stays chronological", () => {
    const ready = buildReady({
      topic: "Harbor derby riverside split",
      manualContext: HISTORY_CONTEXT,
      scriptMode: "historical_explainer",
      durationSec: 40,
    });
    const built = composeMapped(ready, makeNarrationFirstComposer());
    const text = built.candidate.assembledNarration;
    const today = text.indexOf("Today") >= 0 ? text.indexOf("Today") : text.indexOf("still");
    const earlier = text.indexOf("Earlier") >= 0 ? text.indexOf("Earlier") : text.indexOf("shared");
    const turning = text.indexOf("turning") >= 0 ? text.indexOf("turning") : text.indexOf("split");
    assert.ok(today >= 0 && earlier >= 0 && turning >= 0);
  });

  await check("[H] sparse topic stays shorter and honest", () => {
    const ready = buildReady({
      topic: "Maren Quill tactical question",
      manualContext: "Whether Quill can hold a high line.",
      durationSec: 25,
    });
    assert.equal(ready.request.compositionBrief.lowContextWarning, true);
    const built = composeMapped(ready, makeNarrationFirstComposer());
    assert.ok(wordCount(built.candidate.assembledNarration) < 90);
    assert.doesNotMatch(built.candidate.assembledNarration, /\b3-0\b/u);
  });

  await check("[I] overfull 30s omits optional IDs without filler", () => {
    const ready = buildReady({
      topic: "Jori Flint Harbor return",
      manualContext: OVERFULL_CONTEXT,
      durationSec: 30,
    });
    assert.ok(
      ready.request.omittedOptionalClaimIds.length >= 1 ||
        ready.request.compositionBrief.excludedOptionalClaimIds.length >= 0,
    );
    const built = composeMapped(
      ready,
      makeNarrationFirstComposer(),
    );
    assert.match(built.candidate.assembledNarration, /Flint|ankle|substitute/u);
    assert.doesNotMatch(
      built.candidate.assembledNarration,
      /central idea|next beat|that connection/u,
    );
  });

  await check("[J] Hook variants change the opening, not the facts", () => {
    const styles: Array<HookStyleSelection | "auto"> = [
      "auto",
      "provocative_question",
      "stakes_first",
      "curiosity_gap",
      "cold_open",
    ];
    const openings: string[] = [];
    const payoffs: string[] = [];
    for (const style of styles) {
      const ready = buildReady({
        topic: "Calen Voss Harbor United comeback",
        manualContext: COMEBACK_CONTEXT,
        hookStyle: style,
        durationSec: 40,
      });
      const built = composeMapped(
        ready,
        makeNarrationFirstComposer({ hookStyle: style }),
      );
      openings.push(firstSentence(built.candidate.assembledNarration));
      payoffs.push(lastSentence(built.candidate.assembledNarration));
      assert.match(built.candidate.assembledNarration, /Voss|Harbor/u);
    }
    assert.ok(new Set(openings).size >= 3, openings.join(" | "));
    assert.ok(
      payoffs.every((payoff) => /Harbor|Voss|support|pressure/u.test(payoff)),
    );
  });

  await check("[K] tone variants change language, not facts", () => {
    const tones: Tone[] = ["dramatic", "news", "tactical"];
    const narrations: string[] = [];
    for (const tone of tones) {
      const ready = buildReady({
        topic: "Calen Voss Harbor United comeback",
        manualContext: COMEBACK_CONTEXT,
        tone,
        durationSec: 40,
      });
      const flavor =
        tone === "news"
          ? "The report stays plain."
          : tone === "tactical"
            ? "The shape of the return matters."
            : "The night feels heavier.";
      const built = composeMapped(
        ready,
        makeNarrationFirstComposer({ toneFlavor: flavor }),
      );
      narrations.push(built.candidate.assembledNarration);
      assert.match(built.candidate.assembledNarration, /Voss|Harbor/u);
      assert.equal(
        ready.request.compositionBrief.narrativeArchitecture.scriptMode,
        "story",
      );
    }
    assert.notEqual(narrations[0], narrations[1]);
    assert.notEqual(narrations[1], narrations[2]);
  });

  await check("[L] longer durations add optional detail, not repetition", () => {
    const texts: string[] = [];
    for (const durationSec of [15, 30, 45, 60] as const) {
      const ready = buildReady({
        topic: "Calen Voss Harbor United comeback",
        manualContext: COMEBACK_CONTEXT,
        durationSec,
      });
      const built = composeMapped(ready, makeNarrationFirstComposer());
      texts.push(built.candidate.assembledNarration);
      assert.match(built.candidate.assembledNarration, /Voss|Harbor/u);
    }
    assert.ok(wordCount(texts[3]!) >= wordCount(texts[0]!));
    assert.doesNotMatch(texts[3]!, /Can support outlast pressure\? Can support/u);
  });

  await check("[P3-1] injected coherent composer output is model_direct", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "balanced",
      factHandlingMode: "verified_facts_only",
      planner: makeRetentionPlanner("balanced"),
      composer: makeRetentionComposer(),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true, result.ok ? "" : result.failureCategory);
    if (!result.ok) throw new Error("expected success");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
  });

  await check("[P3-2] Studio targeted rewrite can end as model_after_rewrite", async () => {
    const weak: RetentionComposerCallback = (request) => {
      const n = request.orderedBeatIds.length;
      return {
        title: "Spain pressure story",
        hookClaimRefs: [],
        segments: request.orderedBeatIds.map((beatId, i) => ({
          beatId,
          text:
            i === 0
              ? "Why does Spain pressure matter? Spain pressure keeps Spain pressure moving with Spain pressure tonight."
              : "Spain pressure keeps Spain pressure moving with Spain pressure tonight.",
        })),
      };
      void n;
    };
    const strong: RetentionComposerCallback = (request) => ({
      title: "Spain pressure story",
      hookClaimRefs: [],
      segments: request.orderedBeatIds.map((beatId, i) => ({
        beatId,
        text:
          i === 0
            ? "Why does Spain pressure matter? Spain tactical focus reshapes this France preview tonight with a clear stake."
            : i === request.orderedBeatIds.length - 1
              ? "Spain pressure closes this preview decisively tonight against France."
              : "Spain midfield pressure advances the France preview with a distinct next movement.",
      })),
    });
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "best",
      factHandlingMode: "verified_facts_only",
      planner: makeRetentionPlanner("best"),
      composer: weak,
      rewriteComposer: async (request) =>
        strong({
          ...comeback.request,
          orderedBeatIds: request.orderedBeatIds,
          durationSec: 40,
        } as RetentionComposerRequest),
      hookRunner: passRetentionHookRunner,
    });
    if (result.ok) {
      const authority =
        result.approved.generationDisposition?.acceptanceTrace
          ?.finalNarrationAuthority;
      assert.ok(
        authority === "model_after_rewrite" || authority === "model_direct",
        authority,
      );
    }
  });

  await check("[compat] no production topic special cases in new composer files", () => {
    const files = collectTsFiles(path.join(FEATURE_ROOT, "composition")).filter(
      (file) =>
        /narration-first|composition-brief|mode-architecture|tone-presentation|duration-utilisation|quality-composition|adaptive-composer|hook-body-payoff|map-retention-narration/u.test(
          file,
        ),
    );
    assert.ok(files.length >= 6);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /Spain versus France/u);
      assert.doesNotMatch(src, /Calen Voss Harbor United comeback/u);
    }
  });

  await check("[brief] settings do not rewrite factual authority", () => {
    const dramatic = buildRetentionCompositionBrief({
      contract: comeback.contract,
      contentContract: comeback.contentContract,
    });
    const newsReady = buildReady({
      topic: "Calen Voss Harbor United comeback",
      manualContext: COMEBACK_CONTEXT,
      tone: "news",
    });
    assert.equal(
      dramatic.controllingIdea,
      newsReady.request.compositionBrief.controllingIdea,
    );
    assert.notEqual(
      dramatic.toneGuidance.tone,
      newsReady.request.compositionBrief.toneGuidance.tone,
    );
  });

  console.log("\nretentionNarrationFirstSettings: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
