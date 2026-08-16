/**
 * Mutable recorder → frozen safe acceptance/rejection provenance.
 */

import type { RetentionSafeProviderFailure } from "../domain/retention-provider-failure.types";
import {
  freezeRetentionGenerationAcceptanceTrace,
  RETENTION_GENERATION_ACCEPTANCE_TRACE_VERSION,
  type RetentionGenerationAcceptanceTrace,
  type RetentionGenerationFinalNarrationAuthority,
  type RetentionGenerationRejectionStage,
} from "./retention-generation-acceptance-trace.types";

const ACCEPTANCE_STAGES = new Set<RetentionGenerationRejectionStage>([
  "deterministic_rescue_accepted",
  "model_narration_accepted",
  "rewrite_accepted",
]);

const RESCUE_ENTRY: RetentionGenerationRejectionStage =
  "deterministic_rescue_entered";

export interface RetentionGenerationAcceptanceTraceRecordExtras {
  readonly providerFailure?: RetentionSafeProviderFailure;
}

export interface RetentionGenerationAcceptanceTraceRecorder {
  record(
    stage: RetentionGenerationRejectionStage,
    extras?: RetentionGenerationAcceptanceTraceRecordExtras,
  ): void;
  freeze(input?: {
    readonly finalNarrationAuthority?: RetentionGenerationFinalNarrationAuthority;
    readonly boundedRewriteType?:
      | "opening_repair"
      | "ranking_payoff_repair"
      | "grounding_payoff_repair"
      | "duplicate_payoff_repair"
      | "supported_opening_promotion"
      | "duration_compression";
  }): RetentionGenerationAcceptanceTrace;
}

export function createRetentionGenerationAcceptanceTraceRecorder(): RetentionGenerationAcceptanceTraceRecorder {
  const events: Array<{
    stage: RetentionGenerationRejectionStage;
    order: number;
    providerFailure?: RetentionSafeProviderFailure;
  }> = [];
  let order = 0;
  let earliestDecisiveRejection: RetentionGenerationRejectionStage | null =
    null;
  let providerFailure: RetentionSafeProviderFailure | undefined;

  return {
    record(stage, extras) {
      events.push({
        stage,
        order: order++,
        ...(extras?.providerFailure
          ? { providerFailure: extras.providerFailure }
          : {}),
      });
      if (providerFailure == null && extras?.providerFailure) {
        providerFailure = extras.providerFailure;
      }
      if (
        earliestDecisiveRejection == null &&
        !ACCEPTANCE_STAGES.has(stage) &&
        stage !== RESCUE_ENTRY
      ) {
        earliestDecisiveRejection = stage;
      }
      if (stage === RESCUE_ENTRY && earliestDecisiveRejection == null) {
        // Rescue without a prior classified rejection still records entry;
        // leave earliest null until a decisive stage appears, or keep null.
      }
    },
    freeze(input) {
      let seenRescueEntered = false;
      let seenRescueAccepted = false;
      const deduped = events.filter((event) => {
        if (event.stage === "deterministic_rescue_entered") {
          if (seenRescueEntered) return false;
          seenRescueEntered = true;
          return true;
        }
        if (event.stage === "deterministic_rescue_accepted") {
          if (seenRescueAccepted) return false;
          seenRescueAccepted = true;
          return true;
        }
        return true;
      });
      const stages = deduped.map((e) => e.stage);
      const deterministicRescueEntered = stages.includes(
        "deterministic_rescue_entered",
      );
      const deterministicRescueAccepted = stages.includes(
        "deterministic_rescue_accepted",
      );
      const modelNarrationAccepted = stages.includes("model_narration_accepted");
      const rewriteAccepted = stages.includes("rewrite_accepted");

      let finalNarrationAuthority: RetentionGenerationFinalNarrationAuthority =
        input?.finalNarrationAuthority ?? "unavailable";
      if (input?.finalNarrationAuthority == null) {
        if (deterministicRescueAccepted) {
          finalNarrationAuthority = "deterministic_rescue";
        } else if (rewriteAccepted) {
          finalNarrationAuthority = "model_after_rewrite";
        } else if (modelNarrationAccepted) {
          finalNarrationAuthority = "model_direct";
        }
      }

      return freezeRetentionGenerationAcceptanceTrace({
        version: RETENTION_GENERATION_ACCEPTANCE_TRACE_VERSION,
        events: deduped.map((event) => ({ ...event })),
        earliestDecisiveRejection,
        finalNarrationAuthority,
        deterministicRescueEntered,
        deterministicRescueAccepted,
        modelNarrationAccepted,
        rewriteAccepted,
        ...(providerFailure ? { providerFailure } : {}),
        ...(input?.boundedRewriteType
          ? { boundedRewriteType: input.boundedRewriteType }
          : {}),
      });
    },
  };
}
