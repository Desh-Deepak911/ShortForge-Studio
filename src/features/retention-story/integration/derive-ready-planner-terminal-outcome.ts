/**
 * Pure ready-path planner / phase-order evidence from canonical ledger events.
 * Sprint 10F.1B / 10F.1C — stricter than general snapshot validation.
 */

import type {
  RetentionModelCallCategory,
  RetentionModelCallLedgerEvent,
  RetentionModelCallOutcome,
} from "../budget/retention-model-call-budget.types";

const PLANNER_TERMINALS: ReadonlySet<RetentionModelCallOutcome> = new Set([
  "succeeded",
  "failed",
  "rejected",
  "empty",
  "malformed",
]);

const LATER_PHASE_CATEGORIES: ReadonlySet<RetentionModelCallCategory> = new Set([
  "length_compression",
  "hook_repair",
  "hook_fallback",
  "retention_body_rewrite",
]);

export type ReadyPlannerTerminalOutcome =
  | "none"
  | "pending"
  | "succeeded"
  | "failed"
  | "rejected"
  | "empty"
  | "malformed"
  | "invalid";

export interface ReadyLedgerPhaseEvidence {
  readonly plannerTerminal: ReadyPlannerTerminalOutcome;
  readonly plannerAttemptSequence: number | null;
  readonly plannerSucceededSequence: number | null;
  readonly initialAttemptSequence: number | null;
  readonly initialSucceededSequence: number | null;
  /** Earliest compression / repair / fallback / rewrite / deterministic-marker sequence. */
  readonly earliestLaterPhaseSequence: number | null;
  readonly firstEvent: RetentionModelCallLedgerEvent | null;
  readonly secondEvent: RetentionModelCallLedgerEvent | null;
  readonly thirdEvent: RetentionModelCallLedgerEvent | null;
  readonly fourthEvent: RetentionModelCallLedgerEvent | null;
}

function isLaterPhaseEvent(event: RetentionModelCallLedgerEvent): boolean {
  if (event.outcome === "skipped_deterministic") {
    // Deterministic narration rescue is composition authority, not a later phase.
    if (event.category === "initial_narration") return false;
    return true;
  }
  return LATER_PHASE_CATEGORIES.has(event.category);
}

/**
 * Derive the planner terminal outcome from a canonical closed event list.
 * Does not consult counts — ready-path rules reconcile counts separately.
 */
export function deriveReadyPlannerTerminalOutcome(
  events: readonly RetentionModelCallLedgerEvent[],
): ReadyPlannerTerminalOutcome {
  const plannerEvents = events.filter((event) => event.category === "planner");
  if (plannerEvents.length === 0) return "none";

  const attempted = plannerEvents.filter((event) => event.outcome === "attempted");
  const terminals = plannerEvents.filter((event) =>
    PLANNER_TERMINALS.has(event.outcome),
  );
  const other = plannerEvents.filter(
    (event) =>
      event.outcome !== "attempted" && !PLANNER_TERMINALS.has(event.outcome),
  );

  if (other.length > 0) return "invalid";
  if (attempted.length === 0) return "invalid";
  if (attempted.length > 1) return "invalid";
  if (terminals.length === 0) return "pending";
  if (terminals.length > 1) return "invalid";

  const outcome = terminals[0]!.outcome;
  if (
    outcome === "succeeded" ||
    outcome === "failed" ||
    outcome === "rejected" ||
    outcome === "empty" ||
    outcome === "malformed"
  ) {
    return outcome;
  }
  return "invalid";
}

function firstSequence(
  events: readonly RetentionModelCallLedgerEvent[],
  category: RetentionModelCallCategory,
  outcome: RetentionModelCallOutcome,
): number | null {
  const match = events.find(
    (event) => event.category === category && event.outcome === outcome,
  );
  return match?.sequence ?? null;
}

/**
 * Retain sequence positions for ready-path lifecycle / phase-order checks.
 */
