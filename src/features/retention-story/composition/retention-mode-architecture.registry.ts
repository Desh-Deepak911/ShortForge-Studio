/**
 * Script-mode narrative architecture registry — story-quality Prompt 3.
 * Defines phase obligations, not spoken templates. Never infer from topic names.
 */

import type { ScriptMode } from "@/types/footiebitz";

export const RETENTION_MODE_ARCHITECTURE_REGISTRY_VERSION =
  "retention-mode-architecture/1" as const;

export type RetentionModeArchitecturePhaseId =
  | "opening_tension"
  | "context"
  | "evidence"
  | "escalation"
  | "consequence_payoff"
  | "matchup_stakes"
  | "both_participants"
  | "form_context"
  | "decisive_conflict"
  | "result_defining_question"
  | "result_defining_opening"
  | "initial_state"
  | "turning_point"
  | "response_consequence"
  | "result_meaning"
  | "tactical_question"
  | "shape_mechanism"
  | "counter_adjustment"
  | "tactical_conclusion"
  | "player_tension"
  | "strength_weakness_evidence"
  | "role_team_consequence"
  | "judgment_or_open_question"
  | "clear_thesis"
  | "strongest_support"
  | "credible_counter"
  | "defensible_conclusion"
  | "present_significance"
  | "earlier_context"
  | "through_time_consequence"
  | "why_it_still_matters"
  | "ranking_promise"
  | "requested_membership"
  | "distinct_entry_reason"
  | "number_one_payoff";

export interface RetentionModeArchitectureDefinition {
  readonly scriptMode: ScriptMode;
  readonly phaseIds: readonly RetentionModeArchitecturePhaseId[];
  readonly phaseIntents: readonly string[];
}

const DEFINITIONS: Record<ScriptMode, RetentionModeArchitectureDefinition> = {
  story: {
    scriptMode: "story",
    phaseIds: [
      "opening_tension",
      "context",
      "evidence",
      "escalation",
      "consequence_payoff",
    ],
    phaseIntents: [
      "Open on a real tension already present in the content contract.",
      "Place that tension in the relevant situation without a planning label.",
      "Advance with contract-linked evidence, not a checklist.",
      "Escalate the same conflict rather than restarting the subject.",
      "Close on the intended consequence or a deliberately sharpened question.",
    ],
  },
  match_preview: {
    scriptMode: "match_preview",
    phaseIds: [
      "matchup_stakes",
      "both_participants",
      "form_context",
      "decisive_conflict",
      "result_defining_question",
    ],
    phaseIntents: [
      "Establish why this meeting matters before it is played.",
      "Name both required participants from the creator topic.",
      "Use only supplied form or context; do not invent results.",
      "Focus the decisive conflict the creator already framed.",
      "End on the result-defining question or unresolved payoff.",
    ],
  },
  match_recap: {
    scriptMode: "match_recap",
    phaseIds: [
      "result_defining_opening",
      "initial_state",
      "turning_point",
      "response_consequence",
      "result_meaning",
    ],
    phaseIntents: [
      "Open from the result-defining fact already in the contract.",
      "Recall the initial state without previewing an unplayed match.",
      "Identify the turning point the creator supplied.",
      "Show the response or consequence that followed.",
      "Close on what the result means, not what might happen next.",
    ],
  },
  tactical_review: {
    scriptMode: "tactical_review",
    phaseIds: [
      "tactical_question",
      "shape_mechanism",
      "evidence",
      "counter_adjustment",
      "tactical_conclusion",
    ],
    phaseIntents: [
      "Pose the tactical question present in the contract.",
      "Describe the shape or mechanism with concrete causality.",
      "Support that mechanism with supplied evidence.",
      "Include the counter or adjustment when the contract has one.",
      "Conclude tactically without generic pressure language.",
    ],
  },
  player_analysis: {
    scriptMode: "player_analysis",
    phaseIds: [
      "player_tension",
      "context",
      "strength_weakness_evidence",
      "role_team_consequence",
      "judgment_or_open_question",
    ],
    phaseIntents: [
      "Open on a player-specific tension from the contract.",
      "Give only the context needed to understand that tension.",
      "Evidence a strength or weakness the creator supplied.",
      "State the consequence for role or team.",
      "End with a judgment or open question that stays qualified.",
    ],
  },
  opinion_debate: {
    scriptMode: "opinion_debate",
    phaseIds: [
      "clear_thesis",
      "strongest_support",
      "credible_counter",
      "consequence_payoff",
      "defensible_conclusion",
    ],
    phaseIntents: [
      "State the creator thesis first.",
      "Give the strongest supporting evidence from the contract.",
      "Admit a credible counter-reading when one exists.",
      "Name the consequence of accepting the thesis.",
      "Close with a defensible, appropriately qualified conclusion.",
    ],
  },
  historical_explainer: {
    scriptMode: "historical_explainer",
    phaseIds: [
      "present_significance",
      "earlier_context",
      "turning_point",
      "through_time_consequence",
      "why_it_still_matters",
    ],
    phaseIntents: [
      "Start from why the subject matters now.",
      "Move to earlier context in chronological order.",
      "Mark the turning point the contract supplies.",
      "Trace the consequence through time.",
      "Return to why it still matters.",
    ],
  },
  top_5: {
    scriptMode: "top_5",
    phaseIds: [
      "ranking_promise",
      "requested_membership",
      "distinct_entry_reason",
      "escalation",
      "number_one_payoff",
    ],
    phaseIntents: [
      "Promise a ranking whose membership the creator already requested.",
      "Include exactly the requested entries; never merge or drop one.",
      "Give a distinct reason for every entry, preserving creator order unless ranking numbers are explicit.",
      "Let later entries escalate toward the final place.",
      "Pay off on the clear number-one entry.",
    ],
  },
};

export function getRetentionModeArchitecture(
  scriptMode: ScriptMode,
): RetentionModeArchitectureDefinition {
  const definition = DEFINITIONS[scriptMode];
  return Object.freeze({
    scriptMode: definition.scriptMode,
    phaseIds: Object.freeze([...definition.phaseIds]),
    phaseIntents: Object.freeze([...definition.phaseIntents]),
  });
}

export function listRetentionModeArchitectures(): readonly RetentionModeArchitectureDefinition[] {
  return Object.freeze(
    (Object.keys(DEFINITIONS) as ScriptMode[]).map((mode) =>
      getRetentionModeArchitecture(mode),
    ),
  );
}
