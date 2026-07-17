/**
 * Per-request NDJSON terminal gate for /api/generate-script streaming.
 * Progress may emit while open; exactly one terminal (complete|error) is accepted.
 * Duplicate terminals and progress-after-terminal are rejected (not enqueued).
 */
import type { GenerateScriptStreamEvent } from "@/types/footiebitz";

export type GenerateScriptStreamTerminalPhase = "open" | "complete" | "error";

export type StreamTerminalEmitResult =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly reason: "duplicate_terminal" | "progress_after_terminal";
    };

export interface GenerateScriptStreamTerminalController {
  readonly phase: GenerateScriptStreamTerminalPhase;
  emit(event: GenerateScriptStreamEvent): StreamTerminalEmitResult;
}

/**
 * Creates an isolated terminal controller. No module-level mutable state.
 */
export function createGenerateScriptStreamTerminalController(
  enqueue: (event: GenerateScriptStreamEvent) => void,
): GenerateScriptStreamTerminalController {
  let phase: GenerateScriptStreamTerminalPhase = "open";

  return {
    get phase() {
      return phase;
    },
    emit(event: GenerateScriptStreamEvent): StreamTerminalEmitResult {
      if (event.type === "progress") {
        if (phase !== "open") {
          return { accepted: false, reason: "progress_after_terminal" };
        }
        enqueue(event);
        return { accepted: true };
      }

      if (phase !== "open") {
        return { accepted: false, reason: "duplicate_terminal" };
      }

      phase = event.type === "complete" ? "complete" : "error";
      enqueue(event);
      return { accepted: true };
    },
  };
}
