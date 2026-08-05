/**
 * Retention-owned structured grounding adapter — Sprint 10B.1.
 * Consumes GraphContext / AssembledContext / NarrativePlan.
 * Does not import Hook grounding, parse prompt strings, or use queryId/timestamps as identity.
 */

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type {
  GraphContext,
  GraphContextFact,
} from "@/features/intelligence/context/graph-context.types";
import type { NarrativePlan } from "@/features/intelligence/prompts/narrative-plan.types";
import type { IntelligenceFact } from "@/features/intelligence/shared/knowledge.types";

import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import { RETENTION_MAX_CLAIM_TEXT_CHARS } from "../domain/retention-story-contract.constants";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import {
  finalizeRetentionGroundingClaims,
  type RetentionGroundingClaimDraft,
} from "./retention-grounding-normalization";
import { mapRetentionSourceToAuthority } from "./retention-source-trust";

export interface BuildRetentionGroundingContextInput {
  readonly graphContext?: GraphContext | null;
  readonly assembledContext?: AssembledContext | null;
  readonly narrativePlan?: NarrativePlan | null;
  /** Creator brief/topic. Creator-authorized, not independently verified. */
  readonly creatorBrief?: string | null;
  /** Optional creator notes. Creator-authorized, not independently verified. */
  readonly manualContext?: string | null;
}

const MAX_CREATOR_FACTS_PER_FIELD = 12;
const CREATOR_INSTRUCTION_SENTENCE =
  /^(?:(?:please\s+)?(?:tell|create|write|explain|cover|show|describe|make)\b(?:\s+(?:me|us))?(?:\s+(?:a|an|the))?(?:\s+story\s+(?:about|of))?)/iu;

function splitCreatorMaterial(
  textRaw: string | null | undefined,
): readonly string[] {
  const text = sanitizeRetentionText(
    textRaw ?? "",
    RETENTION_MAX_CLAIM_TEXT_CHARS * MAX_CREATOR_FACTS_PER_FIELD,
  );
  if (!text) return Object.freeze([]);
  return Object.freeze(
    text
      .split(/(?:\r?\n)+|(?<=[.!?…])\s+/u)
      .map((part) =>
        sanitizeRetentionText(part, RETENTION_MAX_CLAIM_TEXT_CHARS),
      )
      // Direction belongs to the controlling idea, not the fact ledger. Keeping
      // it as a claim makes deterministic rescue speak prompts such as
      // "Explain the offside trap" verbatim.
      .filter((part) => Boolean(part) && !CREATOR_INSTRUCTION_SENTENCE.test(part))
      .slice(0, MAX_CREATOR_FACTS_PER_FIELD),
  );
}

function factRoleForId(
  plan: NarrativePlan | null | undefined,
  factId: string,
): { piBeatId?: string; piFactRole?: string } {
  if (!plan) return {};
  let piBeatId: string | undefined;
  const roles: string[] = [];

  if (plan.requiredFacts.includes(factId)) roles.push("required");
  if (plan.optionalFacts.includes(factId)) roles.push("optional");
  if (plan.openingIntent?.factIds.includes(factId))
    roles.push("opening_intent");

  const beatIds: string[] = [];
  for (const beat of plan.beats) {
    if (beat.requiredFactIds.includes(factId)) {
      beatIds.push(beat.id);
      if (beat.openingHook) roles.push("opening_hook");
    }
  }
  if (beatIds.length > 0) {
    piBeatId = [...beatIds].sort((a, b) => a.localeCompare(b))[0];
  }

  if (roles.length === 0 && !piBeatId) return {};
  return {
    ...(piBeatId ? { piBeatId } : {}),
    ...(roles.length
      ? { piFactRole: [...new Set(roles)].sort().join("+") }
      : {}),
  };
}

function graphCollections(graph: GraphContext): readonly GraphContextFact[][] {
  return [
    graph.verifiedFacts,
    graph.rankedFacts,
    graph.fixtureFacts,
    graph.statisticFacts,
    graph.timelineFacts,
  ];
}

