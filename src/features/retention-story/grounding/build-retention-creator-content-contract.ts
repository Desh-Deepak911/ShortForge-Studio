/**
 * Build the ephemeral Creator Content Contract from creator inputs + grounding.
 */

import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";

import {
  RETENTION_CREATOR_CONTENT_CONTRACT_VERSION,
  type RetentionCreatorContentContract,
  type RetentionCreatorContentUnit,
} from "../domain/retention-creator-content-contract.types";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import { parseRetentionCreatorContentUnits } from "./parse-retention-creator-content-units";

function freezeContract(
  value: RetentionCreatorContentContract,
): RetentionCreatorContentContract {
  return Object.freeze({
    ...value,
    orderedUnits: Object.freeze(value.orderedUnits.map((unit) => Object.freeze({ ...unit }))),
    essentialContentUnitIds: Object.freeze([...value.essentialContentUnitIds]),
    optionalContentUnitIds: Object.freeze([...value.optionalContentUnitIds]),
    requiredUncertaintyLanguage: Object.freeze([
      ...value.requiredUncertaintyLanguage,
    ]),
    forbiddenInventionIds: Object.freeze([...value.forbiddenInventionIds]),
    requestedStructuralObligations: Object.freeze([
      ...value.requestedStructuralObligations,
    ]),
    presentationSettings: Object.freeze({ ...value.presentationSettings }),
  });
}

function linkUnitsToClaims(
  units: readonly RetentionCreatorContentUnit[],
  grounding: RetentionGroundingContext,
): readonly RetentionCreatorContentUnit[] {
  const unused = [...grounding.claims];
  return Object.freeze(
    units.map((unit) => {
      const idx = unused.findIndex(
        (claim) =>
          claim.text.trim() === unit.text.trim() ||
          claim.text.replace(/[.!?…]+$/u, "").trim() ===
            unit.text.replace(/[.!?…]+$/u, "").trim(),
      );
      if (idx < 0) return unit;
      const claim = unused.splice(idx, 1)[0]!;
      return Object.freeze({
        ...unit,
        claimId: claim.claimId,
        authority: claim.forbidden
          ? ("forbidden" as const)
          : claim.verification === "verified" &&
              (claim.provenance === "research_graph" ||
                claim.provenance === "research_provider")
            ? ("research_verified" as const)
            : ("creator_supplied_unverified" as const),
      });
    }),
  );
}

function sourceFieldForClaim(
  claim: RetentionGroundingContext["claims"][number],
): RetentionCreatorContentUnit["sourceField"] {
  if (claim.sourceRef === "creator_brief") return "creator_brief";
  if (claim.sourceRef === "manual_context") return "manual_context";
  if (claim.sourceRef === "manual_notes") return "manual_notes";
  if (claim.sourceRef === "creative_premise") return "creative_premise";
  if (
    claim.provenance === "research_graph" ||
    claim.provenance === "research_provider"
  ) {
    return "research";
  }
  return "manual_context";
}

function appendUnlinkedGroundingUnits(
  units: readonly RetentionCreatorContentUnit[],
  grounding: RetentionGroundingContext,
): readonly RetentionCreatorContentUnit[] {
  const usedClaimIds = new Set(
    units.map((unit) => unit.claimId).filter((id): id is string => id != null),
  );
  const extra: RetentionCreatorContentUnit[] = [];
  let order =
    units.length === 0 ? 0 : Math.max(...units.map((unit) => unit.creatorOrder)) + 1;
  for (const claim of grounding.claims) {
    if (usedClaimIds.has(claim.claimId)) continue;
    const sourceField = sourceFieldForClaim(claim);
    extra.push(
      Object.freeze({
        contentUnitId:
          sourceField === "research"
            ? `rs:u:research:${claim.claimId}`
            : `rs:u:grounded:${claim.claimId}`,
        claimId: claim.claimId,
        sourceField,
        creatorOrder: order,
        sourceSpan: Object.freeze({ start: 0, end: 0 }),
        role: claim.forbidden ? "optional" : "essential",
        kind: claim.forbidden ? "forbidden" : "factual",
        authority: claim.forbidden
          ? ("forbidden" as const)
          : claim.verification === "verified" && sourceField === "research"
            ? ("research_verified" as const)
            : ("creator_supplied_unverified" as const),
        entityTokens: Object.freeze([]),
        parentContentUnitId: null,
        requiresUncertainty: false,
        text: claim.text,
      }),
    );
    order += 1;
  }
  return Object.freeze([...units, ...extra]);
}

