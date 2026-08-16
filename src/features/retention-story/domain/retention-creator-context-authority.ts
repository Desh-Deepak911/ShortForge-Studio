/**
 * Ephemeral creator-context authority — Sprint 10H.4A.
 *
 * Built once from original creator inputs. Passed through planning →
 * composition → terminal validation → commit. Never serialized into
 * diagnostics, snapshots, drafts, logs, or JSON/NDJSON.
 */

import { RetentionStoryError } from "./retention-story-errors";
import {
  RETENTION_MAX_MANUAL_CONTEXT_CHARS,
  RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
} from "./retention-story-contract.constants";
import { sanitizeRetentionText } from "./normalize-story-contract";
import { buildRetentionSemanticIdentity } from "./retention-story-fingerprint";
import type { NormalizedStoryContract } from "./retention-story-contract.types";

export interface RetentionCreatorContextAuthority {
  readonly version: 1;
  readonly manualContext: string;
  readonly userInstructions: string;
  readonly manualContextIdentity: string | null;
  readonly userInstructionsIdentity: string | null;
}

function freezeAuthority(
  value: RetentionCreatorContextAuthority,
): RetentionCreatorContextAuthority {
  return Object.freeze({ ...value });
}

function sanitizeStructuredManualContext(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, RETENTION_MAX_MANUAL_CONTEXT_CHARS)
    .trim();
}

/**
 * Build detached creator-context authority from original creator inputs.
 * Research / assembled generation prose must never be supplied here.
 */
export function buildRetentionCreatorContextAuthority(input: {
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
}): RetentionCreatorContextAuthority {
  const manualContext = sanitizeStructuredManualContext(input.manualContext);
  const manualContextIdentityText = sanitizeRetentionText(
    manualContext,
    RETENTION_MAX_MANUAL_CONTEXT_CHARS,
  );
  const userInstructions = sanitizeRetentionText(
    input.userInstructions ?? "",
    RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
  );
  return freezeAuthority({
    version: 1,
    manualContext,
    userInstructions,
    manualContextIdentity: manualContextIdentityText
      ? buildRetentionSemanticIdentity({
          kind: "manual_context",
          text: manualContextIdentityText,
        })
      : null,
    userInstructionsIdentity: userInstructions
      ? buildRetentionSemanticIdentity({
          kind: "user_instructions",
          text: userInstructions,
        })
      : null,
  });
}

/**
 * Reassert creator-context authority against the active normalized contract.
 * Fail closed on missing/changed/swapped identities.
 */
export function assertRetentionCreatorContextAuthorityMatchesContract(
  authority: RetentionCreatorContextAuthority | null | undefined,
  contract: NormalizedStoryContract,
): RetentionCreatorContextAuthority {
  const expectedManual = contract.identities.manualContextIdentity;
  const expectedInstructions = contract.identities.userInstructionsIdentity;

  if (authority == null) {
    if (expectedManual != null || expectedInstructions != null) {
      throw new RetentionStoryError(
        "creator_context_identity_mismatch",
        "Creator context authority is missing for a contract that requires it.",
      );
    }
    return buildRetentionCreatorContextAuthority({});
  }

  if (authority.version !== 1) {
    throw new RetentionStoryError(
      "creator_context_identity_mismatch",
      "Creator context authority version is unsupported.",
    );
  }

  const recomputed = buildRetentionCreatorContextAuthority({
    manualContext: authority.manualContext,
    userInstructions: authority.userInstructions,
  });

  if (
    recomputed.manualContextIdentity !== authority.manualContextIdentity ||
    recomputed.userInstructionsIdentity !== authority.userInstructionsIdentity
  ) {
    throw new RetentionStoryError(
      "creator_context_identity_mismatch",
      "Creator context authority identities are inconsistent with sanitized text.",
    );
  }

  if (recomputed.manualContextIdentity !== expectedManual) {
    throw new RetentionStoryError(
      "creator_context_identity_mismatch",
      "Manual context identity does not match the normalized Story Contract.",
    );
  }
  if (recomputed.userInstructionsIdentity !== expectedInstructions) {
    throw new RetentionStoryError(
      "creator_context_identity_mismatch",
      "User instructions identity does not match the normalized Story Contract.",
    );
  }

  return freezeAuthority(recomputed);
}