/** True when Graph supplies at least one usable normalized structured fact. */
export function graphContextHasUsableFacts(
  graph: GraphContext | null | undefined,
): boolean {
  if (!graph) return false;
  for (const collection of graphCollections(graph)) {
    for (const fact of collection) {
      if (
        sanitizeRetentionText(fact.text ?? "", RETENTION_MAX_CLAIM_TEXT_CHARS)
      ) {
        return true;
      }
    }
  }
  return false;
}

function pushGraphFacts(
  drafts: RetentionGroundingClaimDraft[],
  graph: GraphContext,
  plan: NarrativePlan | null | undefined,
): void {
  for (const collection of graphCollections(graph)) {
    for (const fact of collection) {
      const text = fact.text?.trim() ?? "";
      if (!text) continue;
      const claimId = fact.id?.trim() || undefined;
      const mapped = mapRetentionSourceToAuthority(
        fact.provenance?.source,
        "graph",
      );
      const links = claimId ? factRoleForId(plan, claimId) : {};
      drafts.push({
        claimId,
        text,
        ...mapped,
        sourceRef: fact.provenance?.source
          ? String(fact.provenance.source)
          : undefined,
        contentIdentity: claimId
          ? null
          : { kind: "graph_fact", type: fact.type, text },
        hasAuthoritativeId: Boolean(claimId),
        ...links,
      });
    }
  }
}

function mapAssembledFactProvenance(fact: IntelligenceFact) {
  return mapRetentionSourceToAuthority(fact.provenance?.source, "assembled");
}

function pushAssembledProviderCollections(
  drafts: RetentionGroundingClaimDraft[],
  assembled: AssembledContext,
  plan: NarrativePlan | null | undefined,
): void {
  for (const fact of assembled.verifiedFacts) {
    const text = fact.text?.trim() ?? "";
    if (!text) continue;
    const claimId = fact.id?.trim() || undefined;
    const mapped = mapAssembledFactProvenance(fact);
    const links = claimId ? factRoleForId(plan, claimId) : {};
    drafts.push({
      claimId,
      text,
      ...mapped,
      sourceRef: fact.provenance?.source
        ? String(fact.provenance.source)
        : undefined,
      contentIdentity: claimId ? null : { kind: "assembled_verified", text },
      hasAuthoritativeId: Boolean(claimId),
      ...links,
    });
  }

  const bundle = mapRetentionSourceToAuthority(
    assembled.provenance?.source,
    "assembled",
  );
  // Structured collections without per-item provenance follow bundle source.

  for (const ranking of assembled.rankings) {
    for (const entry of ranking.entries) {
      const label = entry.label?.trim();
      if (!label) continue;
      const valuePart =
        entry.value == null || Number.isNaN(Number(entry.value))
          ? ""
          : ` — ${entry.value}`;
      const text = `#${entry.rank} ${label}${valuePart} (${ranking.metric})`;
      drafts.push({
        text,
        ...bundle,
        sourceRef: "ranking",
        contentIdentity: {
          kind: "ranking",
          metric: ranking.metric,
          rank: entry.rank,
          label,
          value: entry.value ?? null,
          entityId: entry.entityId ?? null,
        },
      });
    }
  }

  for (const fixture of assembled.fixtures) {
    const score =
      fixture.homeGoals == null || fixture.awayGoals == null
        ? "TBD"
        : `${fixture.homeGoals}-${fixture.awayGoals}`;
    const text = `${fixture.homeTeam} vs ${fixture.awayTeam} (${fixture.league}) ${score}`;
    drafts.push({
      text,
      ...bundle,
      sourceRef: "fixture",
      contentIdentity: {
        kind: "fixture",
        id: fixture.id,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        date: fixture.date,
      },
    });
  }

  for (const stat of assembled.statistics) {
    const text = `${stat.team}: ${stat.type} = ${stat.value ?? "n/a"}`;
    drafts.push({
      text,
      ...bundle,
      sourceRef: "statistic",
      contentIdentity: {
        kind: "statistic",
        team: stat.team,
        type: stat.type,
        value: stat.value ?? null,
      },
    });
  }

  for (const event of assembled.events) {
    const minute =
      event.minute == null
        ? ""
        : `${event.minute}${event.extraMinute != null ? `+${event.extraMinute}` : ""}' `;
    const text =
      `${minute}${event.team}${event.player ? ` — ${event.player}` : ""}${
        event.detail ? ` (${event.detail})` : ""
      }${event.type ? ` [${event.type}]` : ""}`.trim();
    if (!text) continue;
    drafts.push({
      text,
      ...bundle,
      sourceRef: "timeline",
      contentIdentity: {
        kind: "event",
        minute: event.minute ?? null,
        team: event.team,
        player: event.player ?? null,
        type: event.type ?? null,
        detail: event.detail ?? null,
      },
    });
  }

  for (const lineup of assembled.lineups) {
    const xi = lineup.startingXi.slice(0, 11).join(", ");
    const text = `${lineup.team} lineup${lineup.formation ? ` (${lineup.formation})` : ""}: ${xi}`;
    if (!xi) continue;
    drafts.push({
      text,
      ...bundle,
      sourceRef: "lineup",
      contentIdentity: {
        kind: "lineup",
        team: lineup.team,
        formation: lineup.formation ?? null,
        startingXi: [...lineup.startingXi].slice(0, 11),
      },
    });
  }
}

