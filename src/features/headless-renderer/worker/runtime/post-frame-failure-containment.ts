/**
 * Sprint 11E Phase 2E.2D.8I — primary vs secondary post-frame failure containment.
 * Preserves the earliest real execution failure when terminal CAS attribution follows.
 */

import type { HeadlessStoreVersionDeltaClass } from "@/features/headless-renderer/control-plane/services/promotion-attribution";

import type { ClaimedRenderExecutionSubstageId } from "./claimed-render-execution-attribution";
import type { ClaimedRenderExecutionPhase } from "./execute-claimed-render";

export type SecondaryTerminalCasOutcomeClass =
  | "confirmed"
  | "unconfirmed"
  | "preserved_terminal"
  | "ownership_transferred"
  | "not_applicable";

export type PostFrameFailureContainmentSnapshot = Readonly<{
  readonly primaryExecutionSubstage: ClaimedRenderExecutionSubstageId;
  readonly primaryReasonId: string;
  readonly secondaryTerminalCasSubstage: ClaimedRenderExecutionSubstageId | null;
  readonly secondaryTerminalCasOutcome: SecondaryTerminalCasOutcomeClass;
  readonly terminalCasStoreVersionDelta: HeadlessStoreVersionDeltaClass | null;
}>;

export function classifyStoreVersionDeltaLocal(
  before: number,
  after: number,
): HeadlessStoreVersionDeltaClass {
  if (after === before) return "unchanged";
  if (after === before + 1) return "plus_one";
  return "unexpected";
}

export function mapStageAdvanceToExecutionSubstage(
  stage: "rendering" | "encoding" | "validating" | "uploading",
): ClaimedRenderExecutionSubstageId {
  switch (stage) {
    case "rendering":
      return "page_contract_ready";
    case "encoding":
    case "validating":
      return "ffmpeg_execution";
    case "uploading":
      return "artifact_upload";
    default:
      return "ffmpeg_execution";
  }
}

export function mapUploadFailureReasonToSubstage(
  reasonId: string,
): ClaimedRenderExecutionSubstageId {
  if (reasonId === "ARTIFACT_CLEANUP_UNCONFIRMED") return "cleanup";
  return "artifact_upload";
}

export function mapTerminalPhaseToSecondarySubstage(
  phase: ClaimedRenderExecutionPhase,
): ClaimedRenderExecutionSubstageId {
  switch (phase) {
    case "succeeded_cas":
      return "succeeded_cas";
    case "upload":
      return "artifact_upload";
    case "binding":
      return "artifact_finalize";
    default:
      return "terminal_failure_cas";
  }
}

export function resolvePostFrameFailureContainment(input: {
  readonly primaryExecutionSubstage: ClaimedRenderExecutionSubstageId;
  readonly primaryReasonId: string;
  readonly secondaryTerminalCasSubstage?: ClaimedRenderExecutionSubstageId | null;
  readonly secondaryTerminalCasOutcome?: SecondaryTerminalCasOutcomeClass;
  readonly storeVersionAtTerminalAttempt?: number;
  readonly storeVersionAfterTerminal?: number;
}): PostFrameFailureContainmentSnapshot {
  const secondarySubstage = input.secondaryTerminalCasSubstage ?? null;
  const secondaryOutcome =
    input.secondaryTerminalCasOutcome ?? "not_applicable";
  const terminalCasDelta =
    input.storeVersionAtTerminalAttempt != null &&
    input.storeVersionAfterTerminal != null
      ? classifyStoreVersionDeltaLocal(
          input.storeVersionAtTerminalAttempt,
          input.storeVersionAfterTerminal,
        )
      : null;

  return Object.freeze({
    primaryExecutionSubstage: input.primaryExecutionSubstage,
    primaryReasonId: input.primaryReasonId,
    secondaryTerminalCasSubstage: secondarySubstage,
    secondaryTerminalCasOutcome: secondaryOutcome,
    terminalCasStoreVersionDelta: terminalCasDelta,
  });
}

export function shouldPreservePrimaryOverSecondaryCas(
  primary: ClaimedRenderExecutionSubstageId,
  reported: ClaimedRenderExecutionSubstageId,
): boolean {
  if (reported !== "terminal_failure_cas") return false;
  return primary !== "terminal_failure_cas" && primary !== "succeeded_cas";
}

export function resolveAttributedExecutionSubstage(input: {
  readonly primaryExecutionSubstage: ClaimedRenderExecutionSubstageId;
  readonly reportedExecutionSubstage: ClaimedRenderExecutionSubstageId;
}): ClaimedRenderExecutionSubstageId {
  if (
    shouldPreservePrimaryOverSecondaryCas(
      input.primaryExecutionSubstage,
      input.reportedExecutionSubstage,
    )
  ) {
    return input.primaryExecutionSubstage;
  }
  return input.reportedExecutionSubstage;
}