function structuralObligations(
  contract: NormalizedStoryContract,
): readonly string[] {
  const obligations: string[] = [];
  if (
    contract.scriptMode === "match_preview" ||
    contract.scriptMode === "match_recap"
  ) {
    obligations.push("name_required_participants");
  }
  if (contract.scriptMode === "top_5") {
    obligations.push("retain_requested_ranking_membership");
    obligations.push("preserve_creator_rank_order");
  }
  if (contract.constraints.requirePayoff) {
    obligations.push("deliver_payoff");
  }
  return Object.freeze(obligations);
}

function deriveConflict(
  units: readonly RetentionCreatorContentUnit[],
): string | null {
  const interpretive = units.find(
    (unit) => unit.kind === "interpretive" && unit.role === "essential",
  );
  return interpretive?.text ?? null;
}

function deriveConsequence(
  units: readonly RetentionCreatorContentUnit[],
): string | null {
  const payoff = [...units]
    .reverse()
    .find(
      (unit) =>
        unit.role === "essential" &&
        (unit.kind === "factual" || unit.kind === "interpretive"),
    );
  return payoff?.text ?? null;
}

export function buildRetentionCreatorContentContract(input: {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly manualContext?: string | null;
  readonly premiseDetails?: string | null;
  readonly hookStyle?: HookStyleSelection | string | null;
  readonly reliabilityMode?: "flexible" | "precise";
  readonly controllingIdeaStatement?: string | null;
  readonly centralSubject?: string | null;
}): RetentionCreatorContentContract {
  const topicUnits = parseRetentionCreatorContentUnits({
    text: input.contract.topic,
    sourceField: "creator_brief",
    defaultRole: "essential",
    startOrder: 0,
  });
  const contextUnits = parseRetentionCreatorContentUnits({
    text: input.manualContext ?? "",
    sourceField: "manual_context",
    defaultRole: "essential",
    startOrder: topicUnits.length,
  });
  const premiseUnits =
    input.contract.factHandlingMode === "creative_premise"
      ? parseRetentionCreatorContentUnits({
          text: input.premiseDetails ?? "",
          sourceField: "creative_premise",
          defaultRole: "essential",
          startOrder: topicUnits.length + contextUnits.length,
        })
      : Object.freeze([] as RetentionCreatorContentUnit[]);

  const merged = linkUnitsToClaims(
    [...topicUnits, ...contextUnits, ...premiseUnits],
    input.grounding,
  );
  const orderedUnits = appendUnlinkedGroundingUnits(merged, input.grounding);

  const essentialContentUnitIds = orderedUnits
    .filter((unit) => unit.role === "essential" && unit.kind !== "instruction")
    .map((unit) => unit.contentUnitId);
  const optionalContentUnitIds = orderedUnits
    .filter((unit) => unit.role === "optional" && unit.kind !== "instruction")
    .map((unit) => unit.contentUnitId);
  const forbiddenInventionIds = orderedUnits
    .filter((unit) => unit.kind === "forbidden")
    .map((unit) => unit.contentUnitId);
  const requiredUncertaintyLanguage = [
    ...new Set(
      orderedUnits
        .filter((unit) => unit.requiresUncertainty)
        .flatMap((unit) =>
          unit.text
            .split(/[^\p{L}]+/u)
            .filter((token) =>
              /^(?:maybe|might|may|reportedly|allegedly|unconfirmed|uncertain|unclear|possibly|perhaps|rumou?red)$/iu.test(
                token,
              ),
            ),
        ),
    ),
  ];

  const subject = input.centralSubject?.trim() || input.contract.topic;
  const controllingIdea =
    input.controllingIdeaStatement?.trim() ||
    orderedUnits.find(
      (unit) =>
        unit.kind === "interpretive" ||
        (unit.kind === "factual" && unit.role === "essential"),
    )?.text ||
    subject;

  return freezeContract({
    version: RETENTION_CREATOR_CONTENT_CONTRACT_VERSION,
    centralSubject: subject,
    controllingIdea,
    intendedConflict: deriveConflict(orderedUnits),
    intendedConsequence: deriveConsequence(orderedUnits),
    orderedUnits,
    essentialContentUnitIds,
    optionalContentUnitIds,
    requiredUncertaintyLanguage,
    forbiddenInventionIds,
    requestedStructuralObligations: structuralObligations(input.contract),
    presentationSettings: {
      scriptMode: input.contract.scriptMode,
      tone: input.contract.tone,
      hookStyle: (input.hookStyle as HookStyleSelection | undefined) ?? "auto",
      factHandlingMode: input.contract.factHandlingMode,
      qualityMode: input.contract.qualityMode,
      reliabilityMode: input.reliabilityMode ?? "flexible",
      durationSec: input.contract.durationSec,
    },
    storyWordBudget: Math.round(input.contract.durationSec * 2.4),
  });
}