function pushManualCreatorMaterial(
  drafts: RetentionGroundingClaimDraft[],
  textRaw: string | null | undefined,
  sourceRef: string,
): void {
  for (const text of splitCreatorMaterial(textRaw)) {
    drafts.push({
      text,
      provenance: "manual_user",
      verification: "unverified",
      // The creator is authoritative for the story they asked ShortForge to tell.
      // This never upgrades the statement to independently verified research.
      permittedFactualUse: true,
      forbidden: false,
      sourceRef,
      // Same semantic identity for identical creator text regardless of field.
      contentIdentity: { kind: "manual_creator", text },
    });
  }
}

function pushForbiddenClaims(
  drafts: RetentionGroundingClaimDraft[],
  plan: NarrativePlan | null | undefined,
): void {
  if (!plan) return;
  for (const claim of plan.forbiddenClaims) {
    const text = claim?.trim();
    if (!text) continue;
    drafts.push({
      text,
      provenance: "unknown",
      verification: "forbidden",
      permittedFactualUse: false,
      forbidden: true,
      sourceRef: "narrative_plan_forbidden",
      contentIdentity: { kind: "forbidden", text },
      piFactRole: "forbidden",
    });
  }
}

/**
 * Build ephemeral RetentionGroundingContext from structured PI/research inputs.
 */
export function buildRetentionGroundingContext(
  input: BuildRetentionGroundingContextInput,
): RetentionGroundingContext {
  const drafts: RetentionGroundingClaimDraft[] = [];
  const plan = input.narrativePlan ?? null;
  const useGraph = graphContextHasUsableFacts(input.graphContext);

  if (useGraph && input.graphContext) {
    pushGraphFacts(drafts, input.graphContext, plan);
    // Do not duplicate Assembled provider collections when Graph is usable.
  } else if (input.assembledContext) {
    pushAssembledProviderCollections(drafts, input.assembledContext, plan);
  }

  pushManualCreatorMaterial(drafts, input.creatorBrief, "creator_brief");
  pushManualCreatorMaterial(drafts, input.manualContext, "manual_context");
  pushManualCreatorMaterial(
    drafts,
    input.assembledContext?.manualNotes,
    "manual_notes",
  );

  pushForbiddenClaims(drafts, plan);

  return finalizeRetentionGroundingClaims(drafts);
}
