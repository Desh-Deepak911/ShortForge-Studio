/**
 * Derive one immutable composition brief from contract + settings.
 * Settings never alter factual authority.
 */

import type { ScriptMode } from "@/types/footiebitz";
import type { RetentionHookStrategyId } from "./retention-composition-brief.types";

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import { buildRetentionParticipantCoverage } from "../strategy/retention-matchup-participant-coverage";
import { RETENTION_COMPOSITION_BRIEF_VERSION } from "./retention-composition-brief.types";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";
import { getRetentionModeArchitecture } from "./retention-mode-architecture.registry";
import { resolveRetentionDurationUtilisationPolicy } from "./retention-duration-utilisation.policy";
import { resolveRetentionQualityCompositionEffort } from "./retention-quality-composition-effort.policy";
import { getRetentionTonePresentation } from "./retention-tone-presentation.registry";

const RANKING_NAME =
  /^([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2})\s*[–—:-]/u;
const NUMBERED_RANKING_NAME =
  /(?:^|[;\n])\s*\d+[.)]\s*([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)+)/u;

function foldRankingLabel(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function rankingMembership(
  contentContract: RetentionCreatorContentContract,
  scriptMode: ScriptMode,
): { readonly membership: readonly string[]; readonly order: readonly string[] } {
  if (scriptMode !== "top_5") {
    return { membership: Object.freeze([]), order: Object.freeze([]) };
  }
  const numbered: string[] = [];
  const entries: string[] = [];
  const loose: string[] = [];
  const subjectFold = foldRankingLabel(contentContract.centralSubject);
  for (const unit of contentContract.orderedUnits) {
    if (unit.kind === "instruction" || unit.kind === "forbidden") continue;
    const listed = unit.text.match(NUMBERED_RANKING_NAME)?.[1]?.trim();
    if (listed && !numbered.includes(listed)) numbered.push(listed);
    if (unit.sourceField === "creator_brief") continue;
    const entry = unit.text.match(RANKING_NAME)?.[1]?.trim();
    if (entry && !entries.includes(entry)) entries.push(entry);
    const name = entry;
    if (!name || loose.includes(name)) continue;
    const nameFold = foldRankingLabel(name);
    if (nameFold === subjectFold || subjectFold.startsWith(`${nameFold} `)) {
      continue;
    }
    loose.push(name);
  }
  const names = numbered.length >= 2 ? numbered : entries.length >= 2 ? entries : loose;
  return {
    membership: Object.freeze(names),
    order: Object.freeze([...names]),
  };
}

function resolveAutoHookStrategy(
  contentContract: RetentionCreatorContentContract,
  scriptMode: ScriptMode,
): { readonly strategy: RetentionHookStrategyId; readonly rationale: string } {
  if (scriptMode === "top_5") {
    return {
      strategy: "countdown_tease",
      rationale: "Ranking membership is the strongest contract promise.",
    };
  }
  if (contentContract.intendedConflict) {
    return {
      strategy: "provocative_question",
      rationale: "The contract already names a conflict the opening can promise.",
    };
  }
  if (contentContract.intendedConsequence) {
    return {
      strategy: "stakes_first",
      rationale: "The contract already names a consequence the opening can stake.",
    };
  }
  if (scriptMode === "match_recap") {
    return {
      strategy: "headline_first",
      rationale: "Recap openings should lead with the result-defining fact.",
    };
  }
  if (scriptMode === "historical_explainer") {
    return {
      strategy: "curiosity_gap",
      rationale: "History openings should tease why the past still matters.",
    };
  }
  return {
    strategy: "cold_open",
    rationale: "Drop into the strongest supplied moment, then evidence it.",
  };
}

export function buildRetentionCompositionBrief(input: {
  readonly contract: NormalizedStoryContract;
  readonly contentContract: RetentionCreatorContentContract;
  readonly excludedOptionalClaimIds?: readonly string[];
  readonly hookStyle?: RetentionHookStrategyId | null;
  readonly reliabilityMode?: "flexible" | "precise";
}): RetentionCompositionBrief {
  const { contract, contentContract } = input;
  const coverage = buildRetentionParticipantCoverage(contract);
  const requiredParticipants = coverage.required
    ? coverage.groups.map((group) => group.displayLabel)
    : [];
  const ranking = rankingMembership(contentContract, contract.scriptMode);
  const rankingNumberOneMember =
    ranking.order.length > 0 ? ranking.order[0]! : null;
  const rankingSpeakDirection =
    ranking.order.length >= 2
      ? ("listed_order_to_number_one" as const)
      : ranking.order.length === 1
        ? ("number_one_first" as const)
        : ("unordered" as const);
  const rankingPresentationInstruction =
    rankingNumberOneMember == null
      ? "No ordered ranking is required."
      : [
          `Ranking direction: speak members in listed order (${ranking.order.join(", ")}).`,
          `The exact number-one member is ${rankingNumberOneMember}.`,
          `The closing must state that ${rankingNumberOneMember} is number one, using a supported reason already given for that member.`,
          "Do not infer a different winner from the last name mentioned, rhetorical emphasis, or the most dramatic clause.",
        ].join(" ");
  const selectedHook =
    input.hookStyle ?? contentContract.presentationSettings.hookStyle ?? "auto";
  const auto = resolveAutoHookStrategy(contentContract, contract.scriptMode);
  const hookStrategy = selectedHook === "auto" ? auto.strategy : selectedHook;
  const durationUtilisation = resolveRetentionDurationUtilisationPolicy({
    durationSec: contract.durationSec,
    storyHardWordBudget: contentContract.storyWordBudget,
  });
  const essentialUnits = contentContract.orderedUnits.filter((unit) =>
    contentContract.essentialContentUnitIds.includes(unit.contentUnitId),
  );
  const essentialWords = essentialUnits.reduce(
    (sum, unit) => sum + unit.text.trim().split(/\s+/u).filter(Boolean).length,
    0,
  );
  const lowContextWarning =
    contentContract.optionalContentUnitIds.length === 0 &&
    (essentialUnits.length <= 2 ||
      essentialWords < Math.max(12, Math.floor(durationUtilisation.minimumUsefulWords * 0.55)));

  return Object.freeze({
    version: RETENTION_COMPOSITION_BRIEF_VERSION,
    centralSubject: contentContract.centralSubject,
    controllingIdea: contentContract.controllingIdea,
    intendedConflict: contentContract.intendedConflict,
    intendedConsequence: contentContract.intendedConsequence,
    orderedEssentialUnitIds: Object.freeze([
      ...contentContract.essentialContentUnitIds,
    ]),
    orderedOptionalUnitIds: Object.freeze([
      ...contentContract.optionalContentUnitIds,
    ]),
    structuralObligations: Object.freeze([
      ...contentContract.requestedStructuralObligations,
    ]),
    requiredParticipants: Object.freeze(requiredParticipants),
    requiredRankingMembership: ranking.membership,
    requiredRankingOrder: ranking.order,
    rankingNumberOneMember,
    rankingSpeakDirection,
    rankingPresentationInstruction,
    requiredUncertaintyLanguage: Object.freeze([
      ...contentContract.requiredUncertaintyLanguage,
    ]),
    forbiddenInventionIds: Object.freeze([
      ...contentContract.forbiddenInventionIds,
    ]),
    hookStrategy,
    hookStrategyRationale:
      selectedHook === "auto"
        ? auto.rationale
        : selectedHook === "user_written"
          ? "User-written Hook remains byte-authoritative when accepted."
          : "Selected Hook style shapes the opening; the body must evidence that promise.",
    narrativeArchitecture: Object.freeze({
      ...getRetentionModeArchitecture(contract.scriptMode),
    }),
    toneGuidance: Object.freeze({
      ...getRetentionTonePresentation(contract.tone),
    }),
    durationUtilisation,
    qualityEffort: resolveRetentionQualityCompositionEffort(contract.qualityMode),
    reliabilityMode:
      input.reliabilityMode ??
      contentContract.presentationSettings.reliabilityMode,
    excludedOptionalClaimIds: Object.freeze([
      ...(input.excludedOptionalClaimIds ?? []),
    ]),
    lowContextWarning,
  });
}