export function deriveReadyLedgerPhaseEvidence(
  events: readonly RetentionModelCallLedgerEvent[],
): ReadyLedgerPhaseEvidence {
  let earliestLaterPhaseSequence: number | null = null;
  for (const event of events) {
    if (!isLaterPhaseEvent(event)) continue;
    if (
      earliestLaterPhaseSequence == null ||
      event.sequence < earliestLaterPhaseSequence
    ) {
      earliestLaterPhaseSequence = event.sequence;
    }
  }

  return {
    plannerTerminal: deriveReadyPlannerTerminalOutcome(events),
    plannerAttemptSequence: firstSequence(events, "planner", "attempted"),
    plannerSucceededSequence: firstSequence(events, "planner", "succeeded"),
    initialAttemptSequence: firstSequence(
      events,
      "initial_narration",
      "attempted",
    ),
    initialSucceededSequence:
      firstSequence(events, "initial_narration", "succeeded") ??
      firstSequence(events, "initial_narration", "skipped_deterministic"),
    earliestLaterPhaseSequence,
    firstEvent: events[0] ?? null,
    secondEvent: events[1] ?? null,
    thirdEvent: events[2] ?? null,
    fourthEvent: events[3] ?? null,
  };
}

function isEvent(
  event: RetentionModelCallLedgerEvent | null,
  category: RetentionModelCallCategory,
  outcome: RetentionModelCallOutcome,
): boolean {
  return event != null && event.category === category && event.outcome === outcome;
}

/**
 * Ready-path lifecycle order. Does not constrain repair vs length_compression order
 * after initial narration succeeds.
 * Sprint 10H.3A — successful composition may be model `succeeded` or zero-cost
 * `skipped_deterministic` narration rescue; advisory planner terminals allowed.
 */
export function isReadyLedgerPhaseOrderValid(
  evidence: ReadyLedgerPhaseEvidence,
  qualityMode: "cheap" | "balanced" | "best",
): boolean {
  // Composition authority: model success or deterministic rescue marker.
  if (evidence.initialSucceededSequence == null) {
    return false;
  }

  // When a model attempt exists, composition authority must follow it.
  if (
    evidence.initialAttemptSequence != null &&
    evidence.initialSucceededSequence <= evidence.initialAttemptSequence
  ) {
    return false;
  }

  if (
    evidence.earliestLaterPhaseSequence != null &&
    evidence.earliestLaterPhaseSequence <= evidence.initialSucceededSequence
  ) {
    return false;
  }

  if (qualityMode === "cheap") {
    if (evidence.plannerAttemptSequence != null) return false;
    if (evidence.plannerSucceededSequence != null) return false;
    if (evidence.plannerTerminal !== "none") return false;
    // First event: model initial attempt, or pure deterministic rescue.
    if (
      !isEvent(evidence.firstEvent, "initial_narration", "attempted") &&
      !isEvent(evidence.firstEvent, "initial_narration", "skipped_deterministic")
    ) {
      return false;
    }
    return true;
  }

  if (qualityMode === "balanced" || qualityMode === "best") {
    // Planner enrichment is advisory.
    if (evidence.plannerAttemptSequence == null) {
      if (evidence.plannerTerminal !== "none") return false;
      if (
        !isEvent(evidence.firstEvent, "initial_narration", "attempted") &&
        !isEvent(
          evidence.firstEvent,
          "initial_narration",
          "skipped_deterministic",
        )
      ) {
        return false;
      }
      return true;
    }

    if (
      evidence.plannerTerminal !== "succeeded" &&
      evidence.plannerTerminal !== "malformed" &&
      evidence.plannerTerminal !== "failed" &&
      evidence.plannerTerminal !== "rejected" &&
      evidence.plannerTerminal !== "empty"
    ) {
      return false;
    }
    if (!isEvent(evidence.firstEvent, "planner", "attempted")) return false;
    // Planner terminal must close before successful composition authority.
    const plannerTerminalSequence = evidence.secondEvent?.sequence ?? null;
    if (plannerTerminalSequence == null) return false;
    if (
      !isEvent(evidence.secondEvent, "planner", "succeeded") &&
      !isEvent(evidence.secondEvent, "planner", "malformed") &&
      !isEvent(evidence.secondEvent, "planner", "failed") &&
      !isEvent(evidence.secondEvent, "planner", "rejected") &&
      !isEvent(evidence.secondEvent, "planner", "empty")
    ) {
      return false;
    }
    if (evidence.initialSucceededSequence <= plannerTerminalSequence) {
      return false;
    }
    return true;
  }

  return false;
}
